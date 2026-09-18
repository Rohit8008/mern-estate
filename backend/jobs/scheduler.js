import os from 'node:os';
import JobLock from '../models/jobLock.model.js';
import { logger } from '../utils/logger.js';

/**
 * The application's scheduler.
 *
 * Before this existed there was no scheduler at all, which is why a whole set
 * of schema fields never did anything: `task.reminders[].sent`,
 * `followUp.reminderSent`, `tenant.limits.maxImportRowsPerMonth` (which had no
 * monthly reset) and `tenant.trialEndsAt` (only ever checked lazily, when
 * somebody happened to make a request).
 *
 * Deliberately dependency-free. A cron parser buys expressiveness this app does
 * not need — jobs here run every N minutes or once a day at a given hour — and
 * every dependency is one more thing to keep current.
 *
 * Two properties matter:
 *  - **Single-firing.** Each run takes a lease in Mongo (see jobLock.model.js),
 *    so N app instances still produce one run.
 *  - **Non-overlapping.** A run that is still going holds its lease, so a slow
 *    job is skipped rather than stacked on top of itself.
 */

const INSTANCE = `${os.hostname()}:${process.pid}`;

/** @type {Map<string, {name: string, everyMs: number, dailyAt: ?string, handler: Function, leaseMs: number}>} */
const jobs = new Map();
let timer = null;
let running = false;

/**
 * Register a job.
 *
 * @param {string} name        stable id; also the lock key, so never rename casually
 * @param {object} opts
 * @param {number} [opts.everyMs]  run roughly this often
 * @param {string} [opts.dailyAt]  'HH:MM' in UTC; takes precedence over everyMs
 * @param {number} [opts.leaseMs]  how long the lease is held (default 5 min)
 * @param {Function} handler   async; receives nothing, returns a short summary string
 */
export function registerJob(name, opts, handler) {
  if (jobs.has(name)) throw new Error(`Job '${name}' is already registered`);
  if (!opts?.everyMs && !opts?.dailyAt) {
    throw new Error(`Job '${name}' needs everyMs or dailyAt`);
  }

  jobs.set(name, {
    name,
    everyMs: opts.everyMs || 0,
    dailyAt: opts.dailyAt || null,
    leaseMs: opts.leaseMs || 5 * 60_000,
    handler,
  });
}

/** Exposed for tests and for the admin system screen. */
export function registeredJobs() {
  return [...jobs.values()].map(({ name, everyMs, dailyAt }) => ({ name, everyMs, dailyAt }));
}

/** Clear the registry. Tests only. */
export function resetJobs() {
  jobs.clear();
}

/**
 * Take the lease for `job` if it is due and nobody else holds it.
 *
 * The whole decision is one atomic findOneAndUpdate: read-then-write would let
 * two instances both see a free lock and both take it.
 */
async function tryAcquire(job, now) {
  const due = nextDueFilter(job, now);
  if (!due) return null;

  try {
    return await JobLock.findOneAndUpdate(
      { name: job.name, ...due },
      {
        $set: {
          name: job.name,
          lockedUntil: new Date(now.getTime() + job.leaseMs),
          owner: INSTANCE,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    // Duplicate key means another instance created the lock in the same
    // instant. That is the lock working, not an error worth reporting.
    if (err?.code === 11000) return null;
    throw err;
  }
}

/**
 * The condition under which this job may be claimed: the lease is free AND the
 * job is actually due.
 */
function nextDueFilter(job, now) {
  const leaseFree = { $or: [{ lockedUntil: { $lte: now } }, { lockedUntil: { $exists: false } }] };

  if (job.dailyAt) {
    const [h, m] = job.dailyAt.split(':').map(Number);
    const todayAt = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m, 0, 0
    ));
    if (now < todayAt) return null; // not yet today's slot
    // Claim only if the last run was before today's slot.
    return {
      $and: [
        leaseFree,
        { $or: [{ lastRunAt: { $lt: todayAt } }, { lastRunAt: null }, { lastRunAt: { $exists: false } }] },
      ],
    };
  }

  const cutoff = new Date(now.getTime() - job.everyMs);
  return {
    $and: [
      leaseFree,
      { $or: [{ lastRunAt: { $lte: cutoff } }, { lastRunAt: null }, { lastRunAt: { $exists: false } }] },
    ],
  };
}

/**
 * `now` is threaded in rather than read from the clock so that the cadence
 * decision and the record of when the job ran agree on what time it is. Reading
 * the clock here instead made a daily job stamp wall-clock time while `tick`
 * reasoned about the time it was given, so the two disagreed and the job never
 * became due again.
 */
/**
 * Hold the lease open while the handler is still working.
 *
 * A lease is a bet on how long a job takes, and that bet is wrong the moment
 * the work grows: the reminder jobs send email, sendMail costs seconds per
 * message, and enough recipients will outrun any fixed number. When the lease
 * expires mid-run another instance claims it and the same reminders go out
 * twice.
 *
 * Renewing on a heartbeat removes the guess. The lease stays short — so a
 * process that dies still frees the job within one interval — while a job that
 * is genuinely still running keeps it.
 */
function startLeaseRenewal(job) {
  const every = Math.max(10_000, Math.floor(job.leaseMs / 3));

  const timer = setInterval(() => {
    JobLock.updateOne(
      { name: job.name, owner: INSTANCE },
      { $set: { lockedUntil: new Date(Date.now() + job.leaseMs) } }
    ).catch((err) => logger.warn('Could not renew job lease', { job: job.name, message: err.message }));
  }, every);

  // Never let the heartbeat hold the process open at shutdown.
  if (typeof timer.unref === 'function') timer.unref();
  return timer;
}

async function releaseLock(job, result, now) {
  await JobLock.updateOne(
    { name: job.name, owner: INSTANCE },
    {
      $set: {
        lastRunAt: now,
        lastResult: String(result ?? '').slice(0, 500),
        lockedUntil: new Date(0), // free it immediately; lastRunAt now gates the cadence
      },
    }
  ).catch(() => {});
}

/** One pass over every registered job. Exported so a test can drive it directly. */
export async function tick(now = new Date()) {
  const ran = [];

  for (const job of jobs.values()) {
    let lock;
    try {
      lock = await tryAcquire(job, now);
    } catch (err) {
      logger.error('Job lock failed', { job: job.name, message: err.message });
      continue;
    }
    if (!lock || lock.owner !== INSTANCE) continue;

    const started = Date.now();
    const renewal = startLeaseRenewal(job);
    try {
      const result = await job.handler();
      await releaseLock(job, result, now);
      ran.push({ name: job.name, ms: Date.now() - started, result });
      logger.info('Job finished', { job: job.name, ms: Date.now() - started, result: String(result ?? '') });
    } catch (err) {
      await releaseLock(job, `failed: ${err.message}`, now);
      logger.error('Job failed', { job: job.name, message: err.message, stack: err.stack });
    } finally {
      clearInterval(renewal);
    }
  }

  return ran;
}

/**
 * Start polling. The interval only decides granularity — whether a job is due
 * is decided per job, in the database.
 */
export function startScheduler({ intervalMs = 60_000 } = {}) {
  if (timer) return timer;

  const run = () => {
    if (running) return; // never let ticks overlap
    running = true;
    tick().catch((err) => logger.error('Scheduler tick failed', { message: err.message }))
      .finally(() => { running = false; });
  };

  timer = setInterval(run, intervalMs);
  // Do not hold the event loop open: the HTTP server decides process lifetime.
  if (typeof timer.unref === 'function') timer.unref();

  logger.info('Scheduler started', { jobs: [...jobs.keys()], intervalMs });
  return timer;
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

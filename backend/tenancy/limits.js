/**
 * Per-workspace limits.
 *
 * A plan that says "up to 25 users" and then lets a workspace create 400 is not
 * a plan, it is a suggestion. These are the checks that make `tenant.limits`
 * mean something.
 *
 * Two rules shape how they behave:
 *
 *   • Limits gate CREATION, never READS. A workspace that has gone over — after
 *     a downgrade, say — keeps full access to everything it already has. Locking
 *     an agency out of their own property register over a billing question is
 *     never the right response.
 *
 *   • The message says what to do next. "Limit exceeded" tells someone they are
 *     stuck; "You're using all 25 of your user seats — remove someone or move to
 *     Growth" tells them how to get unstuck.
 */

import { getTenant } from './tenantContext.js';
import { AppError } from '../utils/error.js';
import { logger } from '../utils/logger.js';

/** 402 rather than 403: this is "your plan doesn't cover this", not "you may not". */
export class PlanLimitError extends AppError {
  constructor(message, limit) {
    super(message, 402);
    this.name = 'PlanLimitError';
    this.limit = limit;
  }
}

/**
 * How each limit is described when it is reached. Keyed by the field on
 * `tenant.limits`, so adding a limit means adding one entry here and one call.
 */
const LIMITS = {
  maxUsers: {
    noun: 'user seats',
    hint: 'Remove a user who has left, or move to a larger plan to add more.',
  },
  maxListings: {
    noun: 'properties',
    hint: 'Archive properties you no longer need, or move to a larger plan.',
  },
  maxImportRowsPerMonth: {
    noun: 'imported rows this month',
    hint: 'The allowance resets at the start of next month, or a larger plan raises it.',
  },
  maxStorageMb: {
    noun: 'MB of storage',
    hint: 'Delete documents or images you no longer need, or move to a larger plan.',
  },
};

/** A limit of 0 or below means unlimited — an enterprise workspace with no cap. */
function capFor(tenant, key) {
  const value = tenant?.limits?.[key];
  if (value === undefined || value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Refuse when creating `adding` more would take the workspace past its cap.
 *
 * @param {string}   key      a field on tenant.limits
 * @param {Function} countFn  returns the current count; only called when a cap
 *                            exists, so an unlimited plan costs no query
 * @param {number}   adding   how many are about to be created
 */
export async function assertWithinLimit(key, countFn, adding = 1) {
  const tenant = getTenant();
  if (!tenant) return; // no workspace context (a script) — nothing to enforce

  const cap = capFor(tenant, key);
  if (cap === null) return;

  const current = await countFn();
  if (current + adding <= cap) return;

  const meta = LIMITS[key] || { noun: key, hint: 'Move to a larger plan to raise this.' };
  const remaining = Math.max(cap - current, 0);

  logger.info('Plan limit reached', {
    tenantId: String(tenant._id),
    slug: tenant.slug,
    plan: tenant.plan,
    limit: key,
    cap,
    current,
    adding,
  });

  throw new PlanLimitError(
    adding === 1
      ? `Your ${tenant.plan} plan includes ${cap.toLocaleString('en-IN')} ${meta.noun}, and all of them are in use. ${meta.hint}`
      : `Adding ${adding.toLocaleString('en-IN')} would take you past the ${cap.toLocaleString('en-IN')} ${meta.noun} in your ${tenant.plan} plan — ${remaining.toLocaleString('en-IN')} remaining. ${meta.hint}`,
    { key, cap, current, adding, remaining }
  );
}

/**
 * What a workspace is using against what it is allowed, for the settings screen.
 * Shown before anyone hits a wall, which is the point — a limit discovered at
 * the moment it blocks you is a bad experience even when the number is right.
 */
export async function getLimitUsage(tenant, counts) {
  return Object.keys(LIMITS).reduce((out, key) => {
    const cap = capFor(tenant, key);
    const used = counts[key] ?? null;
    if (used === null) return out;
    out[key] = {
      used,
      cap,
      unlimited: cap === null,
      remaining: cap === null ? null : Math.max(cap - used, 0),
      // Surfaced at 80% so an agency can act before it blocks them.
      nearLimit: cap !== null && used / cap >= 0.8,
    };
    return out;
  }, {});
}

export { LIMITS };

const MB = 1024 * 1024;

/**
 * The storage cap, checked before a file is written.
 *
 * `usedBytesFn` returns what the workspace already stores, in bytes, from
 * whatever records sizes — today that is the Document collection (`size` is
 * required there). Passed in rather than queried here so this module does not
 * import a model, which would compile a schema before the tenant plugin is
 * registered in a script.
 *
 * Whole megabytes on both sides, rounded up: the plan is sold in MB, and a
 * 300 KB photo still counts as one so the message can say "1 MB" rather than
 * "0.29". That errs towards refusing a file a few hundred KB early, never late.
 */
export async function assertStorageAvailable(bytes, usedBytesFn) {
  const adding = Math.max(1, Math.ceil(Number(bytes || 0) / MB));
  return assertWithinLimit('maxStorageMb', async () => Math.ceil(Number((await usedBytesFn()) || 0) / MB), adding);
}

// ── Monthly import allowance (maxImportRowsPerMonth) ─────────────────────────
// A separate block from the per-call checks above: an import is the one
// creation that is metered over time rather than against a standing count, so
// it needs a stored counter (models/importUsage.model.js) and a reservation
// that two concurrent imports cannot both slip through.

/** "YYYY-MM" in the workspace's own timezone, so the allowance resets on its 1st. */
export function importMonthKey(tenant, now = new Date()) {
  const timeZone = tenant?.timezone || tenant?.settings?.timezone || 'UTC';
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(now);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    if (y && m) return `${y}-${m}`;
  } catch {
    // An unknown timezone string falls through to UTC.
  }
  return now.toISOString().slice(0, 7);
}

/**
 * Reserve `rows` of this month's import allowance, atomically, before writing.
 *
 * Returns a `release(unused)` to hand back what was reserved but not written —
 * duplicates the write found late, rows the database refused — so the meter
 * counts rows that became records, not rows that were attempted.
 *
 * Atomic on purpose: "count, compare, then write" lets two imports started
 * together both see room and both proceed. The update only matches while the
 * counter has room; when it does not, the upsert collides with the unique
 * {tenantId, month} index and that collision is the refusal.
 *
 * Unlimited plans and script contexts (no workspace) reserve nothing.
 */
export async function reserveImportRows(rows, now = new Date()) {
  const noop = async () => {};
  const tenant = getTenant();
  if (!tenant || rows <= 0) return noop;

  const cap = capFor(tenant, 'maxImportRowsPerMonth');
  if (cap === null) return noop;

  // Imported lazily: limits.js is loaded by scripts and tests that must not
  // compile a model as a side effect (see CLAUDE.md, "CLI scripts").
  const { default: ImportUsage } = await import('../models/importUsage.model.js');
  // The refusal below IS the unique index, so it must exist before the first
  // reservation. init() resolves once the indexes are built and is cached.
  await ImportUsage.init();
  const month = importMonthKey(tenant, now);

  const refuse = async () => {
    const current = await ImportUsage.findOne({ month }).lean();
    const used = current?.rows || 0;
    const meta = LIMITS.maxImportRowsPerMonth;
    const remaining = Math.max(cap - used, 0);
    const err = new PlanLimitError(
      `Importing ${rows.toLocaleString('en-IN')} rows would take you past the ${cap.toLocaleString('en-IN')} ${meta.noun} in your ${tenant.plan} plan — ${remaining.toLocaleString('en-IN')} remaining. ${meta.hint}`,
      { key: 'maxImportRowsPerMonth', cap, current: used, adding: rows, remaining }
    );
    err.details = { limit: cap, used, requested: rows, remaining };
    logger.info('Plan limit reached', { tenantId: String(tenant._id), plan: tenant.plan, limit: 'maxImportRowsPerMonth', cap, used, requested: rows });
    throw err;
  };

  if (rows > cap) return refuse();

  try {
    await ImportUsage.findOneAndUpdate(
      { month, rows: { $lte: cap - rows } },
      { $inc: { rows } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    if (err?.code === 11000) return refuse();
    throw err;
  }

  return async (unused) => {
    const n = Math.max(0, Math.min(Number(unused) || 0, rows));
    if (!n) return;
    await ImportUsage.updateOne({ month }, { $inc: { rows: -n } }).catch((e) => {
      // Over-counting by a few rows is the safe direction; say so and move on.
      logger.warn('Could not release unused import allowance', { month, unused: n, message: e.message });
    });
  };
}

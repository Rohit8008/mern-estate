/**
 * The scheduler must fire each job once per cycle, not once per instance.
 *
 * The app runs under PM2 cluster mode and on Render, where more than one
 * instance is normal. Without a lease in the database every instance would fire
 * every job, so each reminder email would go out N times. These tests drive
 * `tick()` directly rather than waiting on timers.
 */

import mongoose from 'mongoose';
import { registerTenancy } from '../tenancy/tenantPlugin.js';

let registerJob, tick, resetJobs, JobLock;

beforeAll(async () => {
  registerTenancy(mongoose);
  ({ registerJob, tick, resetJobs } = await import('../jobs/scheduler.js'));
  ({ default: JobLock } = await import('../models/jobLock.model.js'));
});

beforeEach(async () => {
  resetJobs();
  await JobLock.deleteMany({});
});

describe('scheduler', () => {
  it('runs a due job', async () => {
    let runs = 0;
    registerJob('t-runs', { everyMs: 1000 }, async () => { runs += 1; return 'ok'; });

    await tick(new Date());
    expect(runs).toBe(1);
  });

  it('does not run the same job again before its interval elapses', async () => {
    let runs = 0;
    registerJob('t-interval', { everyMs: 60_000 }, async () => { runs += 1; return 'ok'; });

    const now = new Date();
    await tick(now);
    await tick(new Date(now.getTime() + 1000));

    expect(runs).toBe(1);
  });

  it('runs again once the interval has elapsed', async () => {
    let runs = 0;
    registerJob('t-again', { everyMs: 60_000 }, async () => { runs += 1; return 'ok'; });

    const now = new Date();
    await tick(now);
    await tick(new Date(now.getTime() + 61_000));

    expect(runs).toBe(2);
  });

  it('records the result so an operator can see what happened', async () => {
    registerJob('t-result', { everyMs: 1000 }, async () => 'processed 3 things');

    await tick(new Date());

    const lock = await JobLock.findOne({ name: 't-result' }).lean();
    expect(lock.lastResult).toBe('processed 3 things');
    expect(lock.lastRunAt).toBeTruthy();
  });

  it('records a failure without letting it escape the tick', async () => {
    registerJob('t-fail', { everyMs: 1000 }, async () => { throw new Error('boom'); });

    await expect(tick(new Date())).resolves.toBeDefined();

    const lock = await JobLock.findOne({ name: 't-fail' }).lean();
    expect(lock.lastResult).toContain('boom');
  });

  it('keeps a failing job on its schedule rather than retrying every tick', async () => {
    let runs = 0;
    registerJob('t-fail-cadence', { everyMs: 60_000 }, async () => {
      runs += 1;
      throw new Error('still broken');
    });

    const now = new Date();
    await tick(now);
    await tick(new Date(now.getTime() + 1000));

    expect(runs).toBe(1);
  });

  it('only lets one of two concurrent ticks run the job', async () => {
    // Two ticks racing is exactly what two app instances look like.
    let runs = 0;
    registerJob('t-race', { everyMs: 60_000 }, async () => {
      runs += 1;
      await new Promise((r) => setTimeout(r, 20));
      return 'ok';
    });

    const now = new Date();
    await Promise.all([tick(now), tick(now)]);

    expect(runs).toBe(1);
  });

  it('does not run a daily job before its slot', async () => {
    let runs = 0;
    registerJob('t-daily', { dailyAt: '23:59' }, async () => { runs += 1; return 'ok'; });

    await tick(new Date(Date.UTC(2026, 0, 1, 10, 0, 0)));
    expect(runs).toBe(0);
  });

  it('runs a daily job once after its slot, not on every later tick', async () => {
    let runs = 0;
    registerJob('t-daily-once', { dailyAt: '02:00' }, async () => { runs += 1; return 'ok'; });

    await tick(new Date(Date.UTC(2026, 0, 1, 2, 5, 0)));
    await tick(new Date(Date.UTC(2026, 0, 1, 9, 0, 0)));
    await tick(new Date(Date.UTC(2026, 0, 1, 18, 0, 0)));

    expect(runs).toBe(1);
  });

  it('runs a daily job again the next day', async () => {
    let runs = 0;
    registerJob('t-daily-next', { dailyAt: '02:00' }, async () => { runs += 1; return 'ok'; });

    await tick(new Date(Date.UTC(2026, 0, 1, 2, 5, 0)));
    await tick(new Date(Date.UTC(2026, 0, 2, 2, 5, 0)));

    expect(runs).toBe(2);
  });

  it('refuses a job with no cadence', () => {
    expect(() => registerJob('t-bad', {}, async () => {})).toThrow(/everyMs or dailyAt/);
  });

  it('refuses to register the same name twice', () => {
    registerJob('t-dup', { everyMs: 1000 }, async () => {});
    expect(() => registerJob('t-dup', { everyMs: 1000 }, async () => {})).toThrow(/already registered/);
  });
});

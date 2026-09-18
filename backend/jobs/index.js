import { registerJob, startScheduler } from './scheduler.js';
import { forEachTenant } from '../tenancy/tenantContext.js';
import { sendTaskReminders, sendFollowUpReminders } from './reminders.js';
import { resetImportUsage, sweepTrialExpiry } from './workspaceSweeps.js';
import { deliverDueWebhooks } from '../utils/webhooks.js';
import { rescoreLeads } from './leadScoring.js';
import { sweepOverdueInvoices } from '../tenancy/billing.js';
import { runDueSequenceSteps } from './sequences.js';
import { logger } from '../utils/logger.js';

/**
 * Every scheduled job in the product, registered in one place.
 *
 * Each job body runs inside `forEachTenant`, because a query with no tenant
 * context throws by design — a sweep has to enter each workspace rather than
 * querying across all of them.
 */

let registered = false;

/** Summarise a forEachTenant result for the job log line. */
function summarise(label, { results, failures }) {
  const total = results.reduce((sum, r) => sum + (Number(r.value) || 0), 0);
  const parts = [`${label}: ${total} across ${results.length} workspaces`];
  if (failures.length) {
    parts.push(`${failures.length} failed`);
    logger.warn('Job had per-workspace failures', { label, failures });
  }
  return parts.join(', ');
}

export function registerAllJobs() {
  if (registered) return;
  registered = true;

  // Reminders are time-sensitive but not to the second; five minutes keeps the
  // database load trivial while a "due at 09:00" reminder still lands at 09:00-ish.
  registerJob('task-reminders', { everyMs: 5 * 60_000 }, async () =>
    summarise('task reminders', await forEachTenant(() => sendTaskReminders()))
  );

  registerJob('followup-reminders', { everyMs: 5 * 60_000 }, async () =>
    summarise('follow-up reminders', await forEachTenant(() => sendFollowUpReminders()))
  );

  // Webhooks are the one job people watch a clock on — an automation that
  // fires "within a minute" feels live, five minutes does not.
  registerJob('webhook-delivery', { everyMs: 60_000, leaseMs: 2 * 60_000 }, async () =>
    summarise('webhooks delivered', await forEachTenant(() => deliverDueWebhooks()))
  );

  // Steps are scheduled in days, so a fifteen-minute granularity is ample and
  // keeps a "3 days later" email landing at a sensible hour rather than at
  // whatever minute the enrollment happened to be created.
  registerJob('sequence-steps', { everyMs: 15 * 60_000, leaseMs: 10 * 60_000 }, async () =>
    summarise('sequence steps fired', await forEachTenant(() => runDueSequenceSteps()))
  );

  // Once a day is enough for both of these, and 02:10 UTC keeps them clear of
  // the nightly backup window.
  registerJob('import-usage-reset', { dailyAt: '02:10' }, async () => {
    const outcome = await forEachTenant((tenant) => resetImportUsage(tenant), {
      serviceableOnly: false, // a suspended workspace still needs a clean counter
    });
    return summarise('import counters rolled', outcome);
  });

  // Overnight, because the recency factor changes by the day rather than by
  // the minute and this touches every open lead in every workspace.
  registerJob('lead-rescore', { dailyAt: '03:00', leaseMs: 15 * 60_000 }, async () =>
    summarise('leads rescored', await forEachTenant(() => rescoreLeads()))
  );

  // Invoices are vendor-side and not per workspace, so this runs once rather
  // than inside forEachTenant. It only flags: suspending an agency over a
  // billing question is a decision for a person.
  registerJob('overdue-invoice-sweep', { dailyAt: '07:30' }, async () => {
    const flagged = await sweepOverdueInvoices();
    return `${flagged} workspaces flagged past due`;
  });

  registerJob('trial-expiry-sweep', { dailyAt: '08:00' }, async () => {
    const outcome = await forEachTenant((tenant) => sweepTrialExpiry(tenant), {
      serviceableOnly: false, // the whole point is to catch ones that just lapsed
    });
    return summarise('trial notices', outcome);
  });
}

/**
 * Called once at boot. Set JOBS_ENABLED=false to run an instance that serves
 * traffic but takes no leases — useful when you want jobs confined to one host.
 */
export function startJobs() {
  if (process.env.JOBS_ENABLED === 'false') {
    logger.info('Scheduler disabled by JOBS_ENABLED=false');
    return null;
  }

  registerAllJobs();
  return startScheduler({ intervalMs: 60_000 });
}

export { registerJob, startScheduler } from './scheduler.js';

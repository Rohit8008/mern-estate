import Tenant from '../models/tenant.model.js';
import { notify, workspaceAdminIds } from '../utils/notify.js';
import { runWithoutTenantScope } from '../tenancy/tenantContext.js';

/**
 * Housekeeping that belongs to the workspace rather than to a person.
 */

/** The first instant of the current UTC month. */
function monthStart(now) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Roll the import counter into a new month.
 *
 * `limits.maxImportRowsPerMonth` was enforced against a counter nothing ever
 * reset, so "per month" was only ever "per lifetime". Runs inside each
 * workspace, so the write is scoped like any other.
 */
export async function resetImportUsage(tenant, now = new Date()) {
  const start = monthStart(now);
  const current = tenant.importUsage?.periodStart;

  if (current && current.getTime() === start.getTime()) return false;

  await runWithoutTenantScope('resetting a workspace import counter by id', () =>
    Tenant.updateOne(
      { _id: tenant._id },
      { $set: { 'importUsage.periodStart': start, 'importUsage.rows': 0 } }
    )
  );

  return true;
}

/**
 * Warn admins before a trial lapses, and once when it has.
 *
 * `trialEndsAt` was only ever consulted lazily by isServiceable(), so the first
 * anyone knew about an expiry was the workspace refusing to serve.
 */
export async function sweepTrialExpiry(tenant, now = new Date()) {
  if (tenant.status !== 'trial' || !tenant.trialEndsAt) return false;

  const msLeft = tenant.trialEndsAt.getTime() - now.getTime();
  const daysLeft = Math.ceil(msLeft / (24 * 60 * 60_000));

  // Only speak up at the points that matter, so this does not become noise the
  // admins learn to ignore.
  const milestone = [7, 3, 1].includes(daysLeft) || (msLeft <= 0 && daysLeft >= -1);
  if (!milestone) return false;

  const admins = await workspaceAdminIds();
  if (!admins.length) return false;

  await notify({
    to: admins,
    type: 'system.alert',
    title: msLeft <= 0 ? 'Your trial has ended' : `Your trial ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
    body: msLeft <= 0
      ? 'The workspace is no longer being served. Contact us to choose a plan.'
      : 'Choose a plan to keep the workspace running without interruption.',
    link: '/settings',
    entity: { type: 'tenant', id: tenant._id },
  });

  return true;
}

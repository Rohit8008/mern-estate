import { notify, workspaceAdminIds } from '../utils/notify.js';

/**
 * Housekeeping that belongs to the workspace rather than to a person.
 */

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

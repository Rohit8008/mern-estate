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

/**
 * What each plan includes.
 *
 * The limits here are the ones that were already in force (previously
 * `PLAN_LIMITS` in provisionTenant.js, which now re-exports from this file).
 * They are NOT changed: altering a figure here re-caps every live workspace on
 * that plan, which is a commercial decision rather than a refactor.
 *
 * What this adds is the rest of what a plan is — its label, its price, and a
 * way to tell a deliberate per-customer override from the plan's own figure, so
 * a negotiated seat count survives a plan change instead of being flattened.
 */

/**
 * Prices are in the smallest currency unit (paise for INR) to avoid floating
 * point money, and are per month. `null` means "talk to us" rather than free.
 */
export const PLANS = Object.freeze({
  trial: {
    label: 'Trial',
    description: 'Everything in Starter, for 14 days',
    monthlyPrice: 0,
    currency: 'INR',
    limits: {
      maxUsers: 3,
      maxListings: 250,
      maxStorageMb: 512,
      maxImportRowsPerMonth: 2000,
    },
  },
  starter: {
    label: 'Starter',
    description: 'A small team getting its property book in order',
    monthlyPrice: 249900,
    currency: 'INR',
    limits: {
      maxUsers: 10,
      maxListings: 2500,
      maxStorageMb: 2048,
      maxImportRowsPerMonth: 20000,
    },
  },
  growth: {
    label: 'Growth',
    description: 'A working agency with a sales team',
    monthlyPrice: 749900,
    currency: 'INR',
    limits: {
      maxUsers: 40,
      maxListings: 25000,
      maxStorageMb: 10240,
      maxImportRowsPerMonth: 100000,
    },
  },
  enterprise: {
    label: 'Enterprise',
    description: 'Multiple offices, negotiated terms',
    monthlyPrice: null,
    currency: 'INR',
    limits: {
      // 0 means unlimited — see assertWithinLimit in limits.js.
      maxUsers: 0,
      maxListings: 0,
      maxStorageMb: 0,
      maxImportRowsPerMonth: 0,
    },
  },
});

export const PLAN_NAMES = Object.freeze(Object.keys(PLANS));

export const isPlan = (name) => PLAN_NAMES.includes(name);

/**
 * The limits a workspace should have on a plan.
 *
 * `overrides` are the caps an operator set by hand and that must be preserved:
 * a workspace that negotiated 40 seats on Growth keeps them when the plan is
 * re-applied. Only a value that differs from the plan's own figure counts as an
 * override, so "the same as the plan" does not pin itself forever.
 */
export function limitsForPlan(plan, overrides = {}) {
  const spec = PLANS[plan] || PLANS.trial;
  const limits = { ...spec.limits };

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined || value === null) continue;
    if (!(key in limits)) continue;
    limits[key] = value;
  }

  return limits;
}

/**
 * Which of a workspace's limits differ from its plan — what an operator
 * deliberately changed, so the platform console can show it rather than making
 * someone compare two screens.
 */
export function limitOverrides(plan, limits = {}) {
  const spec = PLANS[plan] || PLANS.trial;
  const overrides = {};

  for (const [key, planValue] of Object.entries(spec.limits)) {
    const actual = limits[key];
    if (actual !== undefined && actual !== null && actual !== planValue) {
      overrides[key] = { plan: planValue, actual };
    }
  }

  return overrides;
}

/** A plan's public shape, for a pricing or upgrade screen. */
export function planSummary(name) {
  const spec = PLANS[name];
  if (!spec) return null;
  return {
    name,
    label: spec.label,
    description: spec.description,
    monthlyPrice: spec.monthlyPrice,
    currency: spec.currency,
    limits: spec.limits,
  };
}

export const allPlans = () => PLAN_NAMES.map(planSummary);

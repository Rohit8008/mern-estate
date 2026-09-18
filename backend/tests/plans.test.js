/**
 * Plans, limits and the hand-billing ledger.
 *
 * The limits in `plans.js` are the ones already in force — they were moved
 * there from provisionTenant.js, not rewritten. The first test pins that,
 * because changing one of those figures silently re-caps every live workspace
 * on that plan, which is a commercial decision rather than a refactor.
 */

import mongoose from 'mongoose';
import { registerTenancy } from '../tenancy/tenantPlugin.js';

let PLANS, PLAN_NAMES, limitsForPlan, limitOverrides, isPlan, planSummary;
let PLAN_LIMITS, applyPlan, raiseInvoice, markInvoicePaid, sweepOverdueInvoices;
let Tenant, Invoice;

beforeAll(async () => {
  registerTenancy(mongoose);
  ({ PLANS, PLAN_NAMES, limitsForPlan, limitOverrides, isPlan, planSummary } =
    await import('../tenancy/plans.js'));
  ({ PLAN_LIMITS } = await import('../tenancy/provisionTenant.js'));
  ({ applyPlan, raiseInvoice, markInvoicePaid, sweepOverdueInvoices } =
    await import('../tenancy/billing.js'));
  ({ default: Tenant } = await import('../models/tenant.model.js'));
  ({ default: Invoice } = await import('../models/invoice.model.js'));
});

beforeEach(async () => {
  await Promise.all([Tenant.collection.deleteMany({}), Invoice.collection.deleteMany({})]);
});

const makeTenant = (overrides = {}) =>
  Tenant.create({
    name: 'Acme Realty',
    slug: `acme-${Math.random().toString(36).slice(2, 8)}`,
    plan: 'starter',
    limits: limitsForPlan('starter'),
    ...overrides,
  });

describe('the plan catalogue', () => {
  it('is the same set provisionTenant exposes, with the same limits', () => {
    // Two copies of this list is exactly the drift that hid four permissions.
    expect(Object.keys(PLAN_LIMITS).sort()).toEqual([...PLAN_NAMES].sort());
    for (const name of PLAN_NAMES) {
      expect(PLAN_LIMITS[name]).toEqual(PLANS[name].limits);
    }
  });

  it('gives every plan a label, a currency and a limit set', () => {
    for (const name of PLAN_NAMES) {
      const plan = planSummary(name);
      expect(plan.label).toBeTruthy();
      expect(plan.currency).toBeTruthy();
      expect(Object.keys(plan.limits).length).toBeGreaterThan(0);
    }
  });

  it('treats enterprise as unlimited on seats and listings', () => {
    expect(PLANS.enterprise.limits.maxUsers).toBe(0);
    expect(PLANS.enterprise.limits.maxListings).toBe(0);
  });

  it('rejects a plan name that does not exist', () => {
    expect(isPlan('platinum')).toBe(false);
    expect(planSummary('platinum')).toBeNull();
  });

  it('falls back to trial for an unknown plan rather than returning nothing', () => {
    expect(limitsForPlan('made-up')).toEqual(PLANS.trial.limits);
  });
});

describe('limit overrides', () => {
  it('keeps a negotiated allowance', () => {
    expect(limitsForPlan('growth', { maxUsers: 100 }).maxUsers).toBe(100);
  });

  it('leaves the other limits on the plan figure', () => {
    const limits = limitsForPlan('growth', { maxUsers: 100 });
    expect(limits.maxListings).toBe(PLANS.growth.limits.maxListings);
  });

  it('ignores a key that is not a real limit', () => {
    expect(limitsForPlan('growth', { maxUnicorns: 5 }).maxUnicorns).toBeUndefined();
  });

  it('reports only what actually differs from the plan', () => {
    const overrides = limitOverrides('growth', {
      ...PLANS.growth.limits,
      maxUsers: 100,
    });
    expect(Object.keys(overrides)).toEqual(['maxUsers']);
    expect(overrides.maxUsers).toEqual({ plan: PLANS.growth.limits.maxUsers, actual: 100 });
  });

  it('reports nothing when a workspace is exactly on its plan', () => {
    expect(limitOverrides('starter', PLANS.starter.limits)).toEqual({});
  });
});

describe('applyPlan', () => {
  it('moves the limits with the plan', async () => {
    const tenant = await makeTenant({ plan: 'starter' });
    const after = await applyPlan(tenant._id, 'growth');

    expect(after.plan).toBe('growth');
    expect(after.limits.maxListings).toBe(PLANS.growth.limits.maxListings);
  });

  it('preserves an allowance an operator granted by hand', async () => {
    const tenant = await makeTenant({
      plan: 'starter',
      limits: { ...PLANS.starter.limits, maxUsers: 99 },
    });

    const after = await applyPlan(tenant._id, 'growth');

    expect(after.limits.maxUsers).toBe(99);
    expect(after.limits.maxListings).toBe(PLANS.growth.limits.maxListings);
  });

  it('drops the override when asked to', async () => {
    const tenant = await makeTenant({
      plan: 'starter',
      limits: { ...PLANS.starter.limits, maxUsers: 99 },
    });

    const after = await applyPlan(tenant._id, 'growth', { keepOverrides: false });
    expect(after.limits.maxUsers).toBe(PLANS.growth.limits.maxUsers);
  });

  it('ends the trial when moving to a paid plan', async () => {
    const tenant = await makeTenant({ plan: 'trial', status: 'trial' });
    const after = await applyPlan(tenant._id, 'starter');

    expect(after.status).toBe('active');
    expect(after.billing.state).toBe('active');
  });

  it('refuses a plan that does not exist', async () => {
    const tenant = await makeTenant();
    await expect(applyPlan(tenant._id, 'platinum')).rejects.toThrow(/Unknown plan/);
  });
});

describe('invoices', () => {
  it('raises one for a priced plan', async () => {
    const tenant = await makeTenant({ plan: 'growth' });
    const invoice = await raiseInvoice(tenant);

    expect(invoice.amount).toBe(PLANS.growth.monthlyPrice);
    expect(invoice.status).toBe('issued');
    expect(invoice.number).toMatch(/^INV-\d{4}-\d{4}$/);
  });

  it('does not bill a trial', async () => {
    const tenant = await makeTenant({ plan: 'trial' });
    expect(await raiseInvoice(tenant)).toBeNull();
  });

  it('does not bill enterprise off the price list', async () => {
    const tenant = await makeTenant({ plan: 'enterprise' });
    expect(await raiseInvoice(tenant)).toBeNull();
  });

  it('does not bill the same period twice', async () => {
    // The caller is a scheduled job, so this has to be idempotent.
    const tenant = await makeTenant({ plan: 'growth' });
    const first = await raiseInvoice(tenant);
    const second = await raiseInvoice(tenant);

    expect(String(second._id)).toBe(String(first._id));
    expect(await Invoice.countDocuments({ tenant: tenant._id })).toBe(1);
  });

  it('numbers invoices sequentially', async () => {
    const a = await makeTenant({ plan: 'growth' });
    const b = await makeTenant({ plan: 'growth' });

    const first = await raiseInvoice(a);
    const second = await raiseInvoice(b);

    expect(Number(second.number.slice(-4))).toBe(Number(first.number.slice(-4)) + 1);
  });

  it('records a payment and clears a past-due flag', async () => {
    const tenant = await makeTenant({ plan: 'growth', billing: { state: 'past_due' } });
    const invoice = await raiseInvoice(tenant);

    await markInvoicePaid(invoice._id, { providerRef: 'NEFT-123' });

    const afterInvoice = await Invoice.findById(invoice._id).lean();
    expect(afterInvoice.status).toBe('paid');
    expect(afterInvoice.providerRef).toBe('NEFT-123');

    const afterTenant = await Tenant.findById(tenant._id).lean();
    expect(afterTenant.billing.state).toBe('active');
  });
});

describe('sweepOverdueInvoices', () => {
  it('flags a workspace whose invoice is past its due date', async () => {
    const tenant = await makeTenant({ plan: 'growth' });
    const invoice = await raiseInvoice(tenant);
    await Invoice.updateOne({ _id: invoice._id }, { $set: { dueAt: new Date(Date.now() - 86400000) } });

    expect(await sweepOverdueInvoices()).toBe(1);

    const after = await Tenant.findById(tenant._id).lean();
    expect(after.billing.state).toBe('past_due');
  });

  it('does not suspend them — that is a decision for a person', async () => {
    const tenant = await makeTenant({ plan: 'growth', status: 'active' });
    const invoice = await raiseInvoice(tenant);
    await Invoice.updateOne({ _id: invoice._id }, { $set: { dueAt: new Date(Date.now() - 86400000) } });

    await sweepOverdueInvoices();

    const after = await Tenant.findById(tenant._id).lean();
    expect(after.status).toBe('active');
    expect(after.isServiceable?.()).not.toBe(false);
  });

  it('leaves a paid invoice alone', async () => {
    const tenant = await makeTenant({ plan: 'growth' });
    const invoice = await raiseInvoice(tenant);
    await Invoice.updateOne(
      { _id: invoice._id },
      { $set: { status: 'paid', dueAt: new Date(Date.now() - 86400000) } }
    );

    expect(await sweepOverdueInvoices()).toBe(0);
  });
});

import Invoice from '../models/invoice.model.js';
import Tenant from '../models/tenant.model.js';
import { PLANS, limitsForPlan, isPlan } from './plans.js';
import { runWithoutTenantScope } from './tenantContext.js';
import { logger } from '../utils/logger.js';

/**
 * Applying plans and recording money.
 *
 * Deliberately gateway-free. Every customer is invoiced by hand today, and
 * scaffolding a Stripe integration nobody can test would put an untested
 * payment path in the codebase and make the ledger look authoritative when it
 * is not. What this does instead is make the hand-billing legible to the
 * product: the plan decides the limits, and every invoice raised is a row.
 *
 * A gateway later writes to these same rows rather than becoming a second
 * source of truth beside them.
 */

/**
 * Put a workspace on a plan, and move its limits with it.
 *
 * Limits were entirely unrelated to the plan before: an upgrade changed a label
 * and nothing else, so an agency could pay for Growth and still be capped at
 * whatever an operator once typed.
 *
 * @param {object} opts
 * @param {boolean} [opts.keepOverrides=true] preserve caps an operator set by
 *        hand — a negotiated seat count must survive a plan change
 */
export async function applyPlan(tenantId, plan, { keepOverrides = true, actorId = null } = {}) {
  if (!isPlan(plan)) throw new Error(`Unknown plan: ${plan}`);

  const tenant = await runWithoutTenantScope('applying a plan to one workspace by id', () =>
    Tenant.findById(tenantId)
  );
  if (!tenant) throw new Error('Workspace not found');

  const previousPlan = tenant.plan;
  const overrides = keepOverrides ? (tenant.limits?.toObject?.() ?? tenant.limits ?? {}) : {};

  // Only caps that differ from the OLD plan count as deliberate overrides;
  // otherwise every workspace would pin the figures it happened to have.
  const oldPlanLimits = PLANS[previousPlan]?.limits || {};
  const deliberate = {};
  for (const [key, value] of Object.entries(overrides)) {
    if (key in oldPlanLimits && value !== oldPlanLimits[key]) deliberate[key] = value;
  }

  tenant.plan = plan;
  tenant.limits = limitsForPlan(plan, deliberate);

  // Moving onto a paid plan ends the trial; the workspace stays serviceable.
  if (plan !== 'trial') {
    tenant.billing = tenant.billing || {};
    if (tenant.billing.state === 'none' || tenant.billing.state === 'trialing') {
      tenant.billing.state = 'active';
    }
    if (tenant.status === 'trial') tenant.status = 'active';
  }

  await tenant.save();

  logger.info('Plan applied', {
    tenantId: String(tenantId),
    from: previousPlan,
    to: plan,
    overrides: Object.keys(deliberate),
    actorId,
  });

  return tenant;
}

/** INV-2026-0042. Sequential within the year, so gaps are visible. */
async function nextInvoiceNumber(now = new Date()) {
  const year = now.getUTCFullYear();
  const prefix = `INV-${year}-`;

  const last = await Invoice.findOne({ number: { $regex: `^${prefix}` } })
    .sort({ number: -1 })
    .select('number')
    .lean();

  const seq = last ? Number(last.number.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

/**
 * Raise an invoice for a workspace's current plan period.
 *
 * Idempotent per period: calling it twice for the same month returns the
 * existing invoice rather than billing the customer twice, which matters
 * because the caller is a scheduled job.
 */
export async function raiseInvoice(tenant, { periodStart, periodEnd, actorId = null } = {}) {
  const spec = PLANS[tenant.plan];
  if (!spec || spec.monthlyPrice === null || spec.monthlyPrice === 0) {
    // Trial and enterprise are not billed on a price list.
    return null;
  }

  const start = periodStart || new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const end = periodEnd || new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));

  const existing = await Invoice.findOne({ tenant: tenant._id, periodStart: start });
  if (existing) return existing;

  return Invoice.create({
    tenant: tenant._id,
    number: await nextInvoiceNumber(start),
    plan: tenant.plan,
    amount: spec.monthlyPrice,
    currency: spec.currency,
    periodStart: start,
    periodEnd: end,
    status: 'issued',
    issuedAt: new Date(),
    // Net 14 — long enough to be reasonable, short enough to notice.
    dueAt: new Date(Date.now() + 14 * 86400000),
    provider: tenant.billing?.provider || 'manual',
    createdBy: actorId,
  });
}

/** Record that an invoice was settled, however it was settled. */
export async function markInvoicePaid(invoiceId, { providerRef = '', actorId = null } = {}) {
  const invoice = await Invoice.findByIdAndUpdate(
    invoiceId,
    { $set: { status: 'paid', paidAt: new Date(), providerRef } },
    { new: true }
  );
  if (!invoice) throw new Error('Invoice not found');

  // Paying clears a past-due state; it does not by itself change the plan.
  await runWithoutTenantScope('clearing a past-due flag after payment', () =>
    Tenant.updateOne(
      { _id: invoice.tenant, 'billing.state': 'past_due' },
      { $set: { 'billing.state': 'active' } }
    )
  );

  logger.info('Invoice paid', { invoice: invoice.number, actorId });
  return invoice;
}

/**
 * Flag workspaces whose invoices have gone unpaid past their due date.
 *
 * Deliberately only flags. Suspending an agency's access over a billing
 * question is a decision for a person, not a cron job — and locking them out of
 * their own property register is never the right first move.
 */
export async function sweepOverdueInvoices(now = new Date()) {
  const overdue = await Invoice.find({ status: 'issued', dueAt: { $lt: now } })
    .select('tenant number')
    .lean();

  if (!overdue.length) return 0;

  const tenantIds = [...new Set(overdue.map((i) => String(i.tenant)))];

  await runWithoutTenantScope('flagging workspaces with overdue invoices', () =>
    Tenant.updateMany(
      { _id: { $in: tenantIds }, 'billing.state': { $ne: 'cancelled' } },
      { $set: { 'billing.state': 'past_due' } }
    )
  );

  return tenantIds.length;
}

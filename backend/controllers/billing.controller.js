import Invoice from '../models/invoice.model.js';
import Tenant from '../models/tenant.model.js';
import { allPlans, isPlan, limitOverrides, planSummary } from '../tenancy/plans.js';
import { applyPlan, raiseInvoice, markInvoicePaid } from '../tenancy/billing.js';
import { runWithoutTenantScope } from '../tenancy/tenantContext.js';
import { asyncHandler, sendSuccessResponse, NotFoundError, ValidationError } from '../utils/error.js';
import { logActivity } from '../utils/activity.js';

/**
 * Plans and invoices, for the platform operator.
 *
 * Deliberately vendor-side only. A workspace admin can see which plan they are
 * on (it is already in their tenant config) but cannot change it or see the
 * ledger — self-serve upgrades need a payment gateway, and there isn't one.
 */

/** The price list. */
export const listPlans = asyncHandler(async (req, res) => {
  sendSuccessResponse(res, { plans: allPlans() }, 'Plans');
});

/** One workspace's commercial position: plan, overrides, invoices. */
export const getTenantBilling = asyncHandler(async (req, res) => {
  const tenant = await runWithoutTenantScope('reading a workspace for the platform console', () =>
    Tenant.findById(req.params.id)
  );
  if (!tenant) throw new NotFoundError('Workspace not found');

  const invoices = await Invoice.find({ tenant: tenant._id })
    .sort({ periodStart: -1 })
    .limit(24)
    .lean();

  const limits = tenant.limits?.toObject?.() ?? tenant.limits ?? {};

  sendSuccessResponse(
    res,
    {
      plan: planSummary(tenant.plan),
      billing: tenant.billing || { state: 'none', provider: 'manual' },
      limits,
      // What an operator changed by hand, so it is visible rather than
      // requiring someone to compare two screens.
      overrides: limitOverrides(tenant.plan, limits),
      invoices,
      outstanding: invoices
        .filter((i) => i.status === 'issued')
        .reduce((sum, i) => sum + i.amount, 0),
    },
    'Billing'
  );
});

/**
 * Move a workspace onto a plan.
 *
 * The plan's limits come with it — before this, changing the plan changed a
 * label and nothing else.
 */
export const changePlan = asyncHandler(async (req, res) => {
  const { plan, keepOverrides = true } = req.body || {};
  if (!isPlan(plan)) throw new ValidationError('Unknown plan', 'plan');

  const tenant = await applyPlan(req.params.id, plan, {
    keepOverrides: keepOverrides !== false,
    actorId: req.user.id,
  });

  logActivity({
    entityType: 'tenant',
    entityId: tenant._id,
    action: 'plan_changed',
    message: `Plan changed to ${plan}`,
    meta: { plan, limits: tenant.limits },
    createdBy: req.user.id,
  }).catch(() => {});

  sendSuccessResponse(res, { plan: planSummary(tenant.plan), limits: tenant.limits }, 'Plan applied');
});

/** Raise this period's invoice by hand, which is how billing works today. */
export const createInvoice = asyncHandler(async (req, res) => {
  const tenant = await runWithoutTenantScope('raising an invoice for one workspace by id', () =>
    Tenant.findById(req.params.id)
  );
  if (!tenant) throw new NotFoundError('Workspace not found');

  const invoice = await raiseInvoice(tenant, { actorId: req.user.id });
  if (!invoice) {
    throw new ValidationError(
      `${tenant.plan} is not billed on the price list — set a paid plan first.`,
      'plan'
    );
  }

  sendSuccessResponse(res, invoice, 'Invoice raised', 201);
});

/** Record a payment received, however it arrived. */
export const payInvoice = asyncHandler(async (req, res) => {
  const invoice = await markInvoicePaid(req.params.invoiceId, {
    providerRef: String(req.body?.reference || '').slice(0, 200),
    actorId: req.user.id,
  });

  sendSuccessResponse(res, invoice, 'Recorded as paid');
});

/** Void one — raised in error, or superseded. */
export const voidInvoice = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findByIdAndUpdate(
    req.params.invoiceId,
    { $set: { status: 'void', notes: String(req.body?.reason || '').slice(0, 1000) } },
    { new: true }
  );
  if (!invoice) throw new NotFoundError('Invoice not found');

  sendSuccessResponse(res, invoice, 'Voided');
});

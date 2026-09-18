import mongoose from 'mongoose';

/**
 * What a workspace has been billed.
 *
 * There was no billing of any kind: `plan` was a label an operator typed and
 * nothing recorded that money had ever been asked for or received. That is
 * workable while every customer is invoiced by hand — which is how this is
 * actually sold today — but only if the hand-invoicing is written down
 * somewhere the product can read.
 *
 * So this is a ledger first and an integration point second. The `manual`
 * provider is the real default; a gateway can be added later by writing to the
 * same rows rather than by inventing a parallel source of truth.
 *
 * Not tenant-scoped: an invoice is about a workspace but belongs to the vendor,
 * and a suspended workspace's invoices must stay readable in the platform
 * console.
 */
const invoiceSchema = new mongoose.Schema(
  {
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },

    /** Human reference, e.g. INV-2026-0042. Unique so it can be quoted. */
    number: { type: String, required: true, unique: true, maxlength: 40 },

    plan: { type: String, required: true, maxlength: 40 },

    /** Smallest currency unit — paise for INR — so money is never a float. */
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR', maxlength: 3 },

    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },

    status: {
      type: String,
      enum: ['draft', 'issued', 'paid', 'void', 'uncollectible'],
      default: 'draft',
      index: true,
    },

    issuedAt: { type: Date, default: null },
    dueAt: { type: Date, default: null },
    paidAt: { type: Date, default: null },

    /**
     * How it was billed. `manual` means someone raised it outside the product
     * and recorded the outcome here, which is the honest default.
     */
    provider: { type: String, default: 'manual', maxlength: 40 },
    providerRef: { type: String, default: '', maxlength: 200 },

    notes: { type: String, default: '', maxlength: 1000 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, tenantScoped: false }
);

invoiceSchema.index({ tenant: 1, periodStart: -1 });
invoiceSchema.index({ status: 1, dueAt: 1 });

/** Overdue means issued, not paid, and past its due date. */
invoiceSchema.methods.isOverdue = function isOverdue(now = new Date()) {
  return this.status === 'issued' && this.dueAt && this.dueAt < now;
};

const Invoice = mongoose.model('Invoice', invoiceSchema);
export default Invoice;

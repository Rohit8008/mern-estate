import mongoose from 'mongoose';

/**
 * Where a workspace's leads come from, and what each channel costs.
 *
 * `client.source` was an unvalidated free-text box, so the same channel arrived
 * as "Facebook", "facebook" and "FB ads" and could never be totalled. Analytics
 * could count leads per source but had no cost to divide by, so there was no
 * way to answer the question that decides next month's budget: which channel
 * actually produces deals, and at what price.
 *
 * Cost is per month and per source, because that is how these are actually
 * bought — a portal subscription, a monthly ad spend.
 */
const leadSourceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },

    /** Lowercased name; what `client.source` stores, and the uniqueness key. */
    slug: { type: String, required: true, lowercase: true, trim: true, maxlength: 60, index: true },

    /** Monthly spend on this channel, in the workspace's currency. */
    monthlyCost: { type: Number, default: 0, min: 0 },

    isActive: { type: Boolean, default: true, index: true },
    description: { type: String, default: '', maxlength: 200 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// Per workspace, never global — two agencies both have "Referral".
leadSourceSchema.index({ tenantId: 1, slug: 1 }, { unique: true });

/** The set every new workspace starts with, so the field is never an empty box. */
export const DEFAULT_LEAD_SOURCES = Object.freeze([
  'Walk-in',
  'Referral',
  'Website',
  'Phone enquiry',
  'WhatsApp',
  'Property portal',
  'Social media',
  'Print advertising',
  'Hoarding',
  'Repeat client',
  'Other',
]);

const LeadSource = mongoose.model('LeadSource', leadSourceSchema);
export default LeadSource;

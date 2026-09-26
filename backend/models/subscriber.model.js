import mongoose from 'mongoose';

/**
 * Newsletter sign-ups from the old footer form. RETIRED.
 *
 * The form collected emails for a newsletter that nothing ever sent, and its
 * welcome email promised "exclusive deals" and "market insights" that did not
 * exist. Under the DPDP Act data is held for a stated purpose; there was none,
 * so the form and the endpoint are gone. The model stays only so the existing
 * rows can be found and deleted (scripts/purgeWorkspaceData.js knows it). Do
 * not add a new sign-up that writes here: a real newsletter needs a recorded
 * consent, a double opt-in and an unsubscribe link, and this schema has none.
 */

const subscriberSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address'],
    },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);


// ── Tenancy ──────────────────────────────────────────────────────────────────
// Uniqueness is per tenant, not global. The same person may subscribe to two agencies.
// A global `unique: true` would let whichever agency signed up first claim
// the name for everyone else.
subscriberSchema.index({ tenantId: 1, email: 1 }, { unique: true });

const Subscriber = mongoose.model('Subscriber', subscriberSchema);

export default Subscriber;

import mongoose from 'mongoose';

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

import mongoose from 'mongoose';

const ownerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, maxlength: 150, index: true },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      sparse: true,   // allows multiple null/missing values
      match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
      maxlength: 254,
      index: true,
    },
    phone: { type: String, default: '', maxlength: 20 },
    companyName: { type: String, default: '', maxlength: 150 },
    addressLine1: { type: String, default: '', maxlength: 200 },
    addressLine2: { type: String, default: '', maxlength: 200 },
    city: { type: String, default: '', maxlength: 100 },
    state: { type: String, default: '', maxlength: 100 },
    postalCode: { type: String, default: '', maxlength: 20 },
    country: { type: String, default: '', maxlength: 100 },
    taxId: { type: String, default: '', maxlength: 30, select: false }, // GSTIN/PAN or similar
    notes: { type: String, default: '', maxlength: 1000 },
    active: { type: Boolean, default: true, index: true },
    /** Set when a data-subject erasure removed this record's personal details. */
    erasedAt: { type: Date, default: null },
    erasedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);


// ── Tenancy ──────────────────────────────────────────────────────────────────
// Uniqueness is per tenant, not global. The same landlord may list with two agencies.
// A global `unique: true` would let whichever agency signed up first claim
// the name for everyone else.
// `$gt: ''` rather than `$ne: ''`: MongoDB rejects $ne inside a
// partialFilterExpression, but comparison operators are allowed, and every
// non-empty string sorts above the empty one. This keeps owners with no email
// out of the unique index instead of colliding on ''.
ownerSchema.index(
  { tenantId: 1, email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: 'string', $gt: '' } } }
);

const Owner = mongoose.model('Owner', ownerSchema);

export default Owner;



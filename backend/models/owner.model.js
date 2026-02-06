import mongoose from 'mongoose';

const ownerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, index: true },
    email: { type: String, default: '', index: true },
    phone: { type: String, default: '' },
    companyName: { type: String, default: '' },
    addressLine1: { type: String, default: '' },
    addressLine2: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    postalCode: { type: String, default: '' },
    country: { type: String, default: '' },
    taxId: { type: String, default: '' }, // GSTIN/PAN or similar
    notes: { type: String, default: '', maxlength: 1000 },
    active: { type: Boolean, default: true, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

const Owner = mongoose.model('Owner', ownerSchema);

export default Owner;



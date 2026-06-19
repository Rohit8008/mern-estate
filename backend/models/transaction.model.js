import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema(
  {
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', default: null, index: true },
    propertyName: { type: String, required: true, trim: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null, index: true },
    clientName: { type: String, required: true, trim: true },
    type: { type: String, enum: ['sale', 'rent', 'lease'], default: 'sale', index: true },
    amount: { type: Number, required: true, min: 0 },
    commissionPercent: { type: Number, default: 0, min: 0, max: 100 },
    commission: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed', 'cancelled'],
      default: 'pending',
      index: true,
    },
    date: { type: Date, default: Date.now, index: true },
    notes: { type: String, default: '', trim: true },
    agent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    dealRef: { type: mongoose.Schema.Types.ObjectId, default: null },
    coAgent: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null, index: true },
    coAgentName: { type: String, default: '', trim: true },
    coAgentCommissionPercent: { type: Number, default: 0, min: 0, max: 100 },
    coAgentCommission: { type: Number, default: 0, min: 0 },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

const Transaction = mongoose.model('Transaction', transactionSchema);
export default Transaction;

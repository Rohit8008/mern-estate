import mongoose from 'mongoose';

const reportTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['property_summary', 'market_analysis', 'investment_report', 'transaction_history', 'client_portfolio', 'monthly_summary'],
      default: 'property_summary',
    },
    description: { type: String, default: '' },
    sections: [{ type: String }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    usageCount: { type: Number, default: 0 },
    lastUsed: { type: Date, default: null },
  },
  { timestamps: true }
);

const ReportTemplate = mongoose.model('ReportTemplate', reportTemplateSchema);
export default ReportTemplate;

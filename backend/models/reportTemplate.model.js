import mongoose from 'mongoose';
import { REPORT_TYPES } from '../utils/reportTypes.js';

const reportTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    type: {
      type: String,
      required: true,
      enum: REPORT_TYPES,
      default: 'property_summary',
    },
    description: { type: String, default: '', maxlength: 1000 },
    sections: [{ type: String }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    usageCount: { type: Number, default: 0 },
    lastUsed: { type: Date, default: null },
  },
  { timestamps: true }
);

const ReportTemplate = mongoose.model('ReportTemplate', reportTemplateSchema);
export default ReportTemplate;

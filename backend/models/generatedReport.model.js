import mongoose from 'mongoose';

const generatedReportSchema = new mongoose.Schema(
  {
    // Template snapshot (template may be deleted later)
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReportTemplate', default: null },
    templateName: { type: String, required: true, maxlength: 200 },
    templateType: {
      type: String,
      enum: ['property_summary', 'market_analysis', 'investment_report', 'rental_report', 'comparative_analysis', 'custom'],
      default: 'property_summary',
    },
    templateSections: [{ type: String }],

    // Generation parameters (so the report can be re-generated)
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null, index: true },
    clientName: { type: String, required: true, maxlength: 200 },
    clientEmail: { type: String, default: '', match: [/^\S+@\S+\.\S+$/, 'Invalid email format'] },
    propertyName: { type: String, required: true, maxlength: 200 },
    listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', default: null, index: true },
    notes: { type: String, default: '', maxlength: 2000 },
    agentName: { type: String, default: '', maxlength: 200 },
    reportDate: { type: Date, default: null },

    // The rendered HTML — stored so it can be re-viewed without re-generating
    html: { type: String, required: true, maxlength: 500000 },

    // Status lifecycle
    status: { type: String, enum: ['draft', 'sent'], default: 'draft' },
    sentAt: { type: Date, default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// Allow searching by client/property name
generatedReportSchema.index({ tenantId: 1, createdBy: 1, createdAt: -1 });

const GeneratedReport = mongoose.model('GeneratedReport', generatedReportSchema);
export default GeneratedReport;

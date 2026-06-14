import mongoose from 'mongoose';

const generatedReportSchema = new mongoose.Schema(
  {
    // Template snapshot (template may be deleted later)
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReportTemplate', default: null },
    templateName: { type: String, required: true },
    templateType: { type: String, default: 'property_summary' },
    templateSections: [{ type: String }],

    // Generation parameters (so the report can be re-generated)
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null },
    clientName: { type: String, required: true },
    clientEmail: { type: String, default: '' },
    propertyName: { type: String, required: true },
    listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', default: null },
    notes: { type: String, default: '' },
    agentName: { type: String, default: '' },
    reportDate: { type: String, default: '' },

    // The rendered HTML — stored so it can be re-viewed without re-generating
    html: { type: String, required: true },

    // Status lifecycle
    status: { type: String, enum: ['draft', 'sent'], default: 'draft' },
    sentAt: { type: Date, default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// Allow searching by client/property name
generatedReportSchema.index({ createdBy: 1, createdAt: -1 });

const GeneratedReport = mongoose.model('GeneratedReport', generatedReportSchema);
export default GeneratedReport;

import mongoose from 'mongoose';
import { phoneKeyOf } from '../utils/phoneKey.js';
import EmailSuppression from './emailSuppression.model.js';

// Deal Pipeline Schema - tracks property deals with clients
const dealSchema = new mongoose.Schema({
  listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing' },
  stage: {
    type: String,
    enum: [
      // Professional stages (preferred)
      'new_lead',
      'contacted',
      'qualified',
      'initial_contact',
      'site_visit_scheduled',
      'site_visit_done',
      'negotiation',
      'booking_token',
      'documentation',
      'payment_pending',
      'closed_won',
      'closed_lost',
    ],
    default: 'new_lead',
  },
  value: { type: Number, default: 0 },
  type: { type: String, enum: ['sale', 'rent', 'lease'], default: 'sale' },
  expectedCloseDate: { type: Date },
  commission: {
    percentage: { type: Number, default: 0, min: 0, max: 100 },
    amount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['pending', 'partial', 'paid'],
      default: 'pending',
    },
  },
  notes: { type: String, default: '', maxlength: 2000 },
  transactionRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },
  coAgentRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null },
  coAgentName: { type: String, default: '', maxlength: 200 },
  coAgentCommission: { type: Number, default: 0 },
  coAgentCommissionPercent: { type: Number, default: 0 },
  stageHistory: [{
    stage: {
      type: String,
      enum: [
        'new_lead',
        'contacted',
        'qualified',
        'initial_contact',
        'site_visit_scheduled',
        'site_visit_done',
        'negotiation',
        'booking_token',
        'documentation',
        'payment_pending',
        'closed_won',
        'closed_lost',
      ],
    },
    changedAt: { type: Date, default: Date.now },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: String,
  }],
}, { timestamps: true });

// Follow-up Schema - tracks scheduled follow-ups
const followUpSchema = new mongoose.Schema({
  dueAt: { type: Date, required: true, index: true },
  type: {
    type: String,
    enum: ['call', 'email', 'meeting', 'site_visit', 'whatsapp', 'other'],
    default: 'call',
  },
  notes: { type: String, default: '', maxlength: 1000 },
  completed: { type: Boolean, default: false },
  completedAt: { type: Date },
  reminderSent: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Communication History Schema - logs all interactions
const communicationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['call', 'email', 'sms', 'meeting', 'whatsapp', 'site_visit', 'note'],
    required: true,
  },
  direction: {
    type: String,
    enum: ['inbound', 'outbound'],
    default: 'outbound',
  },
  summary: { type: String, required: true, maxlength: 500 },
  details: { type: String, default: '', maxlength: 5000 },
  duration: { type: Number, min: 0 }, // Duration in minutes for calls/meetings
  outcome: { type: String, default: '', maxlength: 500 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

// Main Client Schema
const clientSchema = new mongoose.Schema(
  {
    // Basic Information
    name: { type: String, required: true, trim: true, index: true, maxlength: 150 },
    email: { type: String, default: '', lowercase: true, trim: true, index: true, maxlength: 254 },
    phone: { type: String, default: '', trim: true, index: true, maxlength: 20 },
    alternatePhone: { type: String, default: '', maxlength: 20 },
    organization: { type: String, default: '', maxlength: 150 },

    // Status and Classification
    status: {
      type: String,
      enum: ['lead', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'],
      default: 'lead',
      index: true,
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
      index: true,
    },
    source: { type: String, default: '', maxlength: 100 }, // How they found us

    // Budget and Requirements
    budget: {
      min: { type: Number, default: 0 },
      max: { type: Number, default: 0 },
      currency: { type: String, default: 'INR' },
    },
    preferredLocations: [{ type: String }],
    propertyType: { type: String, default: '', maxlength: 100 }, // residential, commercial, plot, etc.
    requirements: { type: String, default: '', maxlength: 2000 },

    contactType: {
      type: String,
      enum: ['lead', 'co_agent', 'referral_partner'],
      default: 'lead',
      index: true,
    },

    // Metadata
    tags: { type: [String], default: [] },
    notes: { type: String, default: '', maxlength: 3000 },

    // Relationships
    interestedListings: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Listing', index: true }],
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // CRM Features
    deals: [dealSchema],
    followUps: [followUpSchema],
    communications: [communicationSchema],

    // Tracking
    lastContactAt: { type: Date, default: null },
    nextFollowUp: { type: Date, index: true },

    // Lead Scoring
    /**
     * How warm this lead is.
     *
     * Derived from the score unless someone sets it by hand — an agent who has
     * spoken to the person knows better than the arithmetic does, and a value
     * they chose must not be overwritten on the next recalculation.
     */
    temperature: {
      type: String,
      enum: ['hot', 'warm', 'cold'],
      default: 'cold',
      index: true,
    },
    /** True once a person has chosen the temperature, pinning it. */
    temperatureManual: { type: Boolean, default: false },
    /**
     * Set when this person's address is on the workspace's suppression list
     * (models/emailSuppression.model.js). For display: the list is what the
     * sequence runner checks, so a lead imported in bulk without this set is
     * still never emailed. Not writable through the ordinary update — the
     * validator strips it — only through utils/unsubscribe.js.
     */
    emailOptOut: {
      type: new mongoose.Schema(
        {
          at: { type: Date, required: true },
          source: { type: String, enum: ['link', 'one_click', 'agent'], required: true },
        },
        { _id: false }
      ),
      default: null,
    },

    score: { type: Number, default: 0, min: 0, max: 100, index: true },
    scoreFactors: {
      engagement: { type: Number, default: 0 },
      recency: { type: Number, default: 0 },
      budget: { type: Number, default: 0 },
      urgency: { type: Number, default: 0 },
      fit: { type: Number, default: 0 },
    },

    // Conversion Tracking
    convertedAt: { type: Date },
    lostReason: { type: String, maxlength: 500 },
    lostAt: { type: Date },

    // Soft delete
    /**
     * Workspace tags, by id.
     *
     * Referenced rather than embedded as text so a rename or recolour applies
     * everywhere at once. The older free-text `tags` array is left in place for
     * records that already carry values.
     */
    /**
     * The last ten digits of `phone`, kept for matching.
     *
     * Duplicate detection used a suffix regex — `{ phone: /9876543210$/ }` —
     * which no index can serve, so every check was a collection scan. In the
     * importer that became one scan per row inside a single $or, which on a
     * 5,000-row portal export is a self-inflicted outage.
     *
     * Derived in a pre-save hook so it cannot drift from `phone`, and indexed
     * so the same check is one lookup.
     */
    phoneKey: { type: String, default: '', index: true },

    tagIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Tag', index: true }],

    /**
     * Photos attached to the lead — a site visit, a whiteboard, a document
     * someone snapped. There was nowhere to put one; the model had no image
     * field at all.
     */
    photos: [
      new mongoose.Schema(
        {
          url: { type: String, required: true, maxlength: 2000 },
          caption: { type: String, default: '', maxlength: 200 },
          uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        },
        { timestamps: true }
      ),
    ],
    /** Set when a data-subject erasure removed this record's personal details. */
    erasedAt: { type: Date, default: null },
    erasedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// Indexes for efficient queries
clientSchema.index({ tenantId: 1, name: 'text', email: 'text', phone: 'text', notes: 'text', requirements: 'text' });
clientSchema.index({ tenantId: 1, 'deals.stage': 1 });
clientSchema.index({ tenantId: 1, 'followUps.dueAt': 1, 'followUps.completed': 1 });
clientSchema.index({ tenantId: 1, priority: 1, status: 1 });
clientSchema.index({ tenantId: 1, score: -1 });
clientSchema.index({ tenantId: 1, temperature: 1, status: 1 });
// The duplicate check: one indexed lookup rather than a regex scan per row.
clientSchema.index({ tenantId: 1, phoneKey: 1 });
clientSchema.index({ tenantId: 1, createdAt: -1 });
clientSchema.index({ tenantId: 1, assignedTo: 1, createdAt: -1 }); // the non-admin list shape

// Re-exported so `import Client, { phoneKeyOf }` keeps working; the rule itself
// lives in utils/phoneKey.js so the importer can share it without importing a model.
export { phoneKeyOf };

// Derived, never set by hand — a stored value that can disagree with the field
// it came from is worse than no stored value.
// A new lead, or a changed address, that someone already unsubscribed shows
// as unsubscribed straight away rather than after the next opt-out.
clientSchema.pre('save', async function syncEmailOptOut() {
  if (!(this.isNew || this.isModified('email')) || !this.email) return;
  const record = await EmailSuppression.findOne({ email: String(this.email).trim().toLowerCase() }).lean();
  this.emailOptOut = record ? { at: record.createdAt, source: record.source } : null;
});

clientSchema.pre('save', function syncPhoneKey(next) {
  if (this.isModified('phone') || this.isNew) {
    this.phoneKey = phoneKeyOf(this.phone);
  }
  next();
});

// Pre-save middleware to update nextFollowUp
clientSchema.pre('save', function(next) {
  // Find the next pending follow-up
  const pendingFollowUps = this.followUps.filter(f => !f.completed);
  if (pendingFollowUps.length > 0) {
    pendingFollowUps.sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
    this.nextFollowUp = pendingFollowUps[0].dueAt;
  } else {
    this.nextFollowUp = null;
  }
  next();
});

// Method to calculate lead score
clientSchema.methods.calculateScore = function() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Engagement score (based on recent communications)
  const recentComms = this.communications.filter(c =>
    new Date(c.createdAt) > thirtyDaysAgo
  );
  this.scoreFactors.engagement = Math.min(recentComms.length * 10, 30);

  // Budget score (has defined budget)
  if (this.budget.max > 0) {
    this.scoreFactors.budget = 20;
  } else {
    this.scoreFactors.budget = 0;
  }

  // Urgency score (based on priority)
  const urgencyMap = { low: 5, medium: 10, high: 20, urgent: 30 };
  this.scoreFactors.urgency = urgencyMap[this.priority] || 10;

  // Fit score (based on interested listings)
  this.scoreFactors.fit = Math.min(this.interestedListings.length * 5, 20);

  /*
   * Recency. Without this a lead that was busy six months ago and silent since
   * keeps the score it earned then, which is the opposite of what the number is
   * for — it should say "worth calling today".
   */
  const lastTouch = this.lastContactAt || this.updatedAt || this.createdAt;
  const daysSince = lastTouch ? (now - new Date(lastTouch)) / 86400000 : 999;
  this.scoreFactors.recency =
    daysSince <= 7 ? 20
      : daysSince <= 30 ? 12
      : daysSince <= 90 ? 5
      : 0;

  // Calculate total score
  const total = Object.values(this.scoreFactors).reduce((a, b) => a + (Number(b) || 0), 0);
  // The field is capped at 100 in the schema, so cap here rather than letting
  // a save fail validation on a lead that is doing well.
  this.score = Math.max(0, Math.min(100, Math.round(total)));

  // Temperature follows the score, unless a person has pinned it.
  if (!this.temperatureManual) {
    this.temperature = this.score >= 60 ? 'hot' : this.score >= 30 ? 'warm' : 'cold';
  }

  return this.score;
};

// Method to get deal summary
clientSchema.methods.getDealSummary = function() {
  const deals = this.deals || [];
  return {
    total: deals.length,
    active: deals.filter(d => !['closed_won', 'closed_lost'].includes(d.stage)).length,
    won: deals.filter(d => d.stage === 'closed_won').length,
    lost: deals.filter(d => d.stage === 'closed_lost').length,
    totalValue: deals.reduce((sum, d) => sum + (d.value || 0), 0),
    wonValue: deals.filter(d => d.stage === 'closed_won').reduce((sum, d) => sum + (d.value || 0), 0),
    totalCommission: deals.filter(d => d.stage === 'closed_won').reduce((sum, d) => sum + (d.commission?.amount || 0), 0),
  };
};

// Virtual for full contact info
clientSchema.virtual('contactInfo').get(function() {
  const parts = [];
  if (this.phone) parts.push(this.phone);
  if (this.alternatePhone) parts.push(this.alternatePhone);
  if (this.email) parts.push(this.email);
  return parts.join(' | ');
});

// Ensure virtuals are included when converting to JSON
clientSchema.set('toJSON', { virtuals: true });
clientSchema.set('toObject', { virtuals: true });

const Client = mongoose.model('Client', clientSchema);
export default Client;

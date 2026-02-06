import mongoose from 'mongoose';

// Deal Pipeline Schema - tracks property deals with clients
const dealSchema = new mongoose.Schema({
  listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing' },
  stage: {
    type: String,
    enum: [
      'initial_contact',
      'site_visit_scheduled',
      'site_visit_done',
      'negotiation',
      'documentation',
      'payment_pending',
      'closed_won',
      'closed_lost',
    ],
    default: 'initial_contact',
  },
  value: { type: Number, default: 0 },
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
  notes: { type: String, default: '' },
  stageHistory: [{
    stage: String,
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
  notes: { type: String, default: '' },
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
  outcome: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

// Main Client Schema
const clientSchema = new mongoose.Schema(
  {
    // Basic Information
    name: { type: String, required: true, trim: true, index: true },
    email: { type: String, default: '', lowercase: true, trim: true, index: true },
    phone: { type: String, default: '', trim: true, index: true },
    alternatePhone: { type: String, default: '' },
    organization: { type: String, default: '' },

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
    source: { type: String, default: '' }, // How they found us

    // Budget and Requirements
    budget: {
      min: { type: Number, default: 0 },
      max: { type: Number, default: 0 },
      currency: { type: String, default: 'INR' },
    },
    preferredLocations: [{ type: String }],
    propertyType: { type: String, default: '' }, // residential, commercial, plot, etc.
    requirements: { type: String, default: '', maxlength: 2000 },

    // Metadata
    tags: { type: [String], default: [] },
    notes: { type: String, default: '' },

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
    score: { type: Number, default: 0, index: true },
    scoreFactors: {
      engagement: { type: Number, default: 0 },
      budget: { type: Number, default: 0 },
      urgency: { type: Number, default: 0 },
      fit: { type: Number, default: 0 },
    },

    // Conversion Tracking
    convertedAt: { type: Date },
    lostReason: { type: String },
    lostAt: { type: Date },

    // Soft delete
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// Indexes for efficient queries
clientSchema.index({ name: 'text', email: 'text', phone: 'text', notes: 'text', requirements: 'text' });
clientSchema.index({ 'deals.stage': 1 });
clientSchema.index({ 'followUps.dueAt': 1, 'followUps.completed': 1 });
clientSchema.index({ priority: 1, status: 1 });
clientSchema.index({ score: -1 });
clientSchema.index({ createdAt: -1 });

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

  // Calculate total score
  this.score = Object.values(this.scoreFactors).reduce((a, b) => a + b, 0);
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

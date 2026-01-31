/**
 * Analytics Model
 *
 * Stores periodic snapshots of business metrics for faster reporting.
 * Snapshots are generated daily/weekly/monthly by a scheduled job.
 */

import mongoose from 'mongoose';

const analyticsSnapshotSchema = new mongoose.Schema({
  // Snapshot type and period
  type: {
    type: String,
    enum: ['daily', 'weekly', 'monthly'],
    required: true,
    index: true,
  },
  date: {
    type: Date,
    required: true,
    index: true,
  },
  periodStart: { type: Date },
  periodEnd: { type: Date },

  // Listing Metrics
  metrics: {
    listings: {
      total: { type: Number, default: 0 },
      new: { type: Number, default: 0 },
      active: { type: Number, default: 0 },
      avgPrice: { type: Number, default: 0 },
      avgDaysOnMarket: { type: Number, default: 0 },
      byCategory: { type: mongoose.Schema.Types.Mixed, default: {} },
      byType: { type: mongoose.Schema.Types.Mixed, default: {} },
      priceRanges: { type: mongoose.Schema.Types.Mixed, default: {} },
    },

    // Client/Lead Metrics
    clients: {
      total: { type: Number, default: 0 },
      new: { type: Number, default: 0 },
      converted: { type: Number, default: 0 },
      lost: { type: Number, default: 0 },
      conversionRate: { type: Number, default: 0 },
      avgConversionDays: { type: Number, default: 0 },
      byStatus: { type: mongoose.Schema.Types.Mixed, default: {} },
      bySource: { type: mongoose.Schema.Types.Mixed, default: {} },
      byPriority: { type: mongoose.Schema.Types.Mixed, default: {} },
    },

    // Deal Metrics
    deals: {
      total: { type: Number, default: 0 },
      new: { type: Number, default: 0 },
      closed: { type: Number, default: 0 },
      closedValue: { type: Number, default: 0 },
      avgDealSize: { type: Number, default: 0 },
      avgCloseTime: { type: Number, default: 0 },
      byStage: { type: mongoose.Schema.Types.Mixed, default: {} },
    },

    // Revenue Metrics
    revenue: {
      totalDealValue: { type: Number, default: 0 },
      totalCommission: { type: Number, default: 0 },
      pendingCommission: { type: Number, default: 0 },
      paidCommission: { type: Number, default: 0 },
      avgCommissionRate: { type: Number, default: 0 },
    },

    // Team Performance
    team: {
      activeAgents: { type: Number, default: 0 },
      topPerformers: [{
        userId: mongoose.Schema.Types.ObjectId,
        username: String,
        dealsWon: Number,
        revenue: Number,
        commission: Number,
        clientsConverted: Number,
      }],
      avgDealsPerAgent: { type: Number, default: 0 },
    },

    // Activity Metrics
    activity: {
      followUpsScheduled: { type: Number, default: 0 },
      followUpsCompleted: { type: Number, default: 0 },
      communicationsLogged: { type: Number, default: 0 },
      siteVisitsScheduled: { type: Number, default: 0 },
    },
  },

  // Generation metadata
  generatedAt: { type: Date, default: Date.now },
  generationDuration: { type: Number }, // milliseconds to generate
}, { timestamps: true });

// Compound index for efficient lookups
analyticsSnapshotSchema.index({ type: 1, date: -1 });
analyticsSnapshotSchema.index({ date: -1, type: 1 });

// Static method to get latest snapshot of a type
analyticsSnapshotSchema.statics.getLatest = async function(type = 'daily') {
  return this.findOne({ type }).sort({ date: -1 });
};

// Static method to get snapshots for a date range
analyticsSnapshotSchema.statics.getRange = async function(type, startDate, endDate) {
  return this.find({
    type,
    date: { $gte: startDate, $lte: endDate },
  }).sort({ date: 1 });
};

const AnalyticsSnapshot = mongoose.model('AnalyticsSnapshot', analyticsSnapshotSchema);
export default AnalyticsSnapshot;

/**
 * Analytics Controller
 *
 * Provides business analytics and reporting endpoints for:
 * - Property metrics
 * - Sales analytics
 * - Lead conversion reports
 * - Revenue/commission reports
 * - Agent performance
 *
 * Every query goes through utils/analyticsScope.js: whole days in the
 * workspace timezone (the end date included), soft-deleted records excluded,
 * and an employee's figures limited to their own work.
 */

import mongoose from 'mongoose';
import Listing from '../models/listing.model.js';
import Client from '../models/client.model.js';
import {
  rangeFrom,
  clientScope,
  listingScopeFor,
  DEAL_WON_AT,
  REAL_PRICE,
} from '../utils/analyticsScope.js';

const inRange = (r) => ({ $gte: r.start, $lt: r.endExclusive });

/** Answer a bad date range as a 400 with a message, not a 500. */
function fail(next, res, error) {
  if (error?.statusCode === 400) return res.status(400).json({ success: false, message: error.message });
  return next(error);
}

/** Unwind deals and attach when each was won, for range filtering. */
const unwindDealsWithWonAt = [
  { $unwind: '$deals' },
  { $addFields: { dealWonAt: DEAL_WON_AT } },
];

/**
 * Get property/listing metrics
 * GET /api/analytics/properties
 */
export const getPropertyMetrics = async (req, res, next) => {
  try {
    const range = rangeFrom(req, 30);
    const { category } = req.query;

    const matchStage = { ...listingScopeFor(req), createdAt: inRange(range) };
    if (category) matchStage.category = category;

    const [totalListings, listingsByCategory, listingsByType, priceStats, listingsOverTime] = await Promise.all([
      Listing.countDocuments(matchStage),

      // Uncategorised listings get their own row: leaving them out made one
      // categorised listing read as 100% of the book.
      Listing.aggregate([
        { $match: matchStage },
        { $group: { _id: { $ifNull: [{ $cond: [{ $eq: ['$category', ''] }, null, '$category'] }, null] }, count: { $sum: 1 }, avgPrice: { $avg: REAL_PRICE } } },
        { $lookup: { from: 'categories', localField: '_id', foreignField: 'slug', as: 'categoryInfo' } },
        { $unwind: { path: '$categoryInfo', preserveNullAndEmptyArrays: true } },
        { $project: { categoryName: { $ifNull: ['$categoryInfo.name', { $ifNull: ['$_id', 'Uncategorised'] }] }, count: 1, avgPrice: 1 } },
        { $sort: { count: -1 } },
      ]),

      Listing.aggregate([
        { $match: matchStage },
        { $group: { _id: '$type', count: { $sum: 1 }, avgPrice: { $avg: REAL_PRICE } } },
      ]),

      Listing.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: null,
            avgPrice: { $avg: REAL_PRICE },
            minPrice: { $min: REAL_PRICE },
            maxPrice: { $max: REAL_PRICE },
            totalValue: { $sum: { $ifNull: [REAL_PRICE, 0] } },
          },
        },
      ]),

      Listing.aggregate([
        { $match: matchStage },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: range.tz } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        summary: {
          total: totalListings,
          ...(priceStats[0] || { avgPrice: 0, minPrice: 0, maxPrice: 0, totalValue: 0 }),
        },
        byCategory: listingsByCategory,
        byType: listingsByType,
        trend: listingsOverTime,
        dateRange: { start: range.startYmd, end: range.endYmd },
      },
    });
  } catch (error) {
    fail(next, res, error);
  }
};

/**
 * Get sales/deals analytics
 * GET /api/analytics/sales
 *
 * By stage and the trend cover deals CREATED in the range; closed deals and
 * top deals cover deals WON in the range. Previously neither was filtered, so
 * every period showed the same all-time totals.
 */
export const getSalesAnalytics = async (req, res, next) => {
  try {
    const range = rangeFrom(req, 90);
    const scope = clientScope(req);

    const createdInRange = [{ $match: scope }, { $unwind: '$deals' }, { $match: { 'deals.createdAt': inRange(range) } }];
    const wonInRange = [
      { $match: scope },
      ...unwindDealsWithWonAt,
      { $match: { 'deals.stage': 'closed_won', dealWonAt: inRange(range) } },
    ];

    const [dealsByStage, dealsOverTime, closedDealsStats, topDeals] = await Promise.all([
      Client.aggregate([
        ...createdInRange,
        { $group: { _id: '$deals.stage', count: { $sum: 1 }, value: { $sum: '$deals.value' } } },
        { $sort: { value: -1 } },
      ]),

      Client.aggregate([
        ...createdInRange,
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$deals.createdAt', timezone: range.tz } },
            count: { $sum: 1 },
            value: { $sum: '$deals.value' },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      Client.aggregate([
        ...wonInRange,
        {
          $group: {
            _id: null,
            totalValue: { $sum: '$deals.value' },
            avgValue: { $avg: '$deals.value' },
            count: { $sum: 1 },
            totalCommission: { $sum: '$deals.commission.amount' },
          },
        },
      ]),

      Client.aggregate([
        ...wonInRange,
        { $sort: { 'deals.value': -1 } },
        { $limit: 10 },
        { $project: { clientName: '$name', dealValue: '$deals.value', commission: '$deals.commission.amount', closedAt: '$dealWonAt' } },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        byStage: dealsByStage,
        trend: dealsOverTime,
        closedDeals: closedDealsStats[0] || { totalValue: 0, avgValue: 0, count: 0, totalCommission: 0 },
        topDeals,
        dateRange: { start: range.startYmd, end: range.endYmd },
      },
    });
  } catch (error) {
    fail(next, res, error);
  }
};

/**
 * Get lead conversion funnel report
 * GET /api/analytics/leads/conversion
 */
export const getLeadConversionReport = async (req, res, next) => {
  try {
    const range = rangeFrom(req, 90);
    const scope = clientScope(req);
    const matchStage = { ...scope, createdAt: inRange(range) };

    const [leadsByStatus, leadsBySource, conversionFunnel, conversionRate, avgConversionTime, leadsOverTime] = await Promise.all([
      Client.aggregate([
        { $match: matchStage },
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      Client.aggregate([
        { $match: matchStage },
        { $group: { _id: { $cond: [{ $eq: [{ $ifNull: ['$source', ''] }, ''] }, 'Not recorded', '$source'] }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),

      Client.aggregate([
        { $match: matchStage },
        {
          $facet: {
            total: [{ $count: 'count' }],
            contacted: [{ $match: { status: { $ne: 'lead' } } }, { $count: 'count' }],
            qualified: [{ $match: { status: { $in: ['qualified', 'proposal', 'negotiation', 'won'] } } }, { $count: 'count' }],
            proposal: [{ $match: { status: { $in: ['proposal', 'negotiation', 'won'] } } }, { $count: 'count' }],
            won: [{ $match: { status: 'won' } }, { $count: 'count' }],
          },
        },
      ]),

      Client.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            converted: { $sum: { $cond: [{ $eq: ['$status', 'won'] }, 1, 0] } },
            lost: { $sum: { $cond: [{ $eq: ['$status', 'lost'] }, 1, 0] } },
          },
        },
        {
          $project: {
            total: 1,
            converted: 1,
            lost: 1,
            conversionRate: { $cond: [{ $eq: ['$total', 0] }, 0, { $multiply: [{ $divide: ['$converted', '$total'] }, 100] }] },
          },
        },
      ]),

      // Scoped and ranged too: it averaged every won client in the workspace.
      Client.aggregate([
        { $match: { ...scope, status: 'won', convertedAt: inRange(range) } },
        { $project: { conversionDays: { $divide: [{ $subtract: ['$convertedAt', '$createdAt'] }, 1000 * 60 * 60 * 24] } } },
        { $group: { _id: null, avgDays: { $avg: '$conversionDays' } } },
      ]),

      Client.aggregate([
        { $match: matchStage },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: range.tz } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        byStatus: leadsByStatus,
        bySource: leadsBySource,
        funnel: conversionFunnel[0],
        conversionRate: conversionRate[0]?.conversionRate || 0,
        avgConversionDays: Math.round(avgConversionTime[0]?.avgDays || 0),
        trend: leadsOverTime,
        dateRange: { start: range.startYmd, end: range.endYmd },
      },
    });
  } catch (error) {
    fail(next, res, error);
  }
};

/**
 * Get revenue and commission report
 * GET /api/analytics/revenue
 *
 * Revenue here is the value and commission recorded on WON DEALS in the
 * range. Money actually received is the Transactions ledger; the page says so.
 */
export const getRevenueReport = async (req, res, next) => {
  try {
    const range = rangeFrom(req, 365);
    const { groupBy = 'month' } = req.query;
    const dateFormat = groupBy === 'day' ? '%Y-%m-%d' : groupBy === 'week' ? '%G-W%V' : '%Y-%m';
    const scope = clientScope(req);

    const won = [
      { $match: scope },
      ...unwindDealsWithWonAt,
      { $match: { 'deals.stage': 'closed_won', dealWonAt: inRange(range) } },
    ];

    const [revenueOverTime, commissionByAgent, commissionByStatus, totalRevenue] = await Promise.all([
      Client.aggregate([
        ...won,
        {
          $group: {
            _id: { $dateToString: { format: dateFormat, date: '$dealWonAt', timezone: range.tz } },
            dealValue: { $sum: '$deals.value' },
            commission: { $sum: '$deals.commission.amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Scoped like the rest: an employee saw every agent's row, the admin's
      // commission included.
      Client.aggregate([
        ...won,
        {
          $group: {
            _id: '$assignedTo',
            totalDeals: { $sum: 1 },
            totalValue: { $sum: '$deals.value' },
            totalCommission: { $sum: '$deals.commission.amount' },
          },
        },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'agent' } },
        { $unwind: { path: '$agent', preserveNullAndEmptyArrays: true } },
        { $project: { agentName: '$agent.username', agentEmail: '$agent.email', totalDeals: 1, totalValue: 1, totalCommission: 1 } },
        { $sort: { totalCommission: -1 } },
        { $limit: 20 },
      ]),

      // Commission status of won deals only; open deals have no commission due.
      Client.aggregate([
        ...won,
        { $group: { _id: '$deals.commission.status', amount: { $sum: '$deals.commission.amount' }, count: { $sum: 1 } } },
      ]),

      Client.aggregate([
        ...won,
        {
          $group: {
            _id: null,
            totalDealValue: { $sum: '$deals.value' },
            totalCommission: { $sum: '$deals.commission.amount' },
            pendingCommission: { $sum: { $cond: [{ $eq: ['$deals.commission.status', 'pending'] }, '$deals.commission.amount', 0] } },
            paidCommission: { $sum: { $cond: [{ $eq: ['$deals.commission.status', 'paid'] }, '$deals.commission.amount', 0] } },
            dealCount: { $sum: 1 },
          },
        },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        trend: revenueOverTime,
        byAgent: commissionByAgent,
        byStatus: commissionByStatus,
        summary: totalRevenue[0] || { totalDealValue: 0, totalCommission: 0, pendingCommission: 0, paidCommission: 0, dealCount: 0 },
        dateRange: { start: range.startYmd, end: range.endYmd },
      },
    });
  } catch (error) {
    fail(next, res, error);
  }
};

/**
 * Get agent/team performance report
 * GET /api/analytics/agents
 */
export const getAgentPerformance = async (req, res, next) => {
  try {
    const range = rangeFrom(req, 30);
    const { agentId } = req.query;

    const scope = clientScope(req);
    // An admin may narrow to one agent; an employee is always themselves.
    if (agentId && req.user.role === 'admin') {
      if (!mongoose.isValidObjectId(agentId)) return res.status(400).json({ success: false, message: 'Unknown agent.' });
      scope.assignedTo = new mongoose.Types.ObjectId(String(agentId));
    }
    const matchStage = { ...scope, createdAt: inRange(range) };

    const [agentStats, activityStats, dealStages] = await Promise.all([
      Client.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: '$assignedTo',
            totalClients: { $sum: 1 },
            wonClients: { $sum: { $cond: [{ $eq: ['$status', 'won'] }, 1, 0] } },
            lostClients: { $sum: { $cond: [{ $eq: ['$status', 'lost'] }, 1, 0] } },
            activeClients: { $sum: { $cond: [{ $not: { $in: ['$status', ['won', 'lost']] } }, 1, 0] } },
            avgScore: { $avg: '$score' },
            totalCommunications: { $sum: { $size: { $ifNull: ['$communications', []] } } },
            totalFollowUps: { $sum: { $size: { $ifNull: ['$followUps', []] } } },
          },
        },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'agent' } },
        { $unwind: { path: '$agent', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            agentName: '$agent.username',
            agentEmail: '$agent.email',
            totalClients: 1,
            wonClients: 1,
            lostClients: 1,
            activeClients: 1,
            conversionRate: { $cond: [{ $eq: ['$totalClients', 0] }, 0, { $multiply: [{ $divide: ['$wonClients', '$totalClients'] }, 100] }] },
            avgScore: 1,
            totalCommunications: 1,
            totalFollowUps: 1,
          },
        },
        { $sort: { wonClients: -1 } },
      ]),

      Client.aggregate([
        { $match: { ...scope } },
        { $unwind: '$communications' },
        { $match: { 'communications.createdAt': inRange(range) } },
        { $group: { _id: { agent: '$assignedTo', type: '$communications.type' }, count: { $sum: 1 } } },
        { $group: { _id: '$_id.agent', activities: { $push: { type: '$_id.type', count: '$count' } }, totalActivities: { $sum: '$count' } } },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'agent' } },
        { $unwind: { path: '$agent', preserveNullAndEmptyArrays: true } },
        { $project: { agentName: '$agent.username', activities: 1, totalActivities: 1 } },
        { $sort: { totalActivities: -1 } },
      ]),

      Client.aggregate([
        { $match: matchStage },
        { $unwind: '$deals' },
        { $group: { _id: { agent: '$assignedTo', stage: '$deals.stage' }, count: { $sum: 1 }, value: { $sum: '$deals.value' } } },
        { $group: { _id: '$_id.agent', dealsByStage: { $push: { stage: '$_id.stage', count: '$count', value: '$value' } } } },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'agent' } },
        { $unwind: { path: '$agent', preserveNullAndEmptyArrays: true } },
        { $project: { agentName: '$agent.username', dealsByStage: 1 } },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        agents: agentStats,
        activities: activityStats,
        dealStages,
        dateRange: { start: range.startYmd, end: range.endYmd },
      },
    });
  } catch (error) {
    fail(next, res, error);
  }
};

/**
 * Get dashboard overview
 * GET /api/analytics/dashboard
 *
 * Two kinds of figure, kept apart: "now" snapshots (listings, active listings,
 * clients, open deals, follow-ups) and "in the range" counts (new clients,
 * deals won and their value/commission), which follow startDate/endDate.
 * Follow-ups are split into overdue and due in the next 7 days; they used to
 * be one number labelled "next 7 days" that included the overdue ones.
 */
export const getDashboardOverview = async (req, res, next) => {
  try {
    const range = rangeFrom(req, 30);
    const now = new Date();
    const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const scope = clientScope(req);
    const listings = listingScopeFor(req);

    const [listingCount, activeListingCount, clientStats, openDeals, wonStats, followUps, recentActivity] = await Promise.all([
      Listing.countDocuments(listings),
      Listing.countDocuments({ ...listings, status: { $in: ['available', 'under_negotiation'] } }),

      Client.aggregate([
        { $match: scope },
        {
          $facet: {
            total: [{ $count: 'count' }],
            new: [{ $match: { createdAt: inRange(range) } }, { $count: 'count' }],
            byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
          },
        },
      ]),

      Client.aggregate([
        { $match: scope },
        { $unwind: '$deals' },
        { $match: { 'deals.stage': { $nin: ['closed_won', 'closed_lost'] } } },
        { $group: { _id: null, count: { $sum: 1 }, value: { $sum: '$deals.value' } } },
      ]),

      Client.aggregate([
        { $match: scope },
        ...unwindDealsWithWonAt,
        { $match: { 'deals.stage': 'closed_won', dealWonAt: inRange(range) } },
        { $group: { _id: null, count: { $sum: 1 }, value: { $sum: '$deals.value' }, commission: { $sum: '$deals.commission.amount' } } },
      ]),

      Client.aggregate([
        { $match: scope },
        { $unwind: '$followUps' },
        { $match: { 'followUps.completed': { $ne: true }, 'followUps.dueAt': { $lte: weekAhead } } },
        {
          $group: {
            _id: null,
            overdue: { $sum: { $cond: [{ $lt: ['$followUps.dueAt', now] }, 1, 0] } },
            upcoming: { $sum: { $cond: [{ $gte: ['$followUps.dueAt', now] }, 1, 0] } },
          },
        },
      ]),

      Client.find(scope).sort({ updatedAt: -1 }).limit(5).select('name status updatedAt').lean(),
    ]);

    const won = wonStats[0] || { count: 0, value: 0, commission: 0 };
    const open = openDeals[0] || { count: 0, value: 0 };
    const fu = followUps[0] || { overdue: 0, upcoming: 0 };

    res.json({
      success: true,
      data: {
        listings: { total: listingCount, active: activeListingCount },
        clients: {
          total: clientStats[0]?.total?.[0]?.count || 0,
          new: clientStats[0]?.new?.[0]?.count || 0,
          byStatus: clientStats[0]?.byStatus || [],
        },
        deals: {
          activeDeals: open.count,
          pipelineValue: open.value,
          closedWon: won.count,
          totalValue: won.value,
          totalCommission: won.commission,
        },
        followUps: { overdue: fu.overdue, upcoming: fu.upcoming },
        // Kept for older clients of this endpoint: upcoming only, as labelled.
        upcomingFollowUps: fu.upcoming,
        recentActivity,
        dateRange: { start: range.startYmd, end: range.endYmd },
      },
    });
  } catch (error) {
    fail(next, res, error);
  }
};

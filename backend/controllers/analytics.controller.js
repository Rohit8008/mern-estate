/**
 * Analytics Controller
 *
 * Provides business analytics and reporting endpoints for:
 * - Property metrics
 * - Sales analytics
 * - Lead conversion reports
 * - Revenue/commission reports
 * - Agent performance
 */

import mongoose from 'mongoose';
import Listing from '../models/listing.model.js';
import Client from '../models/client.model.js';
import User from '../models/user.model.js';
import AnalyticsSnapshot from '../models/analytics.model.js';
import { NotFoundError } from '../utils/error.js';
import { logger } from '../utils/logger.js';

/**
 * Get property/listing metrics
 * GET /api/analytics/properties
 */
export const getPropertyMetrics = async (req, res, next) => {
  try {
    const { startDate, endDate, category } = req.query;
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const matchStage = { createdAt: { $gte: start, $lte: end } };
    if (category) matchStage.category = new mongoose.Types.ObjectId(category);

    const [
      totalListings,
      listingsByCategory,
      listingsByType,
      priceStats,
      listingsOverTime,
    ] = await Promise.all([
      Listing.countDocuments(matchStage),

      Listing.aggregate([
        { $match: matchStage },
        { $group: { _id: '$category', count: { $sum: 1 }, avgPrice: { $avg: '$regularPrice' } } },
        { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'categoryInfo' } },
        { $unwind: { path: '$categoryInfo', preserveNullAndEmptyArrays: true } },
        { $project: { categoryName: '$categoryInfo.name', count: 1, avgPrice: 1 } },
        { $sort: { count: -1 } },
      ]),

      Listing.aggregate([
        { $match: matchStage },
        { $group: { _id: '$type', count: { $sum: 1 }, avgPrice: { $avg: '$regularPrice' } } },
      ]),

      Listing.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: null,
            avgPrice: { $avg: '$regularPrice' },
            minPrice: { $min: '$regularPrice' },
            maxPrice: { $max: '$regularPrice' },
            totalValue: { $sum: '$regularPrice' },
          },
        },
      ]),

      Listing.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
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
        dateRange: { start, end },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get sales/deals analytics
 * GET /api/analytics/sales
 */
export const getSalesAnalytics = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const matchStage = {};
    if (req.user.role !== 'admin') {
      matchStage.assignedTo = new mongoose.Types.ObjectId(req.user.id);
    }

    const [
      dealsByStage,
      dealsOverTime,
      closedDealsStats,
      topDeals,
    ] = await Promise.all([
      Client.aggregate([
        { $match: matchStage },
        { $unwind: '$deals' },
        { $group: { _id: '$deals.stage', count: { $sum: 1 }, value: { $sum: '$deals.value' } } },
        { $sort: { value: -1 } },
      ]),

      Client.aggregate([
        { $match: matchStage },
        { $unwind: '$deals' },
        { $match: { 'deals.createdAt': { $gte: start, $lte: end } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$deals.createdAt' } },
            count: { $sum: 1 },
            value: { $sum: '$deals.value' },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      Client.aggregate([
        { $match: matchStage },
        { $unwind: '$deals' },
        { $match: { 'deals.stage': 'closed_won' } },
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
        { $match: matchStage },
        { $unwind: '$deals' },
        { $match: { 'deals.stage': 'closed_won' } },
        { $sort: { 'deals.value': -1 } },
        { $limit: 10 },
        {
          $project: {
            clientName: '$name',
            dealValue: '$deals.value',
            commission: '$deals.commission.amount',
            closedAt: '$deals.updatedAt',
          },
        },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        byStage: dealsByStage,
        trend: dealsOverTime,
        closedDeals: closedDealsStats[0] || { totalValue: 0, avgValue: 0, count: 0, totalCommission: 0 },
        topDeals,
        dateRange: { start, end },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get lead conversion funnel report
 * GET /api/analytics/leads/conversion
 */
export const getLeadConversionReport = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const matchStage = { createdAt: { $gte: start, $lte: end } };
    if (req.user.role !== 'admin') {
      matchStage.assignedTo = new mongoose.Types.ObjectId(req.user.id);
    }

    const [
      leadsByStatus,
      leadsBySource,
      conversionFunnel,
      conversionRate,
      avgConversionTime,
      leadsOverTime,
    ] = await Promise.all([
      Client.aggregate([
        { $match: matchStage },
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      Client.aggregate([
        { $match: matchStage },
        { $group: { _id: '$source', count: { $sum: 1 } } },
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
            conversionRate: {
              $cond: [
                { $eq: ['$total', 0] },
                0,
                { $multiply: [{ $divide: ['$converted', '$total'] }, 100] },
              ],
            },
          },
        },
      ]),

      Client.aggregate([
        { $match: { status: 'won', convertedAt: { $exists: true } } },
        {
          $project: {
            conversionDays: {
              $divide: [{ $subtract: ['$convertedAt', '$createdAt'] }, 1000 * 60 * 60 * 24],
            },
          },
        },
        { $group: { _id: null, avgDays: { $avg: '$conversionDays' } } },
      ]),

      Client.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
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
        dateRange: { start, end },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get revenue and commission report
 * GET /api/analytics/revenue
 */
export const getRevenueReport = async (req, res, next) => {
  try {
    const { startDate, endDate, groupBy = 'month' } = req.query;
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const dateFormat = groupBy === 'day' ? '%Y-%m-%d' : groupBy === 'week' ? '%Y-W%V' : '%Y-%m';

    const matchStage = {};
    if (req.user.role !== 'admin') {
      matchStage.assignedTo = new mongoose.Types.ObjectId(req.user.id);
    }

    const [
      revenueOverTime,
      commissionByAgent,
      commissionByStatus,
      totalRevenue,
    ] = await Promise.all([
      Client.aggregate([
        { $match: matchStage },
        { $unwind: '$deals' },
        {
          $match: {
            'deals.stage': 'closed_won',
            'deals.updatedAt': { $gte: start, $lte: end },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: dateFormat, date: '$deals.updatedAt' } },
            dealValue: { $sum: '$deals.value' },
            commission: { $sum: '$deals.commission.amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      Client.aggregate([
        { $unwind: '$deals' },
        { $match: { 'deals.stage': 'closed_won' } },
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
        {
          $project: {
            agentName: '$agent.username',
            agentEmail: '$agent.email',
            totalDeals: 1,
            totalValue: 1,
            totalCommission: 1,
          },
        },
        { $sort: { totalCommission: -1 } },
        { $limit: 20 },
      ]),

      Client.aggregate([
        { $match: matchStage },
        { $unwind: '$deals' },
        {
          $group: {
            _id: '$deals.commission.status',
            amount: { $sum: '$deals.commission.amount' },
            count: { $sum: 1 },
          },
        },
      ]),

      Client.aggregate([
        { $match: matchStage },
        { $unwind: '$deals' },
        { $match: { 'deals.stage': 'closed_won' } },
        {
          $group: {
            _id: null,
            totalDealValue: { $sum: '$deals.value' },
            totalCommission: { $sum: '$deals.commission.amount' },
            pendingCommission: {
              $sum: { $cond: [{ $eq: ['$deals.commission.status', 'pending'] }, '$deals.commission.amount', 0] },
            },
            paidCommission: {
              $sum: { $cond: [{ $eq: ['$deals.commission.status', 'paid'] }, '$deals.commission.amount', 0] },
            },
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
        summary: totalRevenue[0] || {
          totalDealValue: 0,
          totalCommission: 0,
          pendingCommission: 0,
          paidCommission: 0,
          dealCount: 0,
        },
        dateRange: { start, end },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get agent/team performance report
 * GET /api/analytics/agents
 */
export const getAgentPerformance = async (req, res, next) => {
  try {
    const { startDate, endDate, agentId } = req.query;
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const matchStage = { createdAt: { $gte: start, $lte: end } };
    if (agentId) {
      matchStage.assignedTo = new mongoose.Types.ObjectId(agentId);
    } else if (req.user.role !== 'admin') {
      matchStage.assignedTo = new mongoose.Types.ObjectId(req.user.id);
    }

    const [
      agentStats,
      activityStats,
      dealStages,
    ] = await Promise.all([
      Client.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: '$assignedTo',
            totalClients: { $sum: 1 },
            wonClients: { $sum: { $cond: [{ $eq: ['$status', 'won'] }, 1, 0] } },
            lostClients: { $sum: { $cond: [{ $eq: ['$status', 'lost'] }, 1, 0] } },
            activeClients: { $sum: { $cond: [{ $nin: ['$status', ['won', 'lost']] }, 1, 0] } },
            avgScore: { $avg: '$score' },
            totalCommunications: { $sum: { $size: '$communications' } },
            totalFollowUps: { $sum: { $size: '$followUps' } },
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
            conversionRate: {
              $cond: [
                { $eq: ['$totalClients', 0] },
                0,
                { $multiply: [{ $divide: ['$wonClients', '$totalClients'] }, 100] },
              ],
            },
            avgScore: 1,
            totalCommunications: 1,
            totalFollowUps: 1,
          },
        },
        { $sort: { wonClients: -1 } },
      ]),

      Client.aggregate([
        { $match: matchStage },
        { $unwind: { path: '$communications', preserveNullAndEmptyArrays: true } },
        { $match: { 'communications.createdAt': { $gte: start, $lte: end } } },
        {
          $group: {
            _id: { agent: '$assignedTo', type: '$communications.type' },
            count: { $sum: 1 },
          },
        },
        {
          $group: {
            _id: '$_id.agent',
            activities: { $push: { type: '$_id.type', count: '$count' } },
            totalActivities: { $sum: '$count' },
          },
        },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'agent' } },
        { $unwind: { path: '$agent', preserveNullAndEmptyArrays: true } },
        { $project: { agentName: '$agent.username', activities: 1, totalActivities: 1 } },
        { $sort: { totalActivities: -1 } },
      ]),

      Client.aggregate([
        { $match: matchStage },
        { $unwind: { path: '$deals', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: { agent: '$assignedTo', stage: '$deals.stage' },
            count: { $sum: 1 },
            value: { $sum: '$deals.value' },
          },
        },
        {
          $group: {
            _id: '$_id.agent',
            dealsByStage: { $push: { stage: '$_id.stage', count: '$count', value: '$value' } },
          },
        },
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
        dateRange: { start, end },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get dashboard overview
 * GET /api/analytics/dashboard
 */
export const getDashboardOverview = async (req, res, next) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const matchStage = {};
    if (req.user.role !== 'admin') {
      matchStage.assignedTo = new mongoose.Types.ObjectId(req.user.id);
    }

    const [
      listingCount,
      clientStats,
      dealStats,
      upcomingFollowUps,
      recentActivity,
    ] = await Promise.all([
      Listing.countDocuments(),

      Client.aggregate([
        { $match: matchStage },
        {
          $facet: {
            total: [{ $count: 'count' }],
            new: [{ $match: { createdAt: { $gte: thirtyDaysAgo } } }, { $count: 'count' }],
            byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
          },
        },
      ]),

      Client.aggregate([
        { $match: matchStage },
        { $unwind: { path: '$deals', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: null,
            totalDeals: { $sum: { $cond: [{ $ifNull: ['$deals', false] }, 1, 0] } },
            activeDeals: {
              $sum: {
                $cond: [
                  { $and: [{ $ifNull: ['$deals', false] }, { $not: { $in: ['$deals.stage', ['closed_won', 'closed_lost']] } }] },
                  1,
                  0,
                ],
              },
            },
            closedWon: { $sum: { $cond: [{ $eq: ['$deals.stage', 'closed_won'] }, 1, 0] } },
            totalValue: { $sum: { $cond: [{ $eq: ['$deals.stage', 'closed_won'] }, '$deals.value', 0] } },
            totalCommission: { $sum: { $cond: [{ $eq: ['$deals.stage', 'closed_won'] }, '$deals.commission.amount', 0] } },
          },
        },
      ]),

      Client.aggregate([
        { $match: matchStage },
        { $unwind: '$followUps' },
        {
          $match: {
            'followUps.completed': false,
            'followUps.dueAt': { $lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) },
          },
        },
        { $count: 'count' },
      ]),

      Client.find(matchStage)
        .sort({ updatedAt: -1 })
        .limit(5)
        .select('name status updatedAt')
        .lean(),
    ]);

    res.json({
      success: true,
      data: {
        listings: {
          total: listingCount,
        },
        clients: {
          total: clientStats[0]?.total?.[0]?.count || 0,
          new: clientStats[0]?.new?.[0]?.count || 0,
          byStatus: clientStats[0]?.byStatus || [],
        },
        deals: dealStats[0] || {
          totalDeals: 0,
          activeDeals: 0,
          closedWon: 0,
          totalValue: 0,
          totalCommission: 0,
        },
        upcomingFollowUps: upcomingFollowUps[0]?.count || 0,
        recentActivity,
      },
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getPropertyMetrics,
  getSalesAnalytics,
  getLeadConversionReport,
  getRevenueReport,
  getAgentPerformance,
  getDashboardOverview,
};

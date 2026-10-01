import Listing from '../models/listing.model.js';
import BuyerRequirement from '../models/buyerRequirement.model.js';
import User from '../models/user.model.js';
import { asyncHandler, sendSuccessResponse, AuthorizationError } from '../utils/error.js';
import { logger } from '../utils/logger.js';
import mongoose from 'mongoose';
import { listingScopeFor } from '../utils/analyticsScope.js';
import { getTenantScopedCache } from '../utils/cache.js';

// Dashboards are refreshed on every page open and by every open tab; the same
// numbers do not change second to second. Per workspace (tenant-scoped cache),
// per role/user, per query. Listing writes drop it (clearSearchCache), so the
// 30 s only bounds staleness from writes that do not (buyers, users).
const DASHBOARD_TTL_MS = 30_000;
const cache = getTenantScopedCache();

function dashboardCacheKey(name, req) {
  const q = req.query || {};
  const sortedQuery = Object.keys(q).sort().map((k) => `${k}=${String(q[k])}`).join('&');
  // Admins share an entry; everyone else sees their own scope.
  const who = req.user?.role === 'admin' ? 'admin' : `${req.user?.role || 'anon'}:${req.user?.id}`;
  return `dashboard:${name}:${who}:${sortedQuery}`;
}

/** Fold `[{_id: status, count}]` into `{ status: count, total }`. */
function statusCounts(rows) {
  const byStatus = {};
  let total = 0;
  for (const r of rows) {
    byStatus[r._id] = (byStatus[r._id] || 0) + r.count;
    total += r.count;
  }
  return { byStatus, total };
}

const oid = (id) => new mongoose.Types.ObjectId(String(id));

/**
 * Listings this dashboard covers: the same scope as the Properties list, with
 * ObjectIds so aggregations match. The old filter held the user id as a
 * string: countDocuments casts it, aggregate does not, so an employee's counts
 * worked while every chart on their dashboard was empty.
 */
function dashboardListingQuery(req) {
  const query = listingScopeFor(req);
  if (req.user?.role === 'admin' && req.query.agentIds) {
    const ids = String(req.query.agentIds).split(',').filter((v) => mongoose.isValidObjectId(v)).map(oid);
    if (ids.length) query.$or = [{ assignedAgent: { $in: ids } }, { userRef: { $in: ids } }];
  }
  return query;
}

function dashboardBuyerQuery(req) {
  const query = { isDeleted: { $ne: true } };
  if (req.user?.role !== 'admin') query.assignedAgent = oid(req.user.id);
  if (req.user?.role === 'admin' && req.query.agentIds) {
    const ids = String(req.query.agentIds).split(',').filter((v) => mongoose.isValidObjectId(v)).map(oid);
    if (ids.length) query.$or = [{ assignedAgent: { $in: ids } }, { createdBy: { $in: ids } }];
  }
  return query;
}

// Get dashboard analytics
export const getDashboardAnalytics = asyncHandler(async (req, res, next) => {
  const isAdmin = req.user?.role === 'admin';

  const cacheKey = dashboardCacheKey('analytics', req);
  const cached = cache.get(cacheKey);
  if (cached) return sendSuccessResponse(res, cached, 'Dashboard analytics retrieved successfully');

  const listingQuery = dashboardListingQuery(req);
  const buyerQuery = dashboardBuyerQuery(req);

  // Parallel queries for better performance
  const [
    listingStatusRows,
    buyerStatusRows,
    totalEmployees,
    activeEmployees,
    recentListings,
    recentBuyers,
    propertiesByCategory,
    propertiesByCity,
  ] = await Promise.all([
    // One pass per collection instead of five / four countDocuments that each
    // rescanned the same set. Sold and rented stay apart: they were once summed
    // and shown as "sold".
    Listing.aggregate([{ $match: listingQuery }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    BuyerRequirement.aggregate([{ $match: buyerQuery }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    // The whole team (admins and agents), matching the People list.
    isAdmin ? User.countDocuments({ role: { $in: ['admin', 'employee'] }, isDeleted: { $ne: true } }) : Promise.resolve(0),
    isAdmin ? User.countDocuments({ role: { $in: ['admin', 'employee'] }, status: 'active', isDeleted: { $ne: true } }) : Promise.resolve(0),
    Listing.find(listingQuery)
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name regularPrice city locality status createdAt')
      .lean(),
    BuyerRequirement.find(buyerQuery)
      .sort({ createdAt: -1 })
      .limit(5)
      .select('buyerName buyerPhone preferredCity status priority createdAt')
      .lean(),
    // Uncategorised listings included: without them one categorised listing
    // showed as 100% of a book of seven.
    Listing.aggregate([
      { $match: listingQuery },
      { $group: { _id: { $cond: [{ $in: [{ $ifNull: ['$category', ''] }, ['']] }, null, '$category'] }, count: { $sum: 1 } } },
      { $lookup: { from: 'categories', localField: '_id', foreignField: 'slug', as: 'cat' } },
      { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },
      { $project: { categoryName: { $ifNull: ['$cat.name', { $ifNull: ['$_id', 'Uncategorised'] }] }, count: 1 } },
      { $sort: { count: -1 } },
    ]),
    Listing.aggregate([
      { $match: { ...listingQuery, city: { $ne: '' } } },
      { $group: { _id: '$city', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
  ]);

  const listingCounts = statusCounts(listingStatusRows);
  const buyerCounts = statusCounts(buyerStatusRows);

  const analytics = {
    properties: {
      total: listingCounts.total,
      available: listingCounts.byStatus.available || 0,
      sold: listingCounts.byStatus.sold || 0,
      rented: listingCounts.byStatus.rented || 0,
      underNegotiation: listingCounts.byStatus.under_negotiation || 0,
      byCategory: propertiesByCategory,
      byCity: propertiesByCity,
    },
    buyers: {
      total: buyerCounts.total,
      active: buyerCounts.byStatus.active || 0,
      matched: buyerCounts.byStatus.matched || 0,
      closed: buyerCounts.byStatus.closed || 0,
    },
    employees: isAdmin
      ? {
          total: totalEmployees,
          active: activeEmployees,
        }
      : null,
    recent: {
      listings: recentListings,
      buyers: recentBuyers,
    },
  };

  cache.set(cacheKey, analytics, { ttlMs: DASHBOARD_TTL_MS });

  logger.info('Dashboard analytics retrieved', {
    userId: req.user.id,
    role: req.user.role,
  });

  sendSuccessResponse(res, analytics, 'Dashboard analytics retrieved successfully');
});

// Get property statistics
export const getPropertyStats = asyncHandler(async (req, res, next) => {
  const cacheKey = dashboardCacheKey('property-stats', req);
  const cached = cache.get(cacheKey);
  if (cached) return sendSuccessResponse(res, cached, 'Property statistics retrieved successfully');

  const listingQuery = dashboardListingQuery(req);

  const [
    statusBreakdown,
    categoryBreakdown,
    priceRanges,
    cityBreakdown,
    monthlyTrend,
  ] = await Promise.all([
    Listing.aggregate([
      { $match: listingQuery },
      { $group: { _id: '$status', count: { $sum: 1 }, avgPrice: { $avg: '$regularPrice' } } },
    ]),
    Listing.aggregate([
      { $match: listingQuery },
      { $group: { _id: '$propertyCategory', count: { $sum: 1 }, avgPrice: { $avg: '$regularPrice' } } },
    ]),
    Listing.aggregate([
      { $match: listingQuery },
      {
        $bucket: {
          groupBy: '$regularPrice',
          boundaries: [0, 50000, 100000, 200000, 500000, 1000000, 10000000],
          default: '1000000+',
          output: { count: { $sum: 1 } },
        },
      },
    ]),
    Listing.aggregate([
      { $match: { ...listingQuery, city: { $ne: '' } } },
      { $group: { _id: '$city', count: { $sum: 1 }, avgPrice: { $avg: '$regularPrice' } } },
      { $sort: { count: -1 } },
      { $limit: 15 },
    ]),
    Listing.aggregate([
      { $match: listingQuery },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          count: { $sum: 1 },
          avgPrice: { $avg: '$regularPrice' },
        },
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: 12 },
    ]),
  ]);

  const stats = {
    statusBreakdown,
    categoryBreakdown,
    priceRanges,
    cityBreakdown,
    monthlyTrend,
  };

  cache.set(cacheKey, stats, { ttlMs: DASHBOARD_TTL_MS });
  sendSuccessResponse(res, stats, 'Property statistics retrieved successfully');
});

// Get buyer statistics
export const getBuyerStats = asyncHandler(async (req, res, next) => {

  const buyerQuery = dashboardBuyerQuery(req);

  const [
    statusBreakdown,
    priorityBreakdown,
    propertyTypeInterestBreakdown,
    cityBreakdown,
    upcomingFollowUps,
    overdueFollowUps,
  ] = await Promise.all([
    BuyerRequirement.aggregate([
      { $match: buyerQuery },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    BuyerRequirement.aggregate([
      { $match: buyerQuery },
      { $group: { _id: '$priority', count: { $sum: 1 } } },
    ]),
    BuyerRequirement.aggregate([
      { $match: buyerQuery },
      { $group: { _id: '$propertyTypeInterest', count: { $sum: 1 } } },
    ]),
    BuyerRequirement.aggregate([
      { $match: { ...buyerQuery, preferredCity: { $ne: '' } } },
      { $group: { _id: '$preferredCity', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
    BuyerRequirement.find({
      ...buyerQuery,
      followUpDate: { $gte: new Date(), $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    })
      .sort({ followUpDate: 1 })
      .limit(10)
      .select('buyerName buyerPhone followUpDate status priority')
      .lean(),
    BuyerRequirement.find({
      ...buyerQuery,
      followUpDate: { $lt: new Date() },
      status: { $in: ['active', 'matched'] },
    })
      .sort({ followUpDate: 1 })
      .limit(10)
      .select('buyerName buyerPhone followUpDate status priority')
      .lean(),
  ]);

  const stats = {
    statusBreakdown,
    priorityBreakdown,
    propertyTypeInterestBreakdown,
    cityBreakdown,
    upcomingFollowUps,
    overdueFollowUps,
  };

  sendSuccessResponse(res, stats, 'Buyer statistics retrieved successfully');
});

// Get employee performance (Admin only)
export const getEmployeePerformance = asyncHandler(async (req, res, next) => {
  if (req.user?.role !== 'admin') {
    throw new AuthorizationError('Only admins can view employee performance');
  }

  const employees = await User.find({ role: 'employee', isDeleted: { $ne: true } })
    .select('_id username email firstName lastName')
    .lean();
  const ids = employees.map((e) => e._id);

  // Two grouped passes (one per collection) instead of four queries per
  // employee. Closed listings = sold or rented; named as such where shown.
  const [listingRows, buyerRows] = ids.length
    ? await Promise.all([
        Listing.aggregate([
          { $match: { assignedAgent: { $in: ids }, isDeleted: { $ne: true } } },
          {
            $group: {
              _id: '$assignedAgent',
              assigned: { $sum: 1 },
              sold: { $sum: { $cond: [{ $in: ['$status', ['sold', 'rented']] }, 1, 0] } },
            },
          },
        ]),
        BuyerRequirement.aggregate([
          { $match: { assignedAgent: { $in: ids }, isDeleted: { $ne: true } } },
          {
            $group: {
              _id: '$assignedAgent',
              assigned: { $sum: 1 },
              closed: { $sum: { $cond: [{ $eq: ['$status', 'closed'] }, 1, 0] } },
            },
          },
        ]),
      ])
    : [[], []];

  const listingBy = new Map(listingRows.map((r) => [String(r._id), r]));
  const buyerBy = new Map(buyerRows.map((r) => [String(r._id), r]));

  const performanceData = employees.map((employee) => {
    const l = listingBy.get(String(employee._id));
    const b = buyerBy.get(String(employee._id));
    const assignedListings = l?.assigned || 0;
    const soldListings = l?.sold || 0;
    return {
      employee: {
        id: employee._id,
        username: employee.username,
        email: employee.email,
        name: `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || employee.username,
      },
      stats: {
        assignedListings,
        soldListings,
        assignedBuyers: b?.assigned || 0,
        closedBuyers: b?.closed || 0,
        conversionRate: assignedListings > 0 ? ((soldListings / assignedListings) * 100).toFixed(2) : 0,
      },
    };
  });

  sendSuccessResponse(res, performanceData, 'Employee performance retrieved successfully');
});

// Get activity log (recent actions)
export const getActivityLog = asyncHandler(async (req, res, next) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const isAdmin = req.user?.role === 'admin';

  // Get recent listings
  const listingQuery = { isDeleted: false };
  if (!isAdmin) {
    listingQuery.$or = [{ userRef: req.user.id }, { assignedAgent: req.user.id }];
  }

  const recentListings = await Listing.find(listingQuery)
    .sort({ createdAt: -1 })
    .limit(limit)
    .select('name city status createdAt userRef assignedAgent')
    .populate('assignedAgent', 'username firstName lastName')
    .lean();

  const buyerQuery2 = { isDeleted: { $ne: true } };
  if (!isAdmin) {
    buyerQuery2.$or = [{ createdBy: req.user.id }, { assignedAgent: req.user.id }];
  }

  const recentBuyers = await BuyerRequirement.find(buyerQuery2)
    .sort({ createdAt: -1 })
    .limit(limit)
    .select('buyerName status createdAt createdBy assignedAgent')
    .populate('createdBy', 'username firstName lastName')
    .populate('assignedAgent', 'username firstName lastName')
    .lean();

  // Combine and sort by date
  const activities = [
    ...recentListings.map((l) => ({
      type: 'listing',
      action: 'created',
      data: l,
      timestamp: l.createdAt,
    })),
    ...recentBuyers.map((b) => ({
      type: 'buyer',
      action: 'created',
      data: b,
      timestamp: b.createdAt,
    })),
  ]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);

  sendSuccessResponse(res, activities, 'Activity log retrieved successfully');
});

import Listing from '../models/listing.model.js';
import BuyerRequirement from '../models/buyerRequirement.model.js';
import User from '../models/user.model.js';
import { asyncHandler, sendSuccessResponse } from '../utils/error.js';
import { logger } from '../utils/logger.js';

// Get dashboard analytics
export const getDashboardAnalytics = asyncHandler(async (req, res, next) => {
  const isAdmin = req.user?.role === 'admin';
  const isEmployee = req.user?.role === 'employee';

  // Build query based on role
  const listingQuery = { isDeleted: false };
  const buyerQuery = { isDeleted: { $ne: true } };

  // Employees only see their assigned data
  if (isEmployee && !isAdmin) {
    listingQuery.assignedAgent = req.user.id;
    buyerQuery.assignedAgent = req.user.id;
  }

  // Parallel queries for better performance
  const [
    totalProperties,
    availableProperties,
    soldProperties,
    underNegotiationProperties,
    totalBuyers,
    activeBuyers,
    matchedBuyers,
    closedBuyers,
    totalEmployees,
    activeEmployees,
    recentListings,
    recentBuyers,
    propertiesByCategory,
    propertiesByCity,
  ] = await Promise.all([
    Listing.countDocuments(listingQuery),
    Listing.countDocuments({ ...listingQuery, status: 'available' }),
    Listing.countDocuments({ ...listingQuery, status: 'sold' }),
    Listing.countDocuments({ ...listingQuery, status: 'under_negotiation' }),
    BuyerRequirement.countDocuments(buyerQuery),
    BuyerRequirement.countDocuments({ ...buyerQuery, status: 'active' }),
    BuyerRequirement.countDocuments({ ...buyerQuery, status: 'matched' }),
    BuyerRequirement.countDocuments({ ...buyerQuery, status: 'closed' }),
    isAdmin ? User.countDocuments({ role: 'employee', isDeleted: { $ne: true } }) : Promise.resolve(0),
    isAdmin ? User.countDocuments({ role: 'employee', status: 'active', isDeleted: { $ne: true } }) : Promise.resolve(0),
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
    Listing.aggregate([
      { $match: listingQuery },
      { $group: { _id: '$propertyCategory', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Listing.aggregate([
      { $match: { ...listingQuery, city: { $ne: '' } } },
      { $group: { _id: '$city', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
  ]);

  const analytics = {
    properties: {
      total: totalProperties,
      available: availableProperties,
      sold: soldProperties,
      underNegotiation: underNegotiationProperties,
      byCategory: propertiesByCategory,
      byCity: propertiesByCity,
    },
    buyers: {
      total: totalBuyers,
      active: activeBuyers,
      matched: matchedBuyers,
      closed: closedBuyers,
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

  logger.info('Dashboard analytics retrieved', {
    userId: req.user.id,
    role: req.user.role,
  });

  sendSuccessResponse(res, analytics, 'Dashboard analytics retrieved successfully');
});

// Get property statistics
export const getPropertyStats = asyncHandler(async (req, res, next) => {
  const isAdmin = req.user?.role === 'admin';
  const isEmployee = req.user?.role === 'employee';

  const listingQuery = { isDeleted: false };
  if (isEmployee && !isAdmin) {
    listingQuery.assignedAgent = req.user.id;
  }

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

  sendSuccessResponse(res, stats, 'Property statistics retrieved successfully');
});

// Get buyer statistics
export const getBuyerStats = asyncHandler(async (req, res, next) => {
  const isAdmin = req.user?.role === 'admin';
  const isEmployee = req.user?.role === 'employee';

  const buyerQuery = { isDeleted: { $ne: true } };
  if (isEmployee && !isAdmin) {
    buyerQuery.assignedAgent = req.user.id;
  }

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

  const employees = await User.find({ role: 'employee', isDeleted: { $ne: true } }).select('_id username email firstName lastName');

  const performanceData = await Promise.all(
    employees.map(async (employee) => {
      const [assignedListings, soldListings, assignedBuyers, closedBuyers] = await Promise.all([
        Listing.countDocuments({ assignedAgent: employee._id, isDeleted: false }),
        Listing.countDocuments({ assignedAgent: employee._id, status: 'sold', isDeleted: false }),
        BuyerRequirement.countDocuments({ assignedAgent: employee._id, isDeleted: { $ne: true } }),
        BuyerRequirement.countDocuments({ assignedAgent: employee._id, status: 'closed', isDeleted: { $ne: true } }),
      ]);

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
          assignedBuyers,
          closedBuyers,
          conversionRate: assignedListings > 0 ? ((soldListings / assignedListings) * 100).toFixed(2) : 0,
        },
      };
    })
  );

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

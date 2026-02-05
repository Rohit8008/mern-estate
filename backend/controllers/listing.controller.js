import Listing from '../models/listing.model.js';
import User from '../models/user.model.js';
import Owner from '../models/owner.model.js';
import Category from '../models/category.model.js';
import { io } from '../index.js';
import { 
  errorHandler, 
  AppError, 
  ValidationError, 
  NotFoundError, 
  AuthorizationError,
  asyncHandler,
  sendSuccessResponse,
  sendErrorResponse
} from '../utils/error.js';
import { logger } from '../utils/logger.js';

async function getListingUpdateRecipients(category) {
  try {
    const baseRoles = ['admin', 'employee'];

    const query = {
      role: { $in: baseRoles },
    };

    if (category) {
      query.$or = [
        { role: 'admin' },
        { role: 'employee', assignedCategories: category },
      ];
    } else {
      query.role = 'admin';
    }

    const users = await User.find(query).select('_id').lean();
    return (users || []).map((u) => String(u._id));
  } catch (_) {
    return [];
  }
}

async function emitListingUpdate(action, listing, categoryOverride) {
  try {
    if (!io) return;

    const category = categoryOverride || listing?.category;
    const recipients = await getListingUpdateRecipients(category);
    if (!recipients.length) return;

    const payload = {
      action,
      listingId: listing?._id,
      title: listing?.name,
      name: listing?.name,
      category,
    };

    const unique = Array.from(new Set(recipients));
    unique.forEach((userId) => {
      io.to(`user:${userId}`).emit('listing:update', payload);
    });
  } catch (_) {}
}

export const createListing = asyncHandler(async (req, res, next) => {
  // Block buyers from creating listings
  if (req.user.role === 'buyer') {
    throw new AuthorizationError('Buyers are not allowed to create listings!');
  }

  if (req.user?.role === 'employee' && req.body.category) {
    if (!req.user.assignedCategories?.includes(req.body.category)) {
      throw new AuthorizationError('Not allowed for this category');
    }
  }
  // Always set creator from authenticated user to prevent spoofing
  req.body.userRef = req.user.id;
  
  // Validate dynamic attributes
  if (req.body.category) {
    const cat = await Category.findOne({ slug: req.body.category });
    if (cat) {
      const fieldDefs = (cat.fields || []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const attrs = req.body.attributes || {};
      for (const f of fieldDefs) {
        if (f.required && (attrs[f.key] === undefined || attrs[f.key] === null || attrs[f.key] === '')) {
          throw new ValidationError(`Missing required field: ${f.label}`, f.key);
        }
        if (attrs[f.key] !== undefined) {
          const val = attrs[f.key];
          if (f.type === 'number') {
            const num = Number(val);
            if (Number.isNaN(num)) throw new ValidationError(`${f.label} must be a number`, f.key);
            if (f.min !== undefined && num < f.min) throw new ValidationError(`${f.label} must be ≥ ${f.min}`, f.key);
            if (f.max !== undefined && num > f.max) throw new ValidationError(`${f.label} must be ≤ ${f.max}`, f.key);
          }
          if (f.type === 'select') {
            const options = Array.isArray(f.options) ? f.options : [];
            if (f.multiple) {
              if (!Array.isArray(val)) throw new ValidationError(`${f.label} must be an array`, f.key);
              for (const v of val) if (!options.includes(v)) throw new ValidationError(`${f.label} has invalid option: ${v}`, f.key);
            } else {
              if (!options.includes(val)) throw new ValidationError(`${f.label} has invalid option`, f.key);
            }
          }
          if (f.pattern && typeof val === 'string') {
            try {
              const re = new RegExp(f.pattern);
              if (!re.test(val)) throw new ValidationError(`${f.label} format is invalid`, f.key);
            } catch (_) {}
          }
        }
      }
    }
  }
  
  // Validate ownerIds if provided
  if (Array.isArray(req.body.ownerIds) && req.body.ownerIds.length > 0) {
    const count = await Owner.countDocuments({ _id: { $in: req.body.ownerIds } });
    if (count !== req.body.ownerIds.length) {
      throw new ValidationError('One or more owners are invalid', 'ownerIds');
    }
  }
  
  const listing = await Listing.create(req.body);

  await emitListingUpdate('created', listing, listing?.category);
  
  // Log successful listing creation
  logger.info('Listing created successfully', {
    listingId: listing._id,
    userId: req.user.id,
    category: listing.category,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });
  
  sendSuccessResponse(res, listing, 'Listing created successfully', 201);
});

export const deleteListing = async (req, res, next) => {
  const listing = await Listing.findById(req.params.id);

  if (!listing) {
    return next(errorHandler(404, 'Listing not found!'));
  }

  // Block buyers from deleting any listings
  if (req.user.role === 'buyer') {
    return next(errorHandler(403, 'Buyers are not allowed to delete listings!'));
  }

  if (req.user.id !== listing.userRef) {
    if (!(
      req.user.role === 'employee' &&
      listing.category &&
      req.user.assignedCategories?.includes(listing.category)
    )) {
      return next(errorHandler(401, 'You can only delete your own listings!'));
    }
  }

  try {
    await Listing.findByIdAndDelete(req.params.id);

    await emitListingUpdate('deleted', listing, listing?.category);

    res.status(200).json('Listing has been deleted!');
  } catch (error) {
    next(error);
  }
};

export const updateListing = async (req, res, next) => {
  const listing = await Listing.findById(req.params.id);
  if (!listing) {
    return next(errorHandler(404, 'Listing not found!'));
  }

  // Block buyers from updating any listings
  if (req.user.role === 'buyer') {
    return next(errorHandler(403, 'Buyers are not allowed to update listings!'));
  }

  if (req.user.id !== listing.userRef) {
    if (!(
      req.user.role === 'employee' &&
      listing.category &&
      req.user.assignedCategories?.includes(listing.category)
    )) {
      return next(errorHandler(401, 'You can only update your own listings!'));
    }
  }

  try {
    // Validate dynamic attributes on update as well
    if (req.body.category || req.body.attributes) {
      const listingCat = req.body.category || (await Listing.findById(req.params.id))?.category;
      if (listingCat) {
        const cat = await Category.findOne({ slug: listingCat });
        const fieldDefs = (cat?.fields || []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const attrs = req.body.attributes || {};
        for (const f of fieldDefs) {
          if (f.required && (attrs[f.key] === undefined || attrs[f.key] === null || attrs[f.key] === '')) {
            return next(errorHandler(400, `Missing required field: ${f.label}`));
          }
          if (attrs[f.key] !== undefined) {
            const val = attrs[f.key];
            if (f.type === 'number') {
              const num = Number(val);
              if (Number.isNaN(num)) return next(errorHandler(400, `${f.label} must be a number`));
              if (f.min !== undefined && num < f.min) return next(errorHandler(400, `${f.label} must be ≥ ${f.min}`));
              if (f.max !== undefined && num > f.max) return next(errorHandler(400, `${f.label} must be ≤ ${f.max}`));
            }
            if (f.type === 'select') {
              const options = Array.isArray(f.options) ? f.options : [];
              if (f.multiple) {
                if (!Array.isArray(val)) return next(errorHandler(400, `${f.label} must be an array`));
                for (const v of val) if (!options.includes(v)) return next(errorHandler(400, `${f.label} has invalid option: ${v}`));
              } else {
                if (!options.includes(val)) return next(errorHandler(400, `${f.label} has invalid option`));
              }
            }
            if (f.pattern && typeof val === 'string') {
              try {
                const re = new RegExp(f.pattern);
                if (!re.test(val)) return next(errorHandler(400, `${f.label} format is invalid`));
              } catch (_) {}
            }
          }
        }
      }
    }
    // Validate ownerIds on update
    if (Array.isArray(req.body.ownerIds)) {
      const count = await Owner.countDocuments({ _id: { $in: req.body.ownerIds } });
      if (count !== req.body.ownerIds.length) return next(errorHandler(400, 'One or more owners are invalid'));
    }
    const updatedListing = await Listing.findByIdAndUpdate(req.params.id, req.body, { new: true });
    const category = updatedListing?.category || listing?.category;

    await emitListingUpdate('updated', updatedListing, category);

    res.status(200).json(updatedListing);
  } catch (error) {
    next(error);
  }
};

export const getListing = async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
      return next(errorHandler(404, 'Listing not found!'));
    }
    let owner = null;
    try {
      if (listing.userRef) {
        owner = await User.findById(listing.userRef).select('username avatar _id');
      }
    } catch (_) {}
    let owners = [];
    try {
      if (Array.isArray(listing.ownerIds) && listing.ownerIds.length > 0) {
        owners = await Owner.find({ _id: { $in: listing.ownerIds } }).select('name email phone companyName _id');
      }
    } catch (_) {}
    res.status(200).json({ ...(listing._doc || {}), owner, owners });
  } catch (error) {
    next(error);
  }
};

// Assign listing to an agent (Admin only)
export const assignListingToAgent = asyncHandler(async (req, res, next) => {
  if (req.user?.role !== 'admin') {
    throw new AuthorizationError('Only admins can assign listings to agents');
  }

  const { listingId, agentId } = req.body;

  if (!listingId || !agentId) {
    throw new ValidationError('Listing ID and Agent ID are required');
  }

  const listing = await Listing.findById(listingId);
  if (!listing) {
    throw new NotFoundError('Listing not found');
  }

  const agent = await User.findById(agentId);
  if (!agent || (agent.role !== 'employee' && agent.role !== 'admin')) {
    throw new ValidationError('Invalid agent ID or user is not an employee/admin');
  }

  listing.assignedAgent = agentId;
  await listing.save();

  await emitListingUpdate('assigned', listing, listing?.category);

  logger.info('Listing assigned to agent', {
    listingId: listing._id,
    agentId,
    assignedBy: req.user.id,
  });

  sendSuccessResponse(res, listing, 'Listing assigned successfully');
});

// Unassign listing from agent (Admin only)
export const unassignListingFromAgent = asyncHandler(async (req, res, next) => {
  if (req.user?.role !== 'admin') {
    throw new AuthorizationError('Only admins can unassign listings');
  }

  const { listingId } = req.body;

  if (!listingId) {
    throw new ValidationError('Listing ID is required');
  }

  const listing = await Listing.findById(listingId);
  if (!listing) {
    throw new NotFoundError('Listing not found');
  }

  listing.assignedAgent = null;
  await listing.save();

  await emitListingUpdate('unassigned', listing, listing?.category);

  logger.info('Listing unassigned from agent', {
    listingId: listing._id,
    unassignedBy: req.user.id,
  });

  sendSuccessResponse(res, listing, 'Listing unassigned successfully');
});

// Get listings assigned to the current agent
export const getMyAssignedListings = asyncHandler(async (req, res, next) => {
  if (req.user?.role !== 'employee' && req.user?.role !== 'admin') {
    throw new AuthorizationError('Only employees and admins can access assigned listings');
  }

  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const startIndex = Math.max(parseInt(req.query.startIndex) || 0, 0);

  const query = {
    assignedAgent: req.user.id,
    isDeleted: false,
  };

  // Allow filtering by status
  const status = req.query.status;
  if (status && status !== 'all') {
    query.status = status;
  }

  const [listings, totalCount] = await Promise.all([
    Listing.find(query)
      .select('-__v')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(startIndex)
      .lean(),
    Listing.countDocuments(query)
  ]);

  const response = {
    listings,
    pagination: {
      total: totalCount,
      limit,
      startIndex,
      hasMore: startIndex + limit < totalCount,
    },
  };

  sendSuccessResponse(res, response, 'Assigned listings retrieved successfully');
});

// Soft delete a listing (Admin only)
export const softDeleteListing = asyncHandler(async (req, res, next) => {
  if (req.user?.role !== 'admin') {
    throw new AuthorizationError('Only admins can delete listings');
  }

  const listing = await Listing.findById(req.params.id);
  if (!listing) {
    throw new NotFoundError('Listing not found');
  }

  listing.isDeleted = true;
  listing.deletedAt = new Date();
  await listing.save();

  await emitListingUpdate('soft_deleted', listing, listing?.category);

  logger.info('Listing soft deleted', {
    listingId: listing._id,
    deletedBy: req.user.id,
  });

  sendSuccessResponse(res, { id: listing._id }, 'Listing deleted successfully');
});

// Restore a soft-deleted listing (Admin only)
export const restoreListing = asyncHandler(async (req, res, next) => {
  if (req.user?.role !== 'admin') {
    throw new AuthorizationError('Only admins can restore listings');
  }

  const listing = await Listing.findById(req.params.id);
  if (!listing) {
    throw new NotFoundError('Listing not found');
  }

  listing.isDeleted = false;
  listing.deletedAt = null;
  await listing.save();

  await emitListingUpdate('restored', listing, listing?.category);

  logger.info('Listing restored', {
    listingId: listing._id,
    restoredBy: req.user.id,
  });

  sendSuccessResponse(res, listing, 'Listing restored successfully');
});

export const getListings = asyncHandler(async (req, res, next) => {
  const startTime = Date.now();
  
  // Parse and validate query parameters
  const limit = Math.min(parseInt(req.query.limit) || 9, 50); // Cap at 50
  const startIndex = Math.max(parseInt(req.query.startIndex) || 0, 0);
  
  // Build query object
  const query = {};
  
  // Exclude soft-deleted by default (admin can override with includeDeleted=true)
  if (req.query.includeDeleted !== 'true' || req.user?.role !== 'admin') {
    query.isDeleted = false;
  }
  
  // City filter
  const city = req.query.city;
  if (city && city.trim() && city !== 'all') {
    query.city = { $regex: city.trim(), $options: 'i' };
  }
  
  // Locality filter
  const locality = req.query.locality;
  if (locality && locality.trim() && locality !== 'all') {
    query.locality = { $regex: locality.trim(), $options: 'i' };
  }
  
  // Status filter
  const status = req.query.status;
  if (status && status !== 'all') {
    query.status = status;
  }
  
  // Assigned agent filter
  const assignedAgent = req.query.assignedAgent;
  if (assignedAgent && assignedAgent !== 'all') {
    if (assignedAgent === 'unassigned') {
      query.assignedAgent = null;
    } else {
      query.assignedAgent = assignedAgent;
    }
  }
  
  // Property category filter
  const propertyCategory = req.query.propertyCategory;
  if (propertyCategory && propertyCategory !== 'all') {
    query.propertyCategory = propertyCategory;
  }
  
  // Property type filters (residential/commercial/land subtypes)
  const propertyType = req.query.propertyType;
  if (propertyType && propertyType !== 'all') {
    query.propertyType = propertyType;
  }
  
  const commercialType = req.query.commercialType;
  if (commercialType && commercialType !== 'all') {
    query.commercialType = commercialType;
  }
  
  const plotType = req.query.plotType;
  if (plotType && plotType !== 'all') {
    query.plotType = plotType;
  }
  
  // Area range filter
  const minAreaSqFt = parseInt(req.query.minAreaSqFt);
  const maxAreaSqFt = parseInt(req.query.maxAreaSqFt);
  if (!isNaN(minAreaSqFt) || !isNaN(maxAreaSqFt)) {
    query.areaSqFt = {};
    if (!isNaN(minAreaSqFt) && minAreaSqFt > 0) {
      query.areaSqFt.$gte = minAreaSqFt;
    }
    if (!isNaN(maxAreaSqFt) && maxAreaSqFt > 0) {
      query.areaSqFt.$lte = maxAreaSqFt;
    }
  }
  
  // Boolean filters with proper handling
  const booleanFilters = ['offer', 'furnished', 'parking'];
  booleanFilters.forEach(filter => {
    const value = req.query[filter];
    if (value !== undefined && value !== 'false') {
      query[filter] = value === 'true';
    }
  });
  
  // Type filter (legacy - keep for backward compatibility)
  const type = req.query.type;
  if (type && type !== 'all') {
    query.type = type;
  }
  
  // Price range
  const minPrice = parseInt(req.query.minPrice) || 0;
  const maxPrice = parseInt(req.query.maxPrice) || 100000000;
  query.regularPrice = { $gte: minPrice, $lte: maxPrice };
  
  // Bedroom and bathroom filters
  const minBedrooms = parseInt(req.query.minBedrooms);
  if (!isNaN(minBedrooms)) {
    query.bedrooms = { $gte: minBedrooms };
  }
  
  const minBathrooms = parseInt(req.query.minBathrooms);
  if (!isNaN(minBathrooms)) {
    query.bathrooms = { $gte: minBathrooms };
  }
  
  // Category filter
  const category = req.query.category;
  if (category && category !== 'all') {
    query.category = category;
  }
  
  // Search functionality with text index optimization
  const searchTerm = req.query.searchTerm;
  if (searchTerm && searchTerm.trim()) {
    const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.$or = [
      { name: { $regex: escapedTerm, $options: 'i' } },
      { description: { $regex: escapedTerm, $options: 'i' } },
      { address: { $regex: escapedTerm, $options: 'i' } },
      { city: { $regex: escapedTerm, $options: 'i' } },
      { locality: { $regex: escapedTerm, $options: 'i' } },
    ];
  }
  
  // Sorting
  const sort = req.query.sort || 'createdAt';
  const order = req.query.order === 'asc' ? 1 : -1;
  const sortObj = { [sort]: order };
  
  // Add secondary sort for consistent results
  if (sort !== 'createdAt') {
    sortObj.createdAt = -1;
  }
  
  // Execute query with performance optimizations
  const [listings, totalCount] = await Promise.all([
    Listing.find(query)
      .select('-__v') // Exclude version field
      .sort(sortObj)
      .limit(limit)
      .skip(startIndex)
      .lean(), // Use lean() for better performance
    Listing.countDocuments(query)
  ]);
  
  const responseTime = Date.now() - startTime;
  
  // Log performance metrics
  logger.info('Listings query executed', {
    query: Object.keys(query),
    resultCount: listings.length,
    totalCount,
    responseTime: `${responseTime}ms`,
    userId: req.user?.id,
    ip: req.ip,
  });
  
  // Return paginated response
  const response = {
    listings,
    pagination: {
      total: totalCount,
      limit,
      startIndex,
      hasMore: startIndex + limit < totalCount,
    },
    meta: {
      queryTime: `${responseTime}ms`,
      filters: Object.keys(query),
    }
  };
  
  sendSuccessResponse(res, response, 'Listings retrieved successfully');
});

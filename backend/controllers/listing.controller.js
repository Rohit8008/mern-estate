import Listing from '../models/listing.model.js';
import User from '../models/user.model.js';
import Owner from '../models/owner.model.js';
import Category from '../models/category.model.js';
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

export const getListings = asyncHandler(async (req, res, next) => {
  const startTime = Date.now();
  
  // Parse and validate query parameters
  const limit = Math.min(parseInt(req.query.limit) || 9, 50); // Cap at 50
  const startIndex = Math.max(parseInt(req.query.startIndex) || 0, 0);
  
  // Build query object
  const query = {};
  
  // Boolean filters with proper handling
  const booleanFilters = ['offer', 'furnished', 'parking'];
  booleanFilters.forEach(filter => {
    const value = req.query[filter];
    if (value !== undefined && value !== 'false') {
      query[filter] = value === 'true';
    }
  });
  
  // Type filter
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

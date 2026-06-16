import Listing from '../models/listing.model.js';
import User from '../models/user.model.js';
import Owner from '../models/owner.model.js';
import Category from '../models/category.model.js';
import PropertyType from '../models/propertyType.model.js';
import { io } from '../socket.js';
import { config } from '../config/environment.js';
import { getCache } from '../utils/cache.js';
import {
  errorHandler,
  ValidationError,
  NotFoundError,
  AuthorizationError,
  asyncHandler,
  sendSuccessResponse,
} from '../utils/error.js';
import { logger } from '../utils/logger.js';
import { canAccessListing } from '../middleware/permissions.js';
import {
  tokenize,
  buildFuzzyRegex,
  scoreDocument,
  generateSearchVariations,
  generateSuggestions,
  highlightMatches,
} from '../utils/search.js';

const CACHE_TTL_MS = (Number(config?.cache?.ttl) > 0 ? Number(config.cache.ttl) : 300) * 1000;
const MAX_CACHE_SIZE = Number(config?.cache?.maxSize) > 0 ? Number(config.cache.maxSize) : 100;
const cache = getCache({ ttlMs: CACHE_TTL_MS, maxSize: MAX_CACHE_SIZE });

function getCachedResults(key) {
  return cache.get(key);
}

function shouldPopulate(req, key) {
  const raw = String(req.query.populate || '');
  if (!raw) return false;
  const parts = raw
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  if (!parts.includes(key)) return false;
  // Owner contact data (email/phone) is internal — require CRM role
  if (key === 'owners') {
    const role = req.user?.role;
    return role === 'admin' || role === 'employee';
  }
  return true;
}

function isPrivilegedUser(req) {
  const role = req.user?.role;
  return role === 'admin' || role === 'employee';
}

function setCachedResults(key, data) {
  cache.set(key, data);
}

function clearSearchCache() {
  cache.clearByPrefix('listing:');
  logger.info('Search cache cleared');
}

async function getListingUpdateRecipients(category) {
  try {
    const baseRoles = ['admin', 'employee'];

    const query = {
      role: { $in: baseRoles },
      isDeleted: { $ne: true },
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

// Validate dynamic attributes against a category's field definitions
async function validateCategoryAttributes(cat, attrs) {
  const fieldDefs = (cat.fields || []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
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
          for (const v of val) {
            if (!options.includes(v)) throw new ValidationError(`${f.label} has invalid option: ${v}`, f.key);
          }
        } else {
          if (!options.includes(val)) throw new ValidationError(`${f.label} has invalid option`, f.key);
        }
      }
      if (f.pattern && typeof val === 'string') {
        // B-009: Only suppress SyntaxError (invalid regex in DB); re-throw ValidationErrors.
        try {
          const re = new RegExp(f.pattern);
          if (!re.test(val)) throw new ValidationError(`${f.label} format is invalid`, f.key);
        } catch (e) {
          if (!(e instanceof SyntaxError)) throw e;
        }
      }
    }
  }
}

// Build a whitelisted listing payload from request body.
// Pass userId to set userRef (create); pass null to omit it (update).
function buildListingPayload(body, userId) {
  const payload = {
    name: body.name,
    description: body.description,
    address: body.address,
    regularPrice: body.regularPrice,
    discountPrice: body.discountPrice,
    bathrooms: body.bathrooms,
    bedrooms: body.bedrooms,
    furnished: body.furnished,
    parking: body.parking,
    type: body.type,
    offer: body.offer,
    imageUrls: body.imageUrls,
    category: body.category,
    attributes: body.attributes,
    propertyTypeFields: body.propertyTypeFields,
    location: body.location,
    ownerIds: body.ownerIds,
    city: body.city,
    locality: body.locality,
    state: body.state,
    pincode: body.pincode,
    areaSqFt: body.areaSqFt,
    status: body.status,
    propertyCategory: body.propertyCategory,
    propertyType: body.propertyType,
    commercialType: body.commercialType,
    plotType: body.plotType,
    areaName: body.areaName,
    plotSize: body.plotSize,
    sqYard: body.sqYard,
    sqYardRate: body.sqYardRate,
    totalValue: body.totalValue,
    propertyNo: body.propertyNo,
    remarks: body.remarks,
    otherAttachment: body.otherAttachment,
  };
  if (userId !== null) payload.userRef = userId;
  // Strip undefined keys so Mongoose default values are preserved on create
  return Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined));
}

const PT_CATEGORY_MAP = { residential: 'residential', commercial: 'commercial', land: 'land', industrial: 'commercial', other: 'unknown' };

async function inferPropertyCategory(propertyTypeSlug) {
  if (!propertyTypeSlug) return null;
  const pt = await PropertyType.findOne({ slug: propertyTypeSlug }).select('category').lean();
  return pt?.category ? (PT_CATEGORY_MAP[pt.category] || 'unknown') : null;
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
  // Validate dynamic attributes
  if (req.body.category) {
    const cat = await Category.findOne({ slug: req.body.category });
    if (!cat) throw new ValidationError('Invalid category', 'category');
    await validateCategoryAttributes(cat, req.body.attributes || {});
  }

  // Validate ownerIds if provided
  if (Array.isArray(req.body.ownerIds) && req.body.ownerIds.length > 0) {
    const count = await Owner.countDocuments({ _id: { $in: req.body.ownerIds } });
    if (count !== req.body.ownerIds.length) {
      throw new ValidationError('One or more owners are invalid', 'ownerIds');
    }
  }

  // Whitelist fields — never let the client set system-managed fields
  const listingData = buildListingPayload(req.body, req.user.id);

  // Auto-infer propertyCategory from propertyType when not explicitly provided
  if (listingData.propertyType && !listingData.propertyCategory) {
    const inferred = await inferPropertyCategory(listingData.propertyType);
    if (inferred) listingData.propertyCategory = inferred;
  }

  const listing = await Listing.create(listingData);

  await emitListingUpdate('created', listing, listing?.category);
  clearSearchCache(); // Clear search cache on listing creation

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

export const deleteListing = asyncHandler(async (req, res, next) => {
  const listing = await Listing.findById(req.params.id);
  if (!listing) throw new NotFoundError('Listing not found!');
  if (req.user.role === 'buyer') throw new AuthorizationError('Buyers are not allowed to delete listings!');
  if (!canAccessListing(req.user, listing)) throw new AuthorizationError('You can only delete your own listings!');

  await Listing.findByIdAndUpdate(req.params.id, { isDeleted: true, deletedAt: new Date() });
  await emitListingUpdate('deleted', listing, listing?.category);
  clearSearchCache();

  res.status(200).json('Listing has been deleted!');
});

export const updateListing = asyncHandler(async (req, res, next) => {
  const listing = await Listing.findById(req.params.id);
  if (!listing) throw new NotFoundError('Listing not found!');
  if (req.user.role === 'buyer') throw new AuthorizationError('Buyers are not allowed to update listings!');
  if (!canAccessListing(req.user, listing, { allowAssignedAgent: true })) {
    throw new AuthorizationError('You can only update your own listings!');
  }

  // Validate dynamic attributes on update
  if (req.body.category || req.body.attributes) {
    const categorySlug = req.body.category || listing.category;
    if (categorySlug) {
      const cat = await Category.findOne({ slug: categorySlug });
      if (req.body.category && !cat) throw new ValidationError('Invalid category', 'category');
      if (cat) await validateCategoryAttributes(cat, req.body.attributes || {});
    }
  }

  // Validate ownerIds on update
  if (Array.isArray(req.body.ownerIds) && req.body.ownerIds.length > 0) {
    const count = await Owner.countDocuments({ _id: { $in: req.body.ownerIds } });
    if (count !== req.body.ownerIds.length) throw new ValidationError('One or more owners are invalid', 'ownerIds');
  }

  // Whitelist fields — userRef, assignedAgent, isDeleted, deletedAt are not updatable here
  const updates = buildListingPayload(req.body, null);

  // Cross-field price guard: Joi can't compare discountPrice against the stored regularPrice
  if (updates.discountPrice !== undefined) {
    const effectiveRegularPrice = updates.regularPrice ?? listing.regularPrice;
    if (effectiveRegularPrice != null && updates.discountPrice >= effectiveRegularPrice) {
      throw new ValidationError('Discount price must be less than regular price', 'discountPrice');
    }
  }

  // Re-infer propertyCategory when propertyType changes and category isn't explicitly set
  if (updates.propertyType && !updates.propertyCategory) {
    const inferred = await inferPropertyCategory(updates.propertyType);
    if (inferred) updates.propertyCategory = inferred;
  }

  const updatedListing = await Listing.findByIdAndUpdate(req.params.id, updates, { new: true, lean: true });
  const category = updatedListing?.category || listing?.category;

  await emitListingUpdate('updated', updatedListing, category);
  clearSearchCache();

  res.status(200).json(updatedListing);
});

export const getListing = asyncHandler(async (req, res, next) => {
  const listing = await Listing.findOne({ _id: req.params.id, isDeleted: { $ne: true } })
    .populate('userRef', 'username avatar _id')
    .populate('ownerIds', 'name email phone companyName _id')
    .lean();
  if (!listing) throw new NotFoundError('Listing not found!');

  const { userRef: owner, ownerIds: owners, voiceNotes, assignedAgent, ...rest } = listing;

  const privileged = isPrivilegedUser(req);
  const response = { ...rest, owner: owner || null };
  if (privileged) {
    response.owners = owners || [];
    response.voiceNotes = voiceNotes || [];
    response.assignedAgent = assignedAgent || null;
  }
  res.status(200).json(response);
});

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
    isDeleted: { $ne: true },
  };

  // Allow filtering by status
  const status = req.query.status;
  if (status && status !== 'all') {
    query.status = status;
  }

  // Additional filters (subset of getListings)
  const city = req.query.city;
  if (city && city.trim() && city !== 'all') {
    query.city = { $regex: city.trim(), $options: 'i' };
  }

  const locality = req.query.locality;
  if (locality && locality.trim() && locality !== 'all') {
    query.locality = { $regex: locality.trim(), $options: 'i' };
  }

  const propertyCategory = req.query.propertyCategory;
  if (propertyCategory && propertyCategory !== 'all') {
    query.propertyCategory = propertyCategory;
  }

  const propertyType = req.query.propertyType;
  if (propertyType && propertyType !== 'all') {
    query.propertyType = propertyType;
  }

  const type = req.query.type;
  if (type && type !== 'all') {
    query.type = type;
  }

  const category = req.query.category;
  if (category && category !== 'all') {
    query.category = category;
  }

  const ownerId = req.query.ownerId;
  if (ownerId && ownerId !== 'all') {
    query.ownerIds = ownerId;
  }

  const minBedrooms = parseInt(req.query.minBedrooms);
  if (!isNaN(minBedrooms)) {
    query.bedrooms = { $gte: minBedrooms };
  }

  const minBathrooms = parseInt(req.query.minBathrooms);
  if (!isNaN(minBathrooms)) {
    query.bathrooms = { $gte: minBathrooms };
  }

  const minPrice = parseInt(req.query.minPrice);
  const maxPrice = parseInt(req.query.maxPrice);
  if (!isNaN(minPrice) || !isNaN(maxPrice)) {
    query.regularPrice = {};
    if (!isNaN(minPrice)) query.regularPrice.$gte = minPrice;
    if (!isNaN(maxPrice)) query.regularPrice.$lte = maxPrice;
  }

  const booleanFilters = ['offer', 'furnished', 'parking'];
  booleanFilters.forEach((filter) => {
    const value = req.query[filter];
    if (value !== undefined && value !== 'false') {
      query[filter] = value === 'true';
    }
  });

  // Basic searchTerm for assigned-only endpoint
  const searchTerm = req.query.searchTerm;
  if (searchTerm && String(searchTerm).trim()) {
    const safe = String(searchTerm).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(safe, 'i');
    query.$or = [{ name: re }, { address: re }, { city: re }, { locality: re }, { areaName: re }, { propertyNo: re }];
  }

  const [listings, totalCount] = await Promise.all([
    (async () => {
      let qy = Listing.find(query).select('-__v').sort({ createdAt: -1 }).limit(limit).skip(startIndex);
      if (shouldPopulate(req, 'agent')) {
        qy = qy.populate('assignedAgent', 'username avatar role');
      }
      if (shouldPopulate(req, 'owners')) {
        qy = qy.populate('ownerIds', 'name email phone companyName');
      }
      return qy.lean();
    })(),
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
  clearSearchCache(); // Clear search cache on soft delete

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
  clearSearchCache(); // Clear search cache on restore

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
    query.isDeleted = { $ne: true };
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

  // Owner filter
  const ownerId = req.query.ownerId;
  if (ownerId && ownerId !== 'all') {
    query.ownerIds = ownerId;
  }
  
  // Advanced fuzzy search functionality
  const searchTerm = req.query.searchTerm;
  const fuzzyLevel = req.query.fuzzyLevel || 'medium'; // strict, medium, loose

  if (searchTerm && searchTerm.trim()) {
    const terms = tokenize(searchTerm);
    const searchConditions = [];

    terms.forEach(term => {
      // Build fuzzy regex for the term
      const fuzzyRegex = buildFuzzyRegex(term, { fuzzyLevel });

      // Primary field searches with fuzzy matching
      searchConditions.push(
        { name: fuzzyRegex },
        { description: fuzzyRegex },
        { address: fuzzyRegex },
        { city: fuzzyRegex },
        { locality: fuzzyRegex },
        { areaName: fuzzyRegex },
        { propertyNo: fuzzyRegex }
      );

      // Add search variations for typo tolerance
      const variations = generateSearchVariations(term);
      variations.slice(1, 3).forEach(variation => {
        const varRegex = new RegExp(variation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        searchConditions.push(
          { name: varRegex },
          { city: varRegex },
          { locality: varRegex }
        );
      });

      // Numeric search for prices if term is numeric
      const numericValue = parseFloat(term);
      if (!isNaN(numericValue) && numericValue > 0) {
        const tolerance = numericValue * 0.1; // 10% tolerance
        searchConditions.push(
          { regularPrice: { $gte: numericValue - tolerance, $lte: numericValue + tolerance } }
        );
      }
    });

    query.$or = searchConditions;
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
  const privileged = isPrivilegedUser(req);
  const [listings, totalCount] = await Promise.all([
    (async () => {
      const projection = privileged
        ? '-__v'
        : '-__v -voiceNotes -ownerIds -assignedAgent -userRef -isDeleted -deletedAt';
      let qy = Listing.find(query)
        .select(projection)
        .sort(sortObj)
        .limit(limit)
        .skip(startIndex);
      if (shouldPopulate(req, 'agent')) {
        qy = qy.populate('assignedAgent', 'username avatar role');
      }
      if (shouldPopulate(req, 'owners')) {
        qy = qy.populate('ownerIds', 'name email phone companyName');
      }
      return qy.lean(); // Use lean() for better performance
    })(),
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

// Bulk import listings from CSV/Excel data
export const bulkImportListings = asyncHandler(async (req, res, next) => {
  const { listings: listingsData } = req.body;

  if (!listingsData || !Array.isArray(listingsData) || listingsData.length === 0) {
    return next(errorHandler(400, 'No listings data provided'));
  }

  // Limit bulk import to 100 listings at a time
  if (listingsData.length > 100) {
    return next(errorHandler(400, 'Maximum 100 listings can be imported at once'));
  }

  const results = {
    success: [],
    failed: [],
  };

  for (let i = 0; i < listingsData.length; i++) {
    const data = listingsData[i];
    const rowNumber = i + 2; // +2 because row 1 is headers, and arrays are 0-indexed

    try {
      // Validate required fields
      if (!data.name || !data.address) {
        results.failed.push({
          row: rowNumber,
          name: data.name || 'Unknown',
          error: 'Missing required fields (name, address)',
        });
        continue;
      }

      // Create listing object with defaults
      const listingData = {
        name: String(data.name).trim(),
        description: data.description ? String(data.description).trim() : '',
        address: String(data.address).trim(),
        city: data.city ? String(data.city).trim() : '',
        state: data.state ? String(data.state).trim() : '',
        pincode: data.pincode ? String(data.pincode).trim() : '',
        type: ['sale', 'rent'].includes(data.type?.toLowerCase()) ? data.type.toLowerCase() : 'sale',
        propertyType: data.propertyType ? String(data.propertyType).trim().toLowerCase() : '',
        category: data.category ? String(data.category).trim().toLowerCase() : '',
        regularPrice: parseFloat(data.regularPrice) || parseFloat(data.price) || 0,
        discountPrice: parseFloat(data.discountPrice) || 0,
        offer: data.offer === true || data.offer === 'true' || data.offer === 'Yes' || data.offer === 'yes',
        bedrooms: parseInt(data.bedrooms) || 1,
        bathrooms: parseInt(data.bathrooms) || 1,
        parking: data.parking === true || data.parking === 'true' || data.parking === 'Yes' || data.parking === 'yes',
        furnished: data.furnished === true || data.furnished === 'true' || data.furnished === 'Yes' || data.furnished === 'yes',
        imageUrls: data.imageUrls ? (Array.isArray(data.imageUrls) ? data.imageUrls : [data.imageUrls]) : [],
        userRef: req.user.id,
      };

      // Handle location
      if (data.latitude && data.longitude) {
        listingData.location = {
          lat: parseFloat(data.latitude),
          lng: parseFloat(data.longitude),
        };
      } else if (data.lat && data.lng) {
        listingData.location = {
          lat: parseFloat(data.lat),
          lng: parseFloat(data.lng),
        };
      }

      // Handle property type fields
      if (data.propertyTypeFields && typeof data.propertyTypeFields === 'object') {
        listingData.propertyTypeFields = data.propertyTypeFields;
      } else {
        // Extract common property type fields from flat data
        const propertyTypeFields = {};
        const ptFieldKeys = ['floors', 'plotSize', 'areaSqFt', 'sqYard', 'sqYardRate', 'facing', 'floor', 'totalFloors', 'lift', 'balcony', 'garden', 'boundaryWall', 'cornerPlot'];
        ptFieldKeys.forEach(key => {
          if (data[key] !== undefined && data[key] !== '') {
            if (['floors', 'areaSqFt', 'sqYard', 'sqYardRate', 'floor', 'totalFloors'].includes(key)) {
              propertyTypeFields[key] = parseFloat(data[key]) || 0;
            } else if (['lift', 'balcony', 'garden', 'boundaryWall', 'cornerPlot'].includes(key)) {
              propertyTypeFields[key] = data[key] === true || data[key] === 'true' || data[key] === 'Yes' || data[key] === 'yes';
            } else {
              propertyTypeFields[key] = data[key];
            }
          }
        });
        if (Object.keys(propertyTypeFields).length > 0) {
          listingData.propertyTypeFields = propertyTypeFields;
        }
      }

      // Additional fields
      if (data.areaName) listingData.areaName = String(data.areaName).trim();
      if (data.propertyNo) listingData.propertyNo = String(data.propertyNo).trim();
      if (data.remarks) listingData.remarks = String(data.remarks).trim();

      const listing = await Listing.create(listingData);
      results.success.push({
        row: rowNumber,
        name: listing.name,
        id: listing._id,
      });
    } catch (error) {
      results.failed.push({
        row: rowNumber,
        name: data.name || 'Unknown',
        error: error.message,
      });
    }
  }

  // Notify about new listings and clear cache
  if (results.success.length > 0) {
    io.emit('listing:update', { action: 'bulk_import', count: results.success.length });
    clearSearchCache(); // Clear search cache after bulk import
  }

  res.status(200).json({
    success: true,
    message: `Imported ${results.success.length} listings, ${results.failed.length} failed`,
    data: results,
  });
});

/**
 * Professional Search Endpoint
 * Fast, fuzzy search with relevance scoring and filtering
 */
export const searchListings = asyncHandler(async (req, res, next) => {
  const startTime = Date.now();

  const {
    q: searchTerm,
    fuzzyLevel = 'medium',
    limit: rawLimit = 20,
    page = 1,
    sort = 'relevance',
    order = 'desc',
    // Filters
    type,
    minPrice,
    maxPrice,
    bedrooms,
    bathrooms,
    city,
    locality,
    propertyCategory,
    propertyType,
    status = 'available',
    offer,
    furnished,
    parking,
  } = req.query;

  const limit = Math.min(parseInt(rawLimit) || 20, 50);
  const skip = (Math.max(parseInt(page) || 1, 1) - 1) * limit;

  // Check cache for identical queries
  const cacheKey = `listing:search:${JSON.stringify({ searchTerm, fuzzyLevel, limit, page, sort, order, type, minPrice, maxPrice, city, locality })}`;
  const cachedResult = getCachedResults(cacheKey);
  if (cachedResult) {
    logger.info('Search cache hit', { searchTerm, responseTime: `${Date.now() - startTime}ms` });
    return sendSuccessResponse(res, cachedResult, 'Search results (cached)');
  }

  // Build base query
  const query = { isDeleted: { $ne: true } };

  // Apply filters
  if (type && type !== 'all') query.type = type;
  if (status && status !== 'all') query.status = status;
  if (propertyCategory && propertyCategory !== 'all') query.propertyCategory = propertyCategory;
  if (propertyType && propertyType !== 'all') query.propertyType = propertyType;
  if (offer === 'true') query.offer = true;
  if (furnished === 'true') query.furnished = true;
  if (parking === 'true') query.parking = true;

  // Price range
  if (minPrice || maxPrice) {
    query.regularPrice = {};
    if (minPrice) query.regularPrice.$gte = parseFloat(minPrice);
    if (maxPrice) query.regularPrice.$lte = parseFloat(maxPrice);
  }

  // Bedrooms/Bathrooms
  if (bedrooms) query.bedrooms = { $gte: parseInt(bedrooms) };
  if (bathrooms) query.bathrooms = { $gte: parseInt(bathrooms) };

  // Location filters with fuzzy matching
  if (city && city !== 'all') {
    query.city = { $regex: city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  }
  if (locality && locality !== 'all') {
    query.locality = { $regex: locality.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  }

  let listings = [];
  let totalCount = 0;

  if (searchTerm && searchTerm.trim()) {
    const terms = tokenize(searchTerm);
    const searchConditions = [];

    terms.forEach(term => {
      const fuzzyRegex = buildFuzzyRegex(term, { fuzzyLevel });
      const variations = generateSearchVariations(term);

      // Primary searches
      searchConditions.push(
        { name: fuzzyRegex },
        { description: fuzzyRegex },
        { address: fuzzyRegex },
        { city: fuzzyRegex },
        { locality: fuzzyRegex },
        { areaName: fuzzyRegex },
        { propertyNo: fuzzyRegex }
      );

      // Variation searches for typo tolerance
      variations.slice(1, 3).forEach(variation => {
        const varRegex = new RegExp(variation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        searchConditions.push(
          { name: varRegex },
          { city: varRegex },
          { address: varRegex }
        );
      });
    });

    const searchQuery = { ...query, $or: searchConditions };

    // Get all matching results for scoring (limited for performance)
    const allResults = await Listing.find(searchQuery)
      .select('name description address city locality areaName propertyNo regularPrice discountPrice offer bedrooms bathrooms imageUrls type propertyType propertyCategory status createdAt')
      .limit(500)
      .lean();

    // Score and rank results
    const scoredResults = allResults.map(doc => {
      const scoreData = scoreDocument(doc, terms);
      return { ...doc, _searchScore: scoreData.score, _matchedFields: scoreData.matchedFields };
    });

    // Sort by relevance or specified field
    if (sort === 'relevance') {
      scoredResults.sort((a, b) => b._searchScore - a._searchScore);
    } else {
      const sortOrder = order === 'asc' ? 1 : -1;
      scoredResults.sort((a, b) => {
        const aVal = a[sort] || 0;
        const bVal = b[sort] || 0;
        return (aVal - bVal) * sortOrder;
      });
    }

    totalCount = scoredResults.length;
    listings = scoredResults.slice(skip, skip + limit);

    // Add highlighting to results
    listings = listings.map(listing => ({
      ...listing,
      _highlights: {
        name: highlightMatches(listing.name, terms),
        address: highlightMatches(listing.address, terms),
        city: highlightMatches(listing.city, terms),
      }
    }));
  } else {
    // No search term - just apply filters
    const sortObj = {};
    if (sort && sort !== 'relevance') {
      sortObj[sort] = order === 'asc' ? 1 : -1;
    } else {
      sortObj.createdAt = -1;
    }

    [listings, totalCount] = await Promise.all([
      Listing.find(query)
        .select('name description address city locality areaName regularPrice discountPrice offer bedrooms bathrooms imageUrls type propertyType propertyCategory status createdAt')
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        .lean(),
      Listing.countDocuments(query)
    ]);
  }

  const responseTime = Date.now() - startTime;

  const result = {
    listings,
    pagination: {
      total: totalCount,
      page: parseInt(page) || 1,
      limit,
      totalPages: Math.ceil(totalCount / limit),
      hasMore: skip + limit < totalCount,
    },
    meta: {
      searchTerm: searchTerm || null,
      fuzzyLevel,
      responseTime: `${responseTime}ms`,
      filters: { type, minPrice, maxPrice, city, locality, propertyCategory, status },
    }
  };

  // Cache the result
  setCachedResults(cacheKey, result);

  logger.info('Search executed', {
    searchTerm,
    resultCount: listings.length,
    totalCount,
    responseTime: `${responseTime}ms`,
    userId: req.user?.id,
  });

  sendSuccessResponse(res, result, 'Search results');
});

/**
 * Search Suggestions / Autocomplete Endpoint
 * Returns quick suggestions as user types
 */
export const getSearchSuggestions = asyncHandler(async (req, res, next) => {
  const startTime = Date.now();
  const { q: searchTerm, limit: rawLimit = 8 } = req.query;

  if (!searchTerm || searchTerm.trim().length < 2) {
    return sendSuccessResponse(res, { suggestions: [] }, 'Suggestions');
  }

  const limit = Math.min(parseInt(rawLimit) || 8, 15);
  const termLower = searchTerm.toLowerCase().trim();

  // Check cache
  const cacheKey = `listing:suggestions:${termLower}`;
  const cached = getCachedResults(cacheKey);
  if (cached) {
    return sendSuccessResponse(res, cached, 'Suggestions (cached)');
  }

  // Build regex for prefix matching (fastest)
  const prefixRegex = new RegExp(`^${termLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
  const containsRegex = new RegExp(termLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

  // Get suggestions from different fields
  const [
    nameSuggestions,
    citySuggestions,
    localitySuggestions,
    areaSuggestions
  ] = await Promise.all([
    // Name suggestions (prefix match)
    Listing.find({ name: prefixRegex, isDeleted: { $ne: true } })
      .select('name')
      .limit(limit)
      .lean(),
    // City suggestions (distinct values)
    Listing.distinct('city', { city: containsRegex, isDeleted: { $ne: true } }),
    // Locality suggestions
    Listing.distinct('locality', { locality: containsRegex, isDeleted: { $ne: true } }),
    // Area name suggestions
    Listing.distinct('areaName', { areaName: containsRegex, isDeleted: { $ne: true } }),
  ]);

  // Combine and dedupe suggestions
  const suggestions = new Map();

  // Process name suggestions (highest priority)
  nameSuggestions.forEach(doc => {
    if (doc.name) {
      suggestions.set(doc.name.toLowerCase(), {
        text: doc.name,
        type: 'property',
        priority: 4
      });
    }
  });

  // Process city suggestions
  citySuggestions.slice(0, 5).forEach(city => {
    if (city) {
      const key = city.toLowerCase();
      if (!suggestions.has(key)) {
        suggestions.set(key, { text: city, type: 'city', priority: 3 });
      }
    }
  });

  // Process locality suggestions
  localitySuggestions.slice(0, 5).forEach(locality => {
    if (locality) {
      const key = locality.toLowerCase();
      if (!suggestions.has(key)) {
        suggestions.set(key, { text: locality, type: 'locality', priority: 2 });
      }
    }
  });

  // Process area suggestions
  areaSuggestions.slice(0, 3).forEach(area => {
    if (area) {
      const key = area.toLowerCase();
      if (!suggestions.has(key)) {
        suggestions.set(key, { text: area, type: 'area', priority: 1 });
      }
    }
  });

  // Sort by priority and limit
  const sortedSuggestions = Array.from(suggestions.values())
    .sort((a, b) => b.priority - a.priority)
    .slice(0, limit);

  const result = {
    suggestions: sortedSuggestions,
    query: searchTerm,
    responseTime: `${Date.now() - startTime}ms`
  };

  // Cache for quick subsequent requests
  setCachedResults(cacheKey, result);

  sendSuccessResponse(res, result, 'Suggestions');
});

/**
 * Get Popular/Trending Searches
 * Returns frequently searched terms and locations
 */
export const getPopularSearches = asyncHandler(async (req, res, next) => {
  const { limit: rawLimit = 10 } = req.query;
  const limit = Math.min(parseInt(rawLimit) || 10, 20);

  const cacheKey = `listing:popular:${limit}`;
  const cached = getCachedResults(cacheKey);
  if (cached) {
    return sendSuccessResponse(res, cached, 'Popular searches (cached)');
  }

  // Get popular cities
  const popularCities = await Listing.aggregate([
    { $match: { isDeleted: { $ne: true }, city: { $ne: '' } } },
    { $group: { _id: '$city', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: limit }
  ]);

  // Get popular localities
  const popularLocalities = await Listing.aggregate([
    { $match: { isDeleted: { $ne: true }, locality: { $ne: '' } } },
    { $group: { _id: '$locality', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: limit }
  ]);

  // Get popular property types
  const popularPropertyTypes = await Listing.aggregate([
    { $match: { isDeleted: { $ne: true }, propertyType: { $ne: '' } } },
    { $group: { _id: '$propertyType', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 6 }
  ]);

  // Get price ranges
  const priceStats = await Listing.aggregate([
    { $match: { isDeleted: { $ne: true } } },
    {
      $group: {
        _id: null,
        minPrice: { $min: '$regularPrice' },
        maxPrice: { $max: '$regularPrice' },
        avgPrice: { $avg: '$regularPrice' }
      }
    }
  ]);

  const result = {
    popularCities: popularCities.map(c => ({ name: c._id, count: c.count })),
    popularLocalities: popularLocalities.map(l => ({ name: l._id, count: l.count })),
    popularPropertyTypes: popularPropertyTypes.map(p => ({ name: p._id, count: p.count })),
    priceStats: priceStats[0] || { minPrice: 0, maxPrice: 0, avgPrice: 0 },
  };

  setCachedResults(cacheKey, result);
  sendSuccessResponse(res, result, 'Popular searches');
});

export const addVoiceNote = asyncHandler(async (req, res, next) => {
  const listing = await Listing.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
  if (!listing) throw new NotFoundError('Listing not found');
  if (!canAccessListing(req.user, listing, { allowAssignedAgent: true })) {
    throw new AuthorizationError('Not authorised to add notes to this listing');
  }

  const { url, label, duration } = req.body;
  if (!url) throw new ValidationError('url is required', 'url');

  listing.voiceNotes.push({ url, label: label || '', duration: duration || 0, createdBy: req.user.id });
  await listing.save();

  const note = listing.voiceNotes[listing.voiceNotes.length - 1];
  res.status(201).json({ success: true, data: note });
});

export const deleteVoiceNote = asyncHandler(async (req, res, next) => {
  const listing = await Listing.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
  if (!listing) throw new NotFoundError('Listing not found');
  if (!canAccessListing(req.user, listing, { allowAssignedAgent: true })) {
    throw new AuthorizationError('Not authorised');
  }

  const note = listing.voiceNotes.id(req.params.noteId);
  if (!note) throw new NotFoundError('Voice note not found');

  note.deleteOne();
  await listing.save();
  res.json({ success: true });
});

import BuyerRequirement from '../models/buyerRequirement.model.js';
import Listing from '../models/listing.model.js';
import { errorHandler } from '../utils/error.js';
import { listingScope } from '../middleware/permissions.js';
import { streamCsv } from '../utils/csvExport.js';
import mongoose from 'mongoose';

// Admins and employees manage buyer requirements org-wide; everyone else (e.g. a buyer's own
// self-service account) is restricted to requirements they created.
const isStaff = (user) => user.role === 'admin' || user.role === 'employee';

/** Treat user input as literal text inside a regex query. */
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const createBuyerRequirement = async (req, res, next) => {
  try {
    const buyerRequirement = await BuyerRequirement.create({
      ...req.body,
      createdBy: req.user.id,
    });

    res.status(201).json(buyerRequirement);
  } catch (error) {
    next(error);
  }
};

/**
 * The filter behind the list, shared by the list, the export and bulk actions,
 * so a CSV can never contain rows the user had filtered out.
 */
function buildBuyerFilter(req) {
  const {
    search, propertyType, status, priority,
    preferredCity, preferredLocality, assignedAgent, propertyTypeInterest,
  } = req.query;

  const query = { isDeleted: { $ne: true } };

  // Staff manage buyers workspace-wide; anyone else sees only what they created.
  if (!isStaff(req.user)) {
    query.createdBy = req.user.id;
  }

  if (search) {
    // Escaped: a search box is user input and must not become a regex that
    // matches everything, or one that backtracks catastrophically.
    const safe = escapeRegex(search);
    query.$or = [
      { buyerName: { $regex: safe, $options: 'i' } },
      { preferredLocation: { $regex: safe, $options: 'i' } },
      { additionalRequirements: { $regex: safe, $options: 'i' } },
      { buyerEmail: { $regex: safe, $options: 'i' } },
      { buyerPhone: { $regex: safe, $options: 'i' } },
    ];
  }

  if (propertyType && propertyType !== 'all') query.propertyType = propertyType;
  if (status && status !== 'all') query.status = status;
  if (priority && priority !== 'all') query.priority = priority;
  if (propertyTypeInterest && propertyTypeInterest !== 'all') query.propertyTypeInterest = propertyTypeInterest;

  if (preferredCity && preferredCity.trim() && preferredCity !== 'all') {
    query.preferredCity = { $regex: escapeRegex(preferredCity.trim()), $options: 'i' };
  }

  if (preferredLocality && preferredLocality.trim() && preferredLocality !== 'all') {
    query.preferredLocality = { $regex: escapeRegex(preferredLocality.trim()), $options: 'i' };
  }

  if (assignedAgent && assignedAgent !== 'all') {
    query.assignedAgent = assignedAgent === 'unassigned' ? null : assignedAgent;
  }

  return query;
}

export const getBuyerRequirements = async (req, res, next) => {
  try {
    const buyerRequirements = await BuyerRequirement.find(buildBuyerFilter(req))
      .sort({ createdAt: -1 })
      .populate('matchedProperties', 'name price imageUrls address')
      .populate('createdBy', 'username email')
      .populate('assignedAgent', 'username email firstName lastName');

    res.json(buyerRequirements);
  } catch (error) {
    next(error);
  }
};

/** Export the filtered set of buyers. */
export const exportBuyerRequirements = async (req, res, next) => {
  try {
    const cursor = BuyerRequirement.find(buildBuyerFilter(req))
      .sort({ createdAt: -1 })
      .limit(50_000)
      .populate('assignedAgent', 'username email')
      .lean()
      .cursor();

    await streamCsv(res, {
      filename: 'buyers',
      headers: [
        'Name', 'Email', 'Phone', 'Property type', 'Status', 'Priority',
        'Min price', 'Max price', 'Min bedrooms', 'Min bathrooms',
        'Preferred location', 'City', 'Locality', 'Assigned agent',
        'Matched properties', 'Follow-up', 'Created',
      ],
      cursor,
      toRow: (b) => [
        b.buyerName || '',
        b.buyerEmail || '',
        b.buyerPhone || '',
        b.propertyType || '',
        b.status || '',
        b.priority || '',
        b.minPrice ?? 0,
        b.maxPrice ?? 0,
        b.minBedrooms ?? 0,
        b.minBathrooms ?? 0,
        b.preferredLocation || '',
        b.preferredCity || '',
        b.preferredLocality || '',
        b.assignedAgent?.username || '',
        (b.matchedProperties || []).length,
        b.followUpDate,
        b.createdAt,
      ],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Act on a selection of buyers.
 *
 * Same scoping rule as a single edit: a non-staff caller's selection is
 * narrowed to what they created before anything is written, so an id they were
 * not meant to touch is excluded rather than acted on.
 */
export const bulkUpdateBuyerRequirements = async (req, res, next) => {
  try {
    const { ids, action, value } = req.body || {};

    if (!Array.isArray(ids) || !ids.length) return next(errorHandler(400, 'Select at least one buyer'));
    if (ids.length > 500) return next(errorHandler(400, 'Too many at once — select up to 500'));

    const validIds = ids.filter((id) => mongoose.isValidObjectId(id));
    if (!validIds.length) return next(errorHandler(400, 'No valid ids'));

    const scope = { _id: { $in: validIds }, isDeleted: { $ne: true } };
    if (!isStaff(req.user)) scope.createdBy = req.user.id;

    let update;
    if (action === 'delete') {
      update = { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: req.user.id } };
    } else if (action === 'status') {
      const allowed = BuyerRequirement.schema.path('status').enumValues;
      if (!allowed.includes(value)) return next(errorHandler(400, 'Unknown status'));
      update = { $set: { status: value } };
    } else if (action === 'assign') {
      if (!isStaff(req.user)) return next(errorHandler(403, 'Only staff can reassign'));
      if (!mongoose.isValidObjectId(value)) return next(errorHandler(400, 'Choose an agent'));
      update = { $set: { assignedAgent: value } };
    } else {
      return next(errorHandler(400, 'Unknown action'));
    }

    const result = await BuyerRequirement.updateMany(scope, update);
    res.json({
      success: true,
      data: { matched: result.matchedCount, modified: result.modifiedCount, requested: ids.length },
    });
  } catch (error) {
    next(error);
  }
};

export const getBuyerRequirement = async (req, res, next) => {
  try {
    const buyerRequirement = await BuyerRequirement.findOne({ _id: req.params.id, isDeleted: { $ne: true } })
      .populate('matchedProperties', 'name price imageUrls address bedrooms bathrooms');

    if (!buyerRequirement) {
      return next(errorHandler(404, 'Buyer requirement not found'));
    }

    if (!isStaff(req.user) && buyerRequirement.createdBy.toString() !== req.user.id) {
      return next(errorHandler(403, 'Forbidden'));
    }

    res.json(buyerRequirement);
  } catch (error) {
    next(error);
  }
};

export const updateBuyerRequirement = async (req, res, next) => {
  try {
    const buyerRequirement = await BuyerRequirement.findById(req.params.id);

    if (!buyerRequirement) {
      return next(errorHandler(404, 'Buyer requirement not found'));
    }

    if (!isStaff(req.user) && buyerRequirement.createdBy.toString() !== req.user.id) {
      return next(errorHandler(403, 'You can only update your own buyer requirements'));
    }

    const updatedBuyerRequirement = await BuyerRequirement.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    res.json(updatedBuyerRequirement);
  } catch (error) {
    next(error);
  }
};

export const deleteBuyerRequirement = async (req, res, next) => {
  try {
    const buyerRequirement = await BuyerRequirement.findById(req.params.id);

    if (!buyerRequirement) {
      return next(errorHandler(404, 'Buyer requirement not found'));
    }

    // Allow staff (admin/employee) or owner to delete
    if (!isStaff(req.user) && buyerRequirement.createdBy.toString() !== req.user.id) {
      return next(errorHandler(403, 'You can only delete your own buyer requirements'));
    }

    await BuyerRequirement.findByIdAndUpdate(req.params.id, {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: req.user.id,
    });

    res.json({ message: 'Buyer requirement deleted successfully' });
  } catch (error) {
    next(error);
  }
};

export const findMatchingProperties = async (req, res, next) => {
  try {
    const buyerRequirement = await BuyerRequirement.findById(req.params.id);

    if (!buyerRequirement) {
      return next(errorHandler(404, 'Buyer requirement not found'));
    }

    if (!isStaff(req.user) && buyerRequirement.createdBy.toString() !== req.user.id) {
      return next(errorHandler(403, 'You can only view matches for your own buyer requirements'));
    }

    /*
     * Search the listings this user is allowed to see, not only the ones they
     * personally created.
     *
     * This used to be `Listing.find({ userRef: req.user.id })`, which in an
     * agency means "properties I typed in myself" — so an admin browsing a
     * colleague's buyer got no matches and the feature looked broken. The
     * workspace boundary is already enforced by the tenant plugin; listingScope
     * adds the per-role rule (admins see all, employees their categories and
     * assignments, sellers their own).
     *
     * The hard criteria are pushed into the query rather than filtered in
     * JavaScript, so this does not load a whole workspace's listings into
     * memory to throw most of them away.
     */
    const query = {
      ...listingScope(req.user),
      isDeleted: { $ne: true },
    };

    if (buyerRequirement.propertyType) query.type = buyerRequirement.propertyType;
    if (buyerRequirement.minBedrooms > 0) query.bedrooms = { $gte: buyerRequirement.minBedrooms };
    if (buyerRequirement.minBathrooms > 0) query.bathrooms = { $gte: buyerRequirement.minBathrooms };

    if (buyerRequirement.minPrice > 0 || buyerRequirement.maxPrice > 0) {
      query.regularPrice = {};
      if (buyerRequirement.minPrice > 0) query.regularPrice.$gte = buyerRequirement.minPrice;
      if (buyerRequirement.maxPrice > 0) query.regularPrice.$lte = buyerRequirement.maxPrice;
    }

    if (buyerRequirement.preferredLocation) {
      // Escaped: a buyer's stored location is user input and must not become a
      // regex that matches everything, or a ReDoS.
      const safe = String(buyerRequirement.preferredLocation)
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.address = { $regex: safe, $options: 'i' };
    }

    const properties = await Listing.find(query).limit(200);

    const matchingProperties = properties
      .filter((property) => buyerRequirement.matchesProperty(property))
      .map((property) => ({
        ...property.toObject(),
        matchingScore: buyerRequirement.getMatchingScore(property),
      }))
      .sort((a, b) => b.matchingScore - a.matchingScore);

    res.json({
      success: true,
      buyerRequirement,
      matchingProperties,
      totalMatches: matchingProperties.length,
    });
  } catch (error) {
    next(error);
  }
};

export const addMatchedProperty = async (req, res, next) => {
  try {
    const { buyerRequirementId, propertyId } = req.body;

    const buyerRequirement = await BuyerRequirement.findById(buyerRequirementId);

    if (!buyerRequirement) {
      return next(errorHandler(404, 'Buyer requirement not found'));
    }

    if (!isStaff(req.user) && buyerRequirement.createdBy.toString() !== req.user.id) {
      return next(errorHandler(403, 'You can only update your own buyer requirements'));
    }

    // Check if property exists and belongs to user
    const property = await Listing.findById(propertyId);
    if (!property || property.userRef.toString() !== req.user.id) {
      return next(errorHandler(404, 'Property not found or does not belong to you'));
    }

    // Add property to matched properties if not already added
    if (!buyerRequirement.matchedProperties.includes(propertyId)) {
      buyerRequirement.matchedProperties.push(propertyId);
      await buyerRequirement.save();
    }

    res.json(buyerRequirement);
  } catch (error) {
    next(error);
  }
};

export const removeMatchedProperty = async (req, res, next) => {
  try {
    const { buyerRequirementId, propertyId } = req.body;

    const buyerRequirement = await BuyerRequirement.findById(buyerRequirementId);

    if (!buyerRequirement) {
      return next(errorHandler(404, 'Buyer requirement not found'));
    }

    if (!isStaff(req.user) && buyerRequirement.createdBy.toString() !== req.user.id) {
      return next(errorHandler(403, 'You can only update your own buyer requirements'));
    }

    // Remove property from matched properties
    buyerRequirement.matchedProperties = buyerRequirement.matchedProperties.filter(
      id => id.toString() !== propertyId
    );
    await buyerRequirement.save();

    res.json(buyerRequirement);
  } catch (error) {
    next(error);
  }
};

export const updateBuyerStatus = async (req, res, next) => {
  try {
    const { status } = req.body;

    const buyerRequirement = await BuyerRequirement.findById(req.params.id);

    if (!buyerRequirement) {
      return next(errorHandler(404, 'Buyer requirement not found'));
    }

    if (!isStaff(req.user) && buyerRequirement.createdBy.toString() !== req.user.id) {
      return next(errorHandler(403, 'You can only update your own buyer requirements'));
    }

    buyerRequirement.status = status;
    if (status === 'matched') {
      buyerRequirement.lastContactDate = new Date();
    }
    await buyerRequirement.save();

    res.json(buyerRequirement);
  } catch (error) {
    next(error);
  }
};

export const getBuyerStats = async (req, res, next) => {
  try {
    const stats = await BuyerRequirement.aggregate([
      { $match: { createdBy: req.user.id, isDeleted: { $ne: true } } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
          matched: { $sum: { $cond: [{ $eq: ['$status', 'matched'] }, 1, 0] } },
          closed: { $sum: { $cond: [{ $eq: ['$status', 'closed'] }, 1, 0] } },
          highPriority: { $sum: { $cond: [{ $eq: ['$priority', 'high'] }, 1, 0] } },
        },
      },
    ]);

    const propertyTypeStats = await BuyerRequirement.aggregate([
      { $match: { createdBy: req.user.id, isDeleted: { $ne: true } } },
      {
        $group: {
          _id: '$propertyType',
          count: { $sum: 1 },
        },
      },
    ]);

    res.json({
      overview: stats[0] || { total: 0, active: 0, matched: 0, closed: 0, highPriority: 0 },
      byPropertyType: propertyTypeStats,
    });
  } catch (error) {
    next(error);
  }
};

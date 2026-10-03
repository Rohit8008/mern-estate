import BuyerRequirement from '../models/buyerRequirement.model.js';
import Listing from '../models/listing.model.js';
import Client from '../models/client.model.js';
import { errorHandler, ValidationError } from '../utils/error.js';
import { findDuplicateClient } from './client.controller.js';
import { buyerPhoneOf } from '../utils/phoneKey.js';
import { listingScope } from '../middleware/permissions.js';
import { streamCsv } from '../utils/csvExport.js';
import { parsePaging, parseSort } from '../utils/listQuery.js';
import mongoose from 'mongoose';
import { emitEvent } from '../utils/webhooks.js';
import { escapeRegex } from '../utils/escapeRegex.js';

// Admins and employees manage buyer requirements org-wide; everyone else (e.g. a buyer's own
// self-service account) is restricted to requirements they created.
const isStaff = (user) => user.role === 'admin' || user.role === 'employee';

/** Treat user input as literal text inside a regex query. */

/** Staff see every client; anyone else only the ones assigned to them. */
const canSeeClient = (user, assignedTo) =>
  user.role === 'admin' || String(assignedTo?._id || assignedTo) === String(user.id);

/**
 * Which client a requirement belongs to.
 *   • clientId named  → that client, which must exist and be one the caller can see.
 *   • clientId null   → deliberately not linked.
 *   • clientId absent → the client already on file with this phone or email, if
 *     the caller can see them, so typing a known person's number attaches to
 *     them instead of leaving a second, unconnected record. No match is not an
 *     error: a walk-in need not be a lead.
 */
async function resolveClientId(req, body) {
  if (body.clientId === null) return null;
  if (body.clientId) {
    const client = await Client.findOne({ _id: body.clientId, isDeleted: { $ne: true } })
      .select('assignedTo name phone email').lean();
    if (!client || !canSeeClient(req.user, client.assignedTo)) {
      throw new ValidationError('That client was not found.', 'clientId');
    }
    return client;
  }
  const match = await findDuplicateClient({ phone: body.buyerPhone, email: body.buyerEmail });
  return match && canSeeClient(req.user, match.assignedTo) ? match : null;
}

/**
 * The linked client's details, in the shape a requirement stores them. The
 * client is the source; what was typed in the form is only a convenience.
 */
const contactCopyOf = (client) => client
  ? { clientId: client._id, buyerName: String(client.name || '').slice(0, 100), buyerPhone: buyerPhoneOf(client.phone), buyerEmail: client.email || '' }
  : { clientId: null };

export const createBuyerRequirement = async (req, res, next) => {
  try {
    const client = await resolveClientId(req, req.body);
    const buyerRequirement = await BuyerRequirement.create({
      ...req.body,
      ...contactCopyOf(client),
      createdBy: req.user.id,
    });

    emitEvent('buyer.created', {
      id: String(buyerRequirement._id),
      propertyTypeInterest: buyerRequirement.propertyTypeInterest,
      preferredCity: buyerRequirement.preferredCity,
      status: buyerRequirement.status,
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
    preferredCity, preferredLocality, assignedAgent, propertyTypeInterest, clientId,
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

  // String()-coerced and shape-checked: a query value is user input, and an
  // object here would be a Mongo operator.
  if (clientId && mongoose.isValidObjectId(String(clientId))) query.clientId = String(clientId);
  if (propertyType && propertyType !== 'all') query.propertyType = propertyType;
  if (status && status !== 'all') query.status = status;
  if (priority && priority !== 'all') query.priority = priority;
  if (propertyTypeInterest && propertyTypeInterest !== 'all') query.propertyTypeInterest = propertyTypeInterest;

  if (preferredCity && preferredCity.trim() && preferredCity !== 'all') {
    query.preferredCity = { $regex: escapeRegex(String(preferredCity).trim()), $options: 'i' };
  }

  if (preferredLocality && preferredLocality.trim() && preferredLocality !== 'all') {
    query.preferredLocality = { $regex: escapeRegex(String(preferredLocality).trim()), $options: 'i' };
  }

  if (assignedAgent && assignedAgent !== 'all') {
    query.assignedAgent = assignedAgent === 'unassigned' ? null : assignedAgent;
  }

  return query;
}

/**
 * Orders the buyer list can be sorted in — see parseSort. Not budget (a free
 * text field, so its order is alphabetical, not by amount) and not priority
 * (an enum, which would sort high → low → medium).
 */
const BUYER_SORTS = {
  name: 'buyerName',
  status: 'status',
  followUpDate: 'followUpDate',
  lastContactDate: 'lastContactDate',
  createdAt: 'createdAt',
};

const populateBuyer = (q) => q
  .populate('matchedProperties', 'name price imageUrls address')
  .populate('createdBy', 'username email')
  .populate('assignedAgent', 'username email firstName lastName');

export const getBuyerRequirements = async (req, res, next) => {
  try {
    const filter = buildBuyerFilter(req);

    // Paged only when asked. Without `page` the answer stays the bare array
    // the mobile app reads, newest first and unpaged, exactly as before.
    if (req.query.page === undefined) {
      const buyerRequirements = await populateBuyer(BuyerRequirement.find(filter).sort({ createdAt: -1 }));
      return res.json(buyerRequirements);
    }

    const { page, limit, skip } = parsePaging(req.query);
    const sort = parseSort(req.query.sort, BUYER_SORTS, { createdAt: -1 });
    const [items, total] = await Promise.all([
      populateBuyer(BuyerRequirement.find(filter).sort(sort).skip(skip).limit(limit)),
      BuyerRequirement.countDocuments(filter),
    ]);
    return res.json({ success: true, data: items, page, limit, total });
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

    const update = { ...req.body };
    // Only re-resolve when the caller touched the link: an edit that leaves it
    // alone must not re-attach a requirement someone unlinked on purpose.
    if (Object.prototype.hasOwnProperty.call(req.body, 'clientId')) {
      Object.assign(update, contactCopyOf(await resolveClientId(req, req.body)));
    }

    const updatedBuyerRequirement = await BuyerRequirement.findByIdAndUpdate(
      req.params.id,
      update,
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

    // Saveable if the caller can SEE it — the same rule that produced the match
    // list. Requiring authorship made an admin's save of a colleague's listing
    // fail on a match the screen had just offered.
    if (!mongoose.isValidObjectId(propertyId)) return next(errorHandler(400, 'Invalid property'));
    const property = await Listing.findOne({ _id: propertyId, ...listingScope(req.user), isDeleted: { $ne: true } });
    if (!property) {
      return next(errorHandler(404, 'Property not found'));
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
    // aggregate() does not cast, so the id has to be an ObjectId to match; and
    // staff see the whole workspace, as the list does.
    const match = { isDeleted: { $ne: true } };
    if (!isStaff(req.user)) match.createdBy = new mongoose.Types.ObjectId(req.user.id);

    const stats = await BuyerRequirement.aggregate([
      { $match: match },
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
      { $match: match },
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

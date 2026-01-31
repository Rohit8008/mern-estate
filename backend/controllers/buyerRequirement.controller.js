import BuyerRequirement from '../models/buyerRequirement.model.js';
import Listing from '../models/listing.model.js';
import { errorHandler } from '../utils/error.js';

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

export const getBuyerRequirements = async (req, res, next) => {
  try {
    const { search, propertyType, status, priority } = req.query;
    const query = {};

    // Only filter by createdBy if user is not admin or employee
    if (req.user.role !== 'admin' && req.user.role !== 'employee') {
      query.createdBy = req.user.id;
    }

    // Add search filter
    if (search) {
      query.$or = [
        { buyerName: { $regex: search, $options: 'i' } },
        { preferredLocation: { $regex: search, $options: 'i' } },
        { additionalRequirements: { $regex: search, $options: 'i' } },
        { buyerEmail: { $regex: search, $options: 'i' } },
        { buyerPhone: { $regex: search, $options: 'i' } },
      ];
    }

    // Add property type filter
    if (propertyType && propertyType !== 'all') {
      query.propertyType = propertyType;
    }

    // Add status filter
    if (status && status !== 'all') {
      query.status = status;
    }

    // Add priority filter
    if (priority && priority !== 'all') {
      query.priority = priority;
    }

    const buyerRequirements = await BuyerRequirement.find(query)
      .sort({ createdAt: -1 })
      .populate('matchedProperties', 'name price imageUrls address')
      .populate('createdBy', 'username email');

    res.json(buyerRequirements);
  } catch (error) {
    next(error);
  }
};

export const getBuyerRequirement = async (req, res, next) => {
  try {
    const buyerRequirement = await BuyerRequirement.findById(req.params.id)
      .populate('matchedProperties', 'name price imageUrls address bedrooms bathrooms');

    if (!buyerRequirement) {
      return next(errorHandler(404, 'Buyer requirement not found'));
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

    if (buyerRequirement.createdBy.toString() !== req.user.id) {
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

    if (buyerRequirement.createdBy.toString() !== req.user.id) {
      return next(errorHandler(403, 'You can only delete your own buyer requirements'));
    }

    await BuyerRequirement.findByIdAndDelete(req.params.id);

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

    if (buyerRequirement.createdBy.toString() !== req.user.id) {
      return next(errorHandler(403, 'You can only view matches for your own buyer requirements'));
    }

    // Get all properties created by the user
    const properties = await Listing.find({ userRef: req.user.id });

    // Find matching properties
    const matchingProperties = properties
      .filter(property => buyerRequirement.matchesProperty(property))
      .map(property => ({
        ...property.toObject(),
        matchingScore: buyerRequirement.getMatchingScore(property),
      }))
      .sort((a, b) => b.matchingScore - a.matchingScore);

    res.json({
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

    if (buyerRequirement.createdBy.toString() !== req.user.id) {
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

    if (buyerRequirement.createdBy.toString() !== req.user.id) {
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

    if (buyerRequirement.createdBy.toString() !== req.user.id) {
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
      { $match: { createdBy: req.user.id } },
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
      { $match: { createdBy: req.user.id } },
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

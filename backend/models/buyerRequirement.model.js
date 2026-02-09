import mongoose from 'mongoose';

const buyerRequirementSchema = new mongoose.Schema(
  {
    buyerName: {
      type: String,
      required: [true, 'Buyer name is required'],
      trim: true,
    },
    buyerEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
    buyerPhone: {
      type: String,
      trim: true,
      match: [/^\+?\d{10,15}$/, 'Please fill a valid phone number'],
    },
    preferredLocation: {
      type: String,
      trim: true,
    },
    preferredCity: {
      type: String,
      trim: true,
      index: true,
    },
    preferredLocality: {
      type: String,
      trim: true,
      index: true,
    },
    propertyType: {
      type: String,
      required: [true, 'Property type is required'],
      enum: ['sale', 'rent'],
      default: 'sale',
    },
    propertyTypeInterest: {
      type: String,
      enum: ['residential', 'commercial', 'land', 'any'],
      default: 'any',
      index: true,
    },
    minPrice: {
      type: Number,
      default: 0,
    },
    maxPrice: {
      type: Number,
      default: 0,
    },
    minBedrooms: {
      type: Number,
      default: 0,
    },
    minBathrooms: {
      type: Number,
      default: 0,
    },
    preferredArea: {
      type: String,
      trim: true,
    },
    additionalRequirements: {
      type: String,
      trim: true,
    },
    preferredMoveInDate: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['active', 'matched', 'closed', 'inactive'],
      default: 'active',
    },
    notes: {
      type: String,
      trim: true,
    },
    budget: {
      type: String,
      trim: true,
    },
    timeline: {
      type: String,
      trim: true,
    },
    matchedProperties: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Listing',
    }],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    lastContactDate: {
      type: Date,
      default: Date.now,
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
    assignedAgent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    followUpDate: {
      type: Date,
      default: null,
      index: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Index for better search performance
buyerRequirementSchema.index({ buyerName: 'text', preferredLocation: 'text', additionalRequirements: 'text' });
buyerRequirementSchema.index({ propertyType: 1, status: 1 });
buyerRequirementSchema.index({ createdBy: 1 });
buyerRequirementSchema.index({ preferredCity: 1, preferredLocality: 1 });
buyerRequirementSchema.index({ assignedAgent: 1, status: 1, followUpDate: 1 });
buyerRequirementSchema.index({ propertyTypeInterest: 1, status: 1 });

// Virtual for full name
buyerRequirementSchema.virtual('fullName').get(function() {
  return this.buyerName;
});

// Method to check if a property matches this requirement
buyerRequirementSchema.methods.matchesProperty = function(property) {
  // Check property type
  if (this.propertyType !== property.type) {
    return false;
  }

  // Check price range
  if (this.minPrice > 0 && property.regularPrice < this.minPrice) {
    return false;
  }
  if (this.maxPrice > 0 && property.regularPrice > this.maxPrice) {
    return false;
  }

  // Check bedrooms
  if (this.minBedrooms > 0 && property.bedrooms < this.minBedrooms) {
    return false;
  }

  // Check bathrooms
  if (this.minBathrooms > 0 && property.bathrooms < this.minBathrooms) {
    return false;
  }

  // Check location (basic string matching)
  if (this.preferredLocation && 
      !property.address.toLowerCase().includes(this.preferredLocation.toLowerCase())) {
    return false;
  }

  return true;
};

// Method to get matching score
buyerRequirementSchema.methods.getMatchingScore = function(property) {
  let score = 0;
  let totalChecks = 0;

  // Property type match (required)
  if (this.propertyType === property.type) {
    score += 30;
  }
  totalChecks += 30;

  // Price range match
  if (this.minPrice > 0 || this.maxPrice > 0) {
    totalChecks += 20;
    if (this.minPrice <= property.regularPrice && property.regularPrice <= this.maxPrice) {
      score += 20;
    } else if (this.minPrice > 0 && property.regularPrice >= this.minPrice) {
      score += 10; // Partial match
    } else if (this.maxPrice > 0 && property.regularPrice <= this.maxPrice) {
      score += 10; // Partial match
    }
  }

  // Bedroom match
  if (this.minBedrooms > 0) {
    totalChecks += 15;
    if (property.bedrooms >= this.minBedrooms) {
      score += 15;
    }
  }

  // Bathroom match
  if (this.minBathrooms > 0) {
    totalChecks += 15;
    if (property.bathrooms >= this.minBathrooms) {
      score += 15;
    }
  }

  // Location match
  if (this.preferredLocation) {
    totalChecks += 20;
    if (property.address.toLowerCase().includes(this.preferredLocation.toLowerCase())) {
      score += 20;
    }
  }

  return totalChecks > 0 ? Math.round((score / totalChecks) * 100) : 0;
};

export default mongoose.model('BuyerRequirement', buyerRequirementSchema);

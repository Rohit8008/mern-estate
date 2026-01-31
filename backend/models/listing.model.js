import mongoose from 'mongoose';

const listingSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    address: {
      type: String,
      required: true,
    },
    regularPrice: {
      type: Number,
      required: true,
    },
    discountPrice: {
      type: Number,
      required: true,
    },
    bathrooms: {
      type: Number,
      required: true,
    },
    bedrooms: {
      type: Number,
      required: true,
    },
    furnished: {
      type: Boolean,
      required: true,
    },
    parking: {
      type: Boolean,
      required: true,
    },
    type: {
      type: String,
      required: true,
    },
    offer: {
      type: Boolean,
      required: true,
    },
    imageUrls: {
      type: Array,
      required: false,
      default: [],
    },
    category: {
      type: String, // store category slug for stable referencing
      required: false,
      default: '',
      index: true,
    },
    // Dynamic attributes according to category.fields
    attributes: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
    location: {
      lat: { type: Number, required: false, default: null },
      lng: { type: Number, required: false, default: null },
    },
    // Multiple owners per property (hotel)
    ownerIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'Owner',
      default: [],
      index: true,
    },
    userRef: {
      type: String,
      required: true,
    },
    // New property fields
    areaName: {
      type: String,
      required: false,
      default: '',
    },
    plotSize: {
      type: String,
      required: false,
      default: '',
    },
    sqYard: {
      type: Number,
      required: false,
      default: 0,
    },
    sqYardRate: {
      type: Number,
      required: false,
      default: 0,
    },
    totalValue: {
      type: Number,
      required: false,
      default: 0,
    },
    propertyNo: {
      type: String,
      required: false,
      default: '',
    },
    remarks: {
      type: String,
      required: false,
      default: '',
    },
    otherAttachment: {
      type: String, // Store file URL
      required: false,
      default: '',
    },
  },
  { timestamps: true }
);

// Indexes for better performance
listingSchema.index({ name: 'text', description: 'text', address: 'text' }); // Text search
listingSchema.index({ regularPrice: 1 }); // Price range queries
listingSchema.index({ type: 1, offer: 1 }); // Type and offer filters
listingSchema.index({ furnished: 1, parking: 1 }); // Boolean filters
listingSchema.index({ bedrooms: 1, bathrooms: 1 }); // Room count filters
listingSchema.index({ category: 1 }); // Category filter
listingSchema.index({ userRef: 1 }); // User listings
listingSchema.index({ createdAt: -1 }); // Default sort
listingSchema.index({ regularPrice: 1, createdAt: -1 }); // Price sort with secondary sort
listingSchema.index({ location: '2dsphere' }); // Geospatial queries

// Compound indexes for common query patterns
listingSchema.index({ 
  type: 1, 
  offer: 1, 
  regularPrice: 1, 
  createdAt: -1 
});

listingSchema.index({ 
  category: 1, 
  type: 1, 
  regularPrice: 1 
});

// Pre-save middleware for data validation
listingSchema.pre('save', function(next) {
  // Ensure regularPrice is positive
  if (this.regularPrice <= 0) {
    return next(new Error('Regular price must be positive'));
  }
  
  // Ensure discountPrice is less than regularPrice
  if (this.discountPrice && this.discountPrice >= this.regularPrice) {
    return next(new Error('Discount price must be less than regular price'));
  }
  
  // Ensure bedrooms and bathrooms are positive
  if (this.bedrooms <= 0 || this.bathrooms <= 0) {
    return next(new Error('Bedrooms and bathrooms must be positive'));
  }
  
  next();
});

// Instance methods
listingSchema.methods.isOwner = function(userId) {
  return this.userRef === userId;
};

listingSchema.methods.getFormattedPrice = function() {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(this.regularPrice);
};

// Static methods for common queries
listingSchema.statics.findByCategory = function(category, limit = 10) {
  return this.find({ category })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};

listingSchema.statics.findByPriceRange = function(minPrice, maxPrice) {
  return this.find({
    regularPrice: { $gte: minPrice, $lte: maxPrice }
  }).sort({ regularPrice: 1 });
};

listingSchema.statics.findByLocation = function(coordinates, maxDistance = 10000) {
  return this.find({
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: coordinates
        },
        $maxDistance: maxDistance
      }
    }
  });
};

const Listing = mongoose.model('Listing', listingSchema);

export default Listing;

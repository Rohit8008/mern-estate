import mongoose from 'mongoose';

const listingSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      maxlength: 200,
    },
    description: {
      type: String,
      required: false,
      default: '',
      maxlength: 5000,
    },
    address: {
      type: String,
      required: false,
      default: '',
      maxlength: 300,
    },
    regularPrice: {
      type: Number,
      required: false,
      default: 0,
    },
    discountPrice: {
      type: Number,
      required: false,
      default: 0,
    },
    // 0 means "not given". The default was 1, so every plot, shop and office
    // was recorded — and shown — as "1 bed · 1 bath".
    bathrooms: {
      type: Number,
      required: false,
      default: 0,
    },
    bedrooms: {
      type: Number,
      required: false,
      default: 0,
    },
    /**
     * @deprecated Retired 2026-09-04 by scripts/migrateFieldStores.js.
     *
     * A second dynamic-field store that ran in parallel with `attributes`.
     * Nothing displayed it, so anything written here was invisible — not on the
     * form, not in filters, not in search — and it silently disagreed with the
     * native columns (one listing held sqYard 16.66 in the column and 166.66
     * here).
     *
     * Kept on the schema, without a default, purely so an older client sending
     * the key does not error. Nothing reads it. Dynamic fields go to
     * `attributes`, or to their native column when NATIVE_FIELD_ALIASES maps
     * them there.
     */
    propertyTypeFields: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: undefined,
      select: false,
    },
    furnished: {
      type: Boolean,
      required: false,
      default: false,
    },
    parking: {
      type: Boolean,
      required: false,
      default: false,
    },
    type: {
      type: String,
      required: false,
      default: 'sale',
      enum: ['sale', 'rent', 'lease'],
      index: true,
    },
    offer: {
      type: Boolean,
      required: false,
      default: false,
    },
    imageUrls: {
      type: [String],
      required: false,
      default: [],
    },
    voiceNotes: {
      type: [
        new mongoose.Schema({
          url:       { type: String, required: true },
          label:     { type: String, default: '', maxlength: 200 },
          duration:  { type: Number, default: 0 }, // seconds
          createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        }, { timestamps: true })
      ],
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
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    city: {
      type: String,
      required: false,
      default: '',
      index: true,
      trim: true,
      maxlength: 100,
    },
    locality: {
      type: String,
      required: false,
      default: '',
      index: true,
      trim: true,
      maxlength: 100,
    },
    state: {
      type: String,
      required: false,
      default: '',
      trim: true,
      maxlength: 100,
    },
    pincode: {
      type: String,
      required: false,
      default: '',
      trim: true,
      maxlength: 20,
    },
    areaSqFt: {
      type: Number,
      required: false,
      default: 0,
      index: true,
    },
    status: {
      type: String,
      enum: ['available', 'sold', 'rented', 'under_negotiation'],
      default: 'available',
      index: true,
    },
    assignedAgent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    propertyCategory: {
      type: String,
      enum: ['residential', 'commercial', 'land', 'industrial', 'other', 'unknown'],
      default: 'unknown',
      index: true,
    },
    propertyType: {
      type: String,
      default: '',
      index: true,
    },
    commercialType: {
      type: String,
      enum: ['office', 'shop', 'showroom', 'warehouse', 'other', ''],
      default: '',
      index: true,
    },
    plotType: {
      type: String,
      enum: ['residential', 'commercial', 'agricultural', 'other', ''],
      default: '',
      index: true,
    },
    /**
     * Workspace tags, by id.
     *
     * Referenced rather than embedded as text so a rename or recolour applies
     * everywhere at once. The older free-text `tags` array is left in place for
     * records that already carry values.
     */
    tagIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Tag', index: true }],
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    // New property fields
    areaName: {
      type: String,
      required: false,
      default: '',
      maxlength: 100,
    },
    plotSize: {
      type: String,
      required: false,
      default: '',
      maxlength: 50,
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
      maxlength: 50,
    },
    remarks: {
      type: String,
      required: false,
      default: '',
      maxlength: 3000,
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
// Text search. Weighted, because a term in a property's NAME is a far stronger
// signal than the same term buried in a 5,000-character description — without
// weights every field counts equally and the ranking is meaningless.
//
// A collection may have only one text index, so all searchable prose lives
// here. Locality, area and city are included: "Sushant Lok" and "Sector 57"
// are the two things people actually type, and leaving them out sent every
// such search down to the unindexed fuzzy fallback.
// Every index below is prefixed with `tenantId`.
//
// The global tenant plugin adds a `tenantId` equality predicate to EVERY query,
// so an index that does not lead with it cannot serve `{tenantId: X} sort {…}`:
// MongoDB has to either scan the tenantId index and sort in memory (32MB cap) or
// walk the sort index across every workspace's rows and throw most away. On a
// shared database that also means one large agency degrades search for all the
// others. An equality prefix is exactly what a compound index wants here.
listingSchema.index(
  {
    tenantId: 1,
    name: 'text',
    locality: 'text',
    areaName: 'text',
    city: 'text',
    address: 'text',
    description: 'text',
  },
  {
    name: 'listing_search_text',
    weights: { name: 10, locality: 8, areaName: 8, city: 6, address: 4, description: 1 },
  }
);
listingSchema.index({ tenantId: 1, regularPrice: 1 }); // Price range queries
listingSchema.index({ tenantId: 1, type: 1, offer: 1 }); // Type and offer filters
listingSchema.index({ tenantId: 1, furnished: 1, parking: 1 }); // Boolean filters
listingSchema.index({ tenantId: 1, bedrooms: 1, bathrooms: 1 }); // Room count filters
listingSchema.index({ tenantId: 1, category: 1 }); // Category filter
listingSchema.index({ tenantId: 1, createdAt: -1 }); // Default sort
listingSchema.index({ tenantId: 1, regularPrice: 1, createdAt: -1 }); // Price sort with secondary sort
listingSchema.index({ tenantId: 1, city: 1, locality: 1 });
listingSchema.index({ tenantId: 1, status: 1, assignedAgent: 1, createdAt: -1 });
listingSchema.index({ tenantId: 1, propertyCategory: 1, regularPrice: 1, createdAt: -1 });
listingSchema.index({ tenantId: 1, isDeleted: 1, createdAt: -1 }); // The board's default shape
listingSchema.index({ tenantId: 1, assignedAgent: 1, city: 1, locality: 1, status: 1 });

// Compound indexes for common query patterns
listingSchema.index({
  tenantId: 1,
  type: 1,
  offer: 1,
  regularPrice: 1,
  createdAt: -1,
});

listingSchema.index({
  tenantId: 1,
  category: 1,
  type: 1,
  regularPrice: 1,
});

listingSchema.index({
  tenantId: 1,
  city: 1,
  locality: 1,
  propertyCategory: 1,
  status: 1,
  regularPrice: 1,
  areaSqFt: 1,
  createdAt: -1,
});

// Pre-save middleware for data validation
listingSchema.pre('save', function(next) {
  // Price is optional (many listings are imported without one) — only enforce the
  // discount-vs-regular relationship once a real regularPrice is actually set.
  if (this.discountPrice && this.regularPrice > 0 && this.discountPrice >= this.regularPrice) {
    return next(new Error('Discount price must be less than regular price'));
  }

  next();
});

// Instance methods
listingSchema.methods.isOwner = function(userId) {
  return this.userRef && this.userRef.toString() === userId.toString();
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

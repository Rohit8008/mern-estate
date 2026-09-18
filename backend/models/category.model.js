import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    slug: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 120,
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
    // Dynamic field definitions for listings in this category
    // Example item: { key: 'plotSize', label: 'Plot size', type: 'number', required: false, options: [] }
    fields: {
      type: [
        new mongoose.Schema(
          {
            key: { type: String, required: true, maxlength: 60 },
            label: { type: String, required: true, maxlength: 100 },
            type: { type: String, enum: ['text', 'number', 'boolean', 'select', 'date', 'textarea'], default: 'text', required: true },
            required: { type: Boolean, default: false },
            options: { type: [String], default: [] },
            description: { type: String, default: '', maxlength: 300 },
            placeholder: { type: String, default: '', maxlength: 200 },
            defaultValue: { type: mongoose.Schema.Types.Mixed, default: undefined },
            min: { type: Number, default: undefined },
            max: { type: Number, default: undefined },
            pattern: { type: String, default: '' },
            multiple: { type: Boolean, default: false }, // for select
            order: { type: Number, default: 0 },
            // Conditional field visibility - show this field only when another field has specific value(s)
            // Example: { field: 'propertyType', values: ['Office Space', 'Co-working'] }
            showWhen: {
              type: new mongoose.Schema({
                field: { type: String, required: true }, // The field key to check
                values: { type: [String], required: true }, // Show when field has any of these values
              }, { _id: false }),
              default: null,
            },
            // Field grouping for UI organization
            group: { type: String, default: '', maxlength: 60 }, // e.g., 'basic', 'area', 'amenities', 'pricing'
            // Unit suffix for display (e.g., 'sq ft', 'months')
            unit: { type: String, default: '', maxlength: 30 },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    // Default location for all listings in this category (e.g. a colony's pin),
    // used as a fallback whenever a listing doesn't set its own location.
    defaultLocation: {
      lat: { type: Number, required: false, default: null },
      lng: { type: Number, required: false, default: null },
    },
  },
  { timestamps: true }
);

categorySchema.pre('save', function(next) {
  if (!this.slug && this.name) {
    this.slug = this.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
  next();
});


// ── Tenancy ──────────────────────────────────────────────────────────────────
// Uniqueness is per tenant, not global. Two agencies must each be able to have a category called "Plots".
// A global `unique: true` would let whichever agency signed up first claim
// the name for everyone else.
categorySchema.index({ tenantId: 1, slug: 1 }, { unique: true });
categorySchema.index({ tenantId: 1, name: 1 }, { unique: true });

const Category = mongoose.model('Category', categorySchema);

export default Category;



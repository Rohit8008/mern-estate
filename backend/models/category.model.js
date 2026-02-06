import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
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
            key: { type: String, required: true },
            label: { type: String, required: true },
            type: { type: String, enum: ['text', 'number', 'boolean', 'select', 'date', 'textarea'], default: 'text' },
            required: { type: Boolean, default: false },
            options: { type: [String], default: [] },
            description: { type: String, default: '' },
            placeholder: { type: String, default: '' },
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
            group: { type: String, default: '' }, // e.g., 'basic', 'area', 'amenities', 'pricing'
            // Unit suffix for display (e.g., 'sq ft', 'months')
            unit: { type: String, default: '' },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  { timestamps: true }
);

const Category = mongoose.model('Category', categorySchema);

export default Category;



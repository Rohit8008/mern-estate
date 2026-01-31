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
    // Dynamic field definitions for listings in this category
    // Example item: { key: 'plotSize', label: 'Plot size', type: 'number', required: false, options: [] }
    fields: {
      type: [
        new mongoose.Schema(
          {
            key: { type: String, required: true },
            label: { type: String, required: true },
            type: { type: String, enum: ['text', 'number', 'boolean', 'select', 'date'], default: 'text' },
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



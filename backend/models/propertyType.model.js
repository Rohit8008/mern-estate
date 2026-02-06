import mongoose from 'mongoose';

const fieldSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
  },
  label: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ['text', 'textarea', 'number', 'select', 'boolean', 'date'],
    required: true,
  },
  required: {
    type: Boolean,
    default: false,
  },
  placeholder: {
    type: String,
    default: '',
  },
  options: {
    type: [String],
    default: [],
  },
  min: {
    type: Number,
    default: null,
  },
  max: {
    type: Number,
    default: null,
  },
  unit: {
    type: String,
    default: '',
  },
  defaultValue: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  order: {
    type: Number,
    default: 0,
  },
  group: {
    type: String,
    default: 'general',
  },
  helpText: {
    type: String,
    default: '',
  },
}, { _id: false });

const propertyTypeSchema = new mongoose.Schema(
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
    description: {
      type: String,
      default: '',
    },
    icon: {
      type: String,
      default: '🏠',
    },
    category: {
      type: String,
      enum: ['residential', 'commercial', 'land', 'industrial', 'other'],
      default: 'residential',
    },
    fields: {
      type: [fieldSchema],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isSystem: {
      type: Boolean,
      default: false,
    },
    order: {
      type: Number,
      default: 0,
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
  { timestamps: true }
);

// Indexes
propertyTypeSchema.index({ slug: 1 });
propertyTypeSchema.index({ isActive: 1, order: 1 });
propertyTypeSchema.index({ category: 1, isActive: 1 });

// Pre-save middleware to generate slug
propertyTypeSchema.pre('save', function(next) {
  if (this.isModified('name') && !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
  next();
});

const PropertyType = mongoose.model('PropertyType', propertyTypeSchema);

export default PropertyType;

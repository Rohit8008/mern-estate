import mongoose from 'mongoose';
import bcryptjs from 'bcryptjs';
import validator from 'validator';

const refreshTokenSchema = new mongoose.Schema(
  {
    token: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 2592000, // 30 days
    },
    ip: {
      type: String,
      default: '',
    },
    userAgent: {
      type: String,
      default: '',
    },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
    },
    firstName: {
      type: String,
      default: '',
    },
    lastName: {
      type: String,
      default: '',
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: validator.isEmail,
        message: 'Please provide a valid email address'
      }
    },
    password: {
      type: String,
      minlength: [8, 'Password must be at least 8 characters long'],
      select: false, // Don't include password in queries by default
      default: null,
    },
    avatar:{
      type: String,
      default: "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png"
    },
    phone: {
      type: String,
      default: null,
      // unique index is defined below with partialFilterExpression so null values are never indexed
      validate: {
        validator: function(v) {
          return !v || validator.isMobilePhone(v);
        },
        message: 'Please provide a valid phone number'
      }
    },
    addressLine1: {
      type: String,
      default: '',
    },
    addressLine2: {
      type: String,
      default: '',
    },
    city: {
      type: String,
      default: '',
    },
    state: {
      type: String,
      default: '',
    },
    postalCode: {
      type: String,
      default: '',
    },
    country: {
      type: String,
      default: '',
    },
    company: {
      type: String,
      default: '',
    },
    website: {
      type: String,
      default: '',
    },
    bio: {
      type: String,
      default: '',
      maxlength: 500,
    },
    
    role: {
      type: String,
      enum: ['user', 'buyer', 'seller', 'employee', 'admin'],
      default: 'user',
      index: true,
    },
    assignedRole: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role',
      default: null,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended', 'pending'],
      default: 'active',
      index: true,
    },
    assignedCategories: {
      type: [String], // category slugs the employee can manage
      default: [],
    },
    passwordResetOtpHash: {
      type: String,
      default: null,
      select: false,
    },
    passwordResetOtpExpires: {
      type: Date,
      default: null,
    },
    refreshTokens: {
      type: [refreshTokenSchema],
      default: [],
      set: (tokens) => {
        if (!Array.isArray(tokens)) return tokens;
        return tokens
          .filter(Boolean)
          .map((t) => {
            if (typeof t === 'string') return { token: t };
            if (t && typeof t === 'object' && typeof t.token === 'string') return t;
            return t;
          });
      },
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    passwordChangedAt: {
      type: Date,
      default: null,
      select: false,
    },
    loginCount: {
      type: Number,
      default: 0,
    },
    loginAttempts: {
      type: Number,
      default: 0,
    },
    lockedUntil: {
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
  { timestamps: true }
);

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  if (!this.isModified('password') || !this.password) return next();

  try {
    this.password = await bcryptjs.hash(this.password, 12);
    // Subtract 1s so tokens created just before the change are still invalidated
    if (!this.isNew) {
      this.passwordChangedAt = new Date(Date.now() - 1000);
    }
    next();
  } catch (error) {
    next(error);
  }
});

// Instance method to check password
userSchema.methods.correctPassword = async function(candidatePassword, userPassword) {
  return await bcryptjs.compare(candidatePassword, userPassword);
};

// Instance method to check if password changed after JWT was issued
userSchema.methods.changedPasswordAfter = function(JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`.trim();
});

// Transform JSON output
userSchema.methods.toJSON = function() {
  const userObject = this.toObject();
  delete userObject.password;
  delete userObject.passwordResetOtpHash;
  delete userObject.refreshTokens;
  return userObject;
};

// Indexes for better performance
// Only index non-null phone values — allows unlimited users with phone: null
userSchema.index(
  { phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $type: 'string' } }, name: 'phone_unique_string' }
);
userSchema.index({ role: 1, status: 1 });
userSchema.index({ createdAt: -1 });

const User = mongoose.model('User', userSchema);

export default User;

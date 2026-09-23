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
      maxlength: 50,
    },
    firstName: {
      type: String,
      default: '',
      maxlength: 60,
    },
    lastName: {
      type: String,
      default: '',
      maxlength: 60,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
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
      default: "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png",
      maxlength: 500,
    },
    phone: {
      type: String,
      default: null,
      maxlength: 20,
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
      maxlength: 200,
    },
    addressLine2: {
      type: String,
      default: '',
      maxlength: 200,
    },
    city: {
      type: String,
      default: '',
      maxlength: 100,
    },
    state: {
      type: String,
      default: '',
      maxlength: 100,
    },
    postalCode: {
      type: String,
      default: '',
      maxlength: 20,
    },
    country: {
      type: String,
      default: '',
      maxlength: 80,
    },
    company: {
      type: String,
      default: '',
      maxlength: 120,
    },
    website: {
      type: String,
      default: '',
      maxlength: 200,
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
    /**
     * Invitation to set up this account.
     *
     * Stored hashed for the same reason the password is: the raw token is a
     * credential that grants account setup, and a database dump should not
     * hand out working invite links. Single-use — cleared the moment it is
     * accepted — and it carries no tenant of its own, because the user record
     * it lives on already belongs to exactly one workspace. That is what lets
     * an invited person land in the right agency without knowing it exists.
     */
    inviteTokenHash: {
      type: String,
      default: null,
      select: false,
    },
    inviteExpiresAt: {
      type: Date,
      default: null,
      select: false,
    },
    // Links from earlier sends of the same invitation. They do NOT work — a
    // re-send is also how a leaked link is killed — but they are recognised,
    // so opening the older of two emails says "a newer invitation was sent"
    // instead of "no longer valid, ask for a new one". Hashes only.
    previousInviteTokenHashes: {
      type: [String],
      default: undefined,
      select: false,
    },
    invitedAt: {
      type: Date,
      default: null,
      select: false,
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      select: false,
    },
    passwordResetOtpHash: {
      type: String,
      default: null,
      select: false,
    },
    passwordResetOtpExpires: {
      type: Date,
      default: null,
      select: false,
    },
    /**
     * Wrong guesses against the current code.
     *
     * A 6-digit OTP is a million possibilities and lives for ten minutes, which
     * is only safe if guessing is capped. Without this the code is the weakest
     * credential in the product — weaker than the passwords it resets.
     */
    passwordResetOtpAttempts: {
      type: Number,
      default: 0,
      select: false,
    },
    refreshTokens: {
      type: [refreshTokenSchema],
      default: [],
      select: false,
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
    /**
     * Per-person settings, saved on the account rather than in the browser.
     *
     * The Settings screen used to write these to localStorage behind a fake
     * 500ms delay, so "saved" meant "saved on this device, in this browser,
     * until someone clears site data" — and the notification toggles governed
     * nothing at all.
     *
     * `notifications` is keyed by the notification type ids in
     * utils/notificationTypes.js; anything absent falls back to that
     * catalogue's default, so adding a type does not require a migration.
     */
    preferences: {
      /*
       * A plain object, NOT a Map.
       *
       * Every key in the catalogue is dotted — 'lead.assigned',
       * 'deal.stage_changed', 'task.due' — and Mongoose refuses dotted keys in
       * a Map ("Mongoose maps do not support keys that contain ..."). That made
       * every single save of this field a 500, so notification preferences
       * could never be changed by anyone, on web or mobile; the read path kept
       * answering with catalogue defaults, which made it look like the toggles
       * simply did not stick.
       *
       * Nothing is lost by dropping the Map: both readers (utils/notify.js and
       * notification.controller.js) use .lean(), which hands back a plain
       * object either way. The shape is not enforced by the schema but by
       * updatePreferences, which rejects any key not in the catalogue and
       * coerces both flags to booleans before writing — the right place for it,
       * since the valid keys ARE the catalogue.
       */
      notifications: {
        type: mongoose.Schema.Types.Mixed,
        default: () => ({}),
      },
      /*
       * Saved filter views, keyed by screen ("properties" → [{ id, name,
       * queryString }]). They lived in the browser's localStorage, so a view
       * saved on the office PC was missing on the agent's phone.
       */
      savedViews: {
        type: mongoose.Schema.Types.Mixed,
        default: () => ({}),
      },
      /* The dashboard's custom widgets; they were browser-only as well. */
      dashboardWidgets: {
        type: [mongoose.Schema.Types.Mixed],
        default: undefined,
      },
      privacy: {
        showEmail: { type: Boolean, default: false },
        showPhone: { type: Boolean, default: false },
        showOnlineStatus: { type: Boolean, default: true },
        allowMessages: { type: Boolean, default: true },
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
      select: false,
    },
    lockedUntil: {
      type: Date,
      default: null,
      index: true,
      select: false,
    },
    /**
     * Platform operator — the vendor's own staff, who provision and administer
     * workspaces. Distinct from `role: 'admin'`, which is an admin *of one
     * agency*: a workspace admin runs their agency, a platform admin runs the
     * product.
     *
     * `select: false` keeps it off every ordinary user read, and no
     * tenant-facing controller includes it in an update whitelist — it is set
     * only by scripts/provisionTenant.js and by another platform admin. Left
     * settable through the normal user API, it would be a one-request
     * escalation from "admin of one agency" to "administers every agency".
     */
    isPlatformAdmin: {
      type: Boolean,
      default: false,
      select: false,
    },
    /** Set when a data-subject erasure removed this record's personal details. */
    erasedAt: { type: Date, default: null },
    erasedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
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
  delete userObject.inviteTokenHash;
  delete userObject.previousInviteTokenHashes;
  delete userObject.refreshTokens;
  return userObject;
};

// Indexes for better performance
// Only index non-null phone values — allows unlimited users with phone: null
// ── Tenancy ──────────────────────────────────────────────────────────────────
// A person can hold an account at two agencies with the same email address, and
// two agencies will both want a user called "admin" — so identity is unique per
// tenant, never globally. Sign-in therefore has to resolve the tenant before it
// can resolve the user; see resolveTenant.js.
userSchema.index({ tenantId: 1, email: 1 }, { unique: true });
userSchema.index({ tenantId: 1, username: 1 }, { unique: true });
userSchema.index(
  { tenantId: 1, phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $type: 'string' } }, name: 'tenant_phone_unique_string' }
);
userSchema.index({ role: 1, status: 1 });
userSchema.index({ createdAt: -1 });

const User = mongoose.model('User', userSchema);

export default User;

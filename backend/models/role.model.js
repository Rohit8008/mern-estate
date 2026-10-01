import mongoose from 'mongoose';
import { permissionSchemaFields } from '../utils/permissionCatalogue.js';
import { DEFAULT_ROLES } from '../utils/defaultRoles.js';

const roleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: { 
      type: String, 
      default: '',
      maxlength: 500 
    },
    // Generated from utils/permissionCatalogue.js so the schema, the admin
    // UI catalogue and requirePermission() can never drift apart again.
    permissions: permissionSchemaFields(),
    isActive: { type: Boolean, default: true },
    isSystem: { type: Boolean, default: false }, // System roles cannot be deleted
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    updatedBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User' 
    }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Index for better performance
roleSchema.index({ name: 1, isActive: 1 });
roleSchema.index({ 'permissions.createListing': 1 });
roleSchema.index({ 'permissions.toggleOwnerActive': 1 });

// Virtual for permission count
roleSchema.virtual('permissionCount').get(function() {
  return Object.values(this.permissions).filter(Boolean).length;
});

// Method to check if role has specific permission
roleSchema.methods.hasPermission = function(permission) {
  return this.permissions[permission] === true;
};

// Method to get all active permissions
roleSchema.methods.getActivePermissions = function() {
  return Object.keys(this.permissions).filter(permission => 
    this.permissions[permission] === true
  );
};

// The built-in roles. One definition, shared with scripts/seedRoles.js.
roleSchema.statics.getDefaultRoles = function getDefaultRoles() {
  // Copies, so a caller cannot mutate the shared (frozen) definition.
  return DEFAULT_ROLES.map((role) => ({ ...role, permissions: { ...role.permissions } }));
};


// ── Tenancy ──────────────────────────────────────────────────────────────────
// Uniqueness is per tenant, not global. Two agencies must each be able to have a "Sales Manager" role.
// A global `unique: true` would let whichever agency signed up first claim
// the name for everyone else.
roleSchema.index({ tenantId: 1, name: 1 }, { unique: true });

const Role = mongoose.model('Role', roleSchema);

export default Role;

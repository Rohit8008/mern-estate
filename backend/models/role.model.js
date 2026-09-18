import mongoose from 'mongoose';
import { permissionSchemaFields } from '../utils/permissionCatalogue.js';

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

// Static method to get default roles
roleSchema.statics.getDefaultRoles = function() {
  return [
    {
      name: 'Super Admin',
      description: 'Full system access with all permissions',
      isSystem: true,
      permissions: {
        createUser: true,
        updateUser: true,
        deleteUser: true,
        viewUsers: true,
        createClient: true,
        updateClient: true,
        deleteClient: true,
        viewClients: true,
        createOwner: true,
        updateOwner: true,
        deleteOwner: true,
        viewOwners: true,
        toggleOwnerActive: true,
        createListing: true,
        updateListing: true,
        deleteListing: true,
        viewListings: true,
        publishListing: true,
        createCategory: true,
        updateCategory: true,
        deleteCategory: true,
        viewCategories: true,
        viewMessages: true,
        sendMessages: true,
        deleteMessages: true,
        createBuyerRequirement: true,
        updateBuyerRequirement: true,
        deleteBuyerRequirement: true,
        viewBuyerRequirements: true,
        uploadFiles: true,
        viewAnalytics: true,
        exportData: true,
        manageRoles: true,
        systemSettings: true,
        viewLogs: true
      }
    },
    {
      name: 'Employee',
      description: 'Basic employee with limited permissions',
      isSystem: true,
      permissions: {
        viewClients: true,
        viewOwners: true,
        createListing: true,
        viewListings: true,
        viewCategories: true,
        viewMessages: true,
        sendMessages: true,
        viewBuyerRequirements: true,
        uploadFiles: true
      }
    },
    {
      name: 'Listing Manager',
      description: 'Can manage listings and owners',
      isSystem: true,
      permissions: {
        createOwner: true,
        updateOwner: true,
        viewOwners: true,
        toggleOwnerActive: true,
        createListing: true,
        updateListing: true,
        viewListings: true,
        publishListing: true,
        viewCategories: true,
        viewMessages: true,
        sendMessages: true,
        viewBuyerRequirements: true,
        uploadFiles: true
      }
    }
  ];
};


// ── Tenancy ──────────────────────────────────────────────────────────────────
// Uniqueness is per tenant, not global. Two agencies must each be able to have a "Sales Manager" role.
// A global `unique: true` would let whichever agency signed up first claim
// the name for everyone else.
roleSchema.index({ tenantId: 1, name: 1 }, { unique: true });

const Role = mongoose.model('Role', roleSchema);

export default Role;

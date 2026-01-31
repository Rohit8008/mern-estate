import mongoose from 'mongoose';

const roleSchema = new mongoose.Schema(
  {
    name: { 
      type: String, 
      required: true, 
      unique: true, 
      trim: true,
      index: true 
    },
    description: { 
      type: String, 
      default: '',
      maxlength: 500 
    },
    permissions: {
      // User management
      createUser: { type: Boolean, default: false },
      updateUser: { type: Boolean, default: false },
      deleteUser: { type: Boolean, default: false },
      viewUsers: { type: Boolean, default: false },
      
      // Client management
      createClient: { type: Boolean, default: false },
      updateClient: { type: Boolean, default: false },
      deleteClient: { type: Boolean, default: false },
      viewClients: { type: Boolean, default: false },
      
      // Owner management
      createOwner: { type: Boolean, default: false },
      updateOwner: { type: Boolean, default: false },
      deleteOwner: { type: Boolean, default: false },
      viewOwners: { type: Boolean, default: false },
      toggleOwnerActive: { type: Boolean, default: false },
      
      // Listing management
      createListing: { type: Boolean, default: false },
      updateListing: { type: Boolean, default: false },
      deleteListing: { type: Boolean, default: false },
      viewListings: { type: Boolean, default: false },
      publishListing: { type: Boolean, default: false },
      
      // Category management
      createCategory: { type: Boolean, default: false },
      updateCategory: { type: Boolean, default: false },
      deleteCategory: { type: Boolean, default: false },
      viewCategories: { type: Boolean, default: false },
      
      // Message management
      viewMessages: { type: Boolean, default: false },
      sendMessages: { type: Boolean, default: false },
      deleteMessages: { type: Boolean, default: false },
      
      // Buyer requirements
      createBuyerRequirement: { type: Boolean, default: false },
      updateBuyerRequirement: { type: Boolean, default: false },
      deleteBuyerRequirement: { type: Boolean, default: false },
      viewBuyerRequirements: { type: Boolean, default: false },
      
      // File uploads
      uploadFiles: { type: Boolean, default: false },
      
      // Analytics and reports
      viewAnalytics: { type: Boolean, default: false },
      exportData: { type: Boolean, default: false },
      
      // System administration
      manageRoles: { type: Boolean, default: false },
      systemSettings: { type: Boolean, default: false },
      viewLogs: { type: Boolean, default: false }
    },
    isActive: { type: Boolean, default: true },
    isSystem: { type: Boolean, default: false }, // System roles cannot be deleted
    createdBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User',
      required: true 
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

const Role = mongoose.model('Role', roleSchema);

export default Role;

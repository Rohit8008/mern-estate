import { errorHandler } from '../utils/error.js';
import Role from '../models/role.model.js';

// Middleware to check if user has specific permission
export const requirePermission = (permission) => {
  return async (req, res, next) => {
    try {
      // Super admins have all permissions
      if (req.user.role === 'admin') {
        return next();
      }

      // Check if user has assigned role
      if (!req.user.assignedRole) {
        return next(errorHandler(403, 'No role assigned. Access denied.'));
      }

      // Get user's role with permissions
      const userRole = await Role.findById(req.user.assignedRole);
      if (!userRole || !userRole.isActive) {
        return next(errorHandler(403, 'Invalid or inactive role. Access denied.'));
      }

      // Check if role has the required permission
      if (!userRole.hasPermission(permission)) {
        return next(errorHandler(403, `Permission denied. Required permission: ${permission}`));
      }

      // Add role info to request for use in controllers
      req.userRole = userRole;
      next();
    } catch (error) {
      next(error);
    }
  };
};

// Middleware to check multiple permissions (user needs ALL of them)
export const requireAllPermissions = (permissions) => {
  return async (req, res, next) => {
    try {
      // Super admins have all permissions
      if (req.user.role === 'admin') {
        return next();
      }

      if (!req.user.assignedRole) {
        return next(errorHandler(403, 'No role assigned. Access denied.'));
      }

      const userRole = await Role.findById(req.user.assignedRole);
      if (!userRole || !userRole.isActive) {
        return next(errorHandler(403, 'Invalid or inactive role. Access denied.'));
      }

      // Check if user has ALL required permissions
      const hasAllPermissions = permissions.every(permission => 
        userRole.hasPermission(permission)
      );

      if (!hasAllPermissions) {
        return next(errorHandler(403, `Permission denied. Required permissions: ${permissions.join(', ')}`));
      }

      req.userRole = userRole;
      next();
    } catch (error) {
      next(error);
    }
  };
};

// Middleware to check multiple permissions (user needs ANY of them)
export const requireAnyPermission = (permissions) => {
  return async (req, res, next) => {
    try {
      // Super admins have all permissions
      if (req.user.role === 'admin') {
        return next();
      }

      if (!req.user.assignedRole) {
        return next(errorHandler(403, 'No role assigned. Access denied.'));
      }

      const userRole = await Role.findById(req.user.assignedRole);
      if (!userRole || !userRole.isActive) {
        return next(errorHandler(403, 'Invalid or inactive role. Access denied.'));
      }

      // Check if user has ANY of the required permissions
      const hasAnyPermission = permissions.some(permission => 
        userRole.hasPermission(permission)
      );

      if (!hasAnyPermission) {
        return next(errorHandler(403, `Permission denied. Required any of: ${permissions.join(', ')}`));
      }

      req.userRole = userRole;
      next();
    } catch (error) {
      next(error);
    }
  };
};

// Middleware to check if user can manage specific resource
export const canManageResource = (resourceType) => {
  const permissionMap = {
    'users': ['createUser', 'updateUser', 'deleteUser', 'viewUsers'],
    'owners': ['createOwner', 'updateOwner', 'deleteOwner', 'viewOwners'],
    'listings': ['createListing', 'updateListing', 'deleteListing', 'viewListings'],
    'categories': ['createCategory', 'updateCategory', 'deleteCategory', 'viewCategories'],
    'messages': ['viewMessages', 'sendMessages', 'deleteMessages'],
    'buyer-requirements': ['createBuyerRequirement', 'updateBuyerRequirement', 'deleteBuyerRequirement', 'viewBuyerRequirements']
  };

  const requiredPermissions = permissionMap[resourceType] || [];
  return requireAnyPermission(requiredPermissions);
};

// Middleware to check if user can toggle owner active status
export const canToggleOwnerActive = requirePermission('toggleOwnerActive');

// Middleware to check if user can create listings
export const canCreateListing = async (req, res, next) => {
  // Admin always allowed
  if (req.user?.role === 'admin') return next();

  // Employees should be able to create listings by default.
  // If no role is assigned yet, allow; category restrictions are enforced in controller.
  if (req.user?.role === 'employee' && !req.user.assignedRole) return next();

  return requirePermission('createListing')(req, res, next);
};

// Middleware to check if user can manage roles
export const canManageRoles = requirePermission('manageRoles');

// Helper function to get user permissions (for use in controllers)
export const getUserPermissions = async (userId) => {
  try {
    const User = (await import('../models/user.model.js')).default;
    const user = await User.findById(userId).populate('assignedRole');
    
    if (!user || !user.assignedRole) {
      return [];
    }

    return user.assignedRole.getActivePermissions();
  } catch (error) {
    return [];
  }
};

// Helper function to check if user has permission (for use in controllers)
export const userHasPermission = async (userId, permission) => {
  try {
    const User = (await import('../models/user.model.js')).default;
    const user = await User.findById(userId).populate('assignedRole');
    
    if (!user || !user.assignedRole) {
      return false;
    }

    return user.assignedRole.hasPermission(permission);
  } catch (error) {
    return false;
  }
};

import { errorHandler } from '../utils/error.js';
import Role from '../models/role.model.js';
import { MemoryCache } from '../utils/cache.js';

// B-007: Cache role documents for 60s to avoid a DB hit on every permission check.
const roleCache = new MemoryCache({ ttlMs: 60_000, maxSize: 200 });

async function getCachedRole(roleId) {
  const key = String(roleId);
  const cached = roleCache.get(key);
  if (cached) return cached;
  const role = await Role.findById(roleId);
  if (role) roleCache.set(key, role);
  return role;
}

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
      const userRole = await getCachedRole(req.user.assignedRole);
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

// Middleware to check if user can create listings
export const canCreateListing = async (req, res, next) => {
  // Admin always allowed
  if (req.user?.role === 'admin') return next();

  // Employees should be able to create listings by default.
  // If no role is assigned yet, allow; category restrictions are enforced in controller.
  if (req.user?.role === 'employee' && !req.user.assignedRole) return next();

  return requirePermission('createListing')(req, res, next);
};

// Attribute-based access check for listing resources.
// Returns true when the user is allowed to read/mutate the given listing.
// Pass { allowAssignedAgent: true } for update operations where the assigned
// agent should also have access.
export const canAccessListing = (user, listing, { allowAssignedAgent = false } = {}) => {
  if (user.role === 'admin') return true;
  const userId = String(user.id || user._id);
  if (String(listing.userRef) === userId) return true;
  if (user.role === 'employee') {
    if (listing.category && user.assignedCategories?.includes(listing.category)) return true;
    if (allowAssignedAgent && listing.assignedAgent && String(listing.assignedAgent) === userId) return true;
  }
  return false;
};


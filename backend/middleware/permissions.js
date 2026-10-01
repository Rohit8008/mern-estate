import { errorHandler } from '../utils/error.js';
import Role from '../models/role.model.js';
import { MemoryCache } from '../utils/cache.js';
import { isPermissionKey } from '../utils/permissionCatalogue.js';

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
  // Fail at module load, not at request time. A permission that is not in the
  // catalogue can never be granted, so every non-admin would be denied forever
  // with a message that reads like a policy decision rather than a typo —
  // exactly how `manage_settings` locked non-admins out of property types.
  if (!isPermissionKey(permission)) {
    throw new Error(
      `requirePermission('${permission}') is not a known permission. ` +
      'Add it to utils/permissionCatalogue.js or fix the spelling.'
    );
  }

  const guard = async (req, res, next) => {
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
  guard.permissionKey = permission; // lets tests read which key a route asks for
  return guard;
};

/**
 * Does this caller hold `permission`, under the rules for routes that were open
 * to every signed-in person before the permission was enforced?
 *
 *   - admin                      -> yes (as everywhere)
 *   - seller / buyer / other     -> yes. Permissions are a CRM-staff concept;
 *                                   these callers are bounded by their own
 *                                   ownership checks in the controller.
 *   - employee, usable role      -> only if the role grants it
 *   - employee, NO usable role   -> yes. This is the documented
 *                                   LEGACY_STAFF_FALLBACK: "no usable role" means
 *                                   none assigned, or the assigned one is missing
 *                                   or inactive. verifyToken normally gives such
 *                                   an employee the system "Employee" role, so
 *                                   this only applies to a workspace that has
 *                                   none. Locking them out of routes they have
 *                                   always used is worse than leaving them on
 *                                   today's behaviour (scoping still applies).
 *
 * The routes that existed as permission-checked before (clients, owners,
 * categories, documents ...) keep the strict `requirePermission`.
 */
export async function staffHasPermission(user, permission) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role !== 'employee') return true;
  if (!user.assignedRole) return true; // LEGACY_STAFF_FALLBACK
  const role = await getCachedRole(user.assignedRole);
  if (!role || !role.isActive) return true; // LEGACY_STAFF_FALLBACK
  return role.hasPermission(permission);
}

/**
 * Route guard form of staffHasPermission, for routes that used to be open to
 * every signed-in user. Same fail-at-load check on the key as requirePermission.
 */
export const requireStaffPermission = (permission) => {
  if (!isPermissionKey(permission)) {
    throw new Error(
      `requireStaffPermission('${permission}') is not a known permission. ` +
      'Add it to utils/permissionCatalogue.js or fix the spelling.'
    );
  }
  const guard = async (req, res, next) => {
    try {
      if (await staffHasPermission(req.user, permission)) return next();
      return next(errorHandler(403, `Permission denied. Required permission: ${permission}`));
    } catch (error) {
      next(error);
    }
  };
  guard.permissionKey = permission;
  return guard;
};

/** Test hook: drop cached roles so a changed role is seen immediately. */
export const clearRoleCache = () => roleCache.clear?.();

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

/**
 * The list-shaped counterpart to canAccessListing: returns a Mongo filter
 * describing every listing this user may see. EVERY read path that returns more
 * than one listing must merge this in — list, search, suggestions, facets,
 * export. Without it the UI is the only thing scoping an employee, and the UI
 * is not a security boundary.
 *
 * @param {object|undefined} user   req.user (undefined for anonymous callers)
 * @param {object} opts
 * @param {'all'|'assigned'} opts.scope  'assigned' narrows to the caller's own
 *        work even for admins, backing the "My properties" view.
 * @returns {object} a filter to spread into the query, `{}` when unrestricted
 */
export const listingScope = (user, { scope = 'all' } = {}) => {
  const userId = user ? String(user.id || user._id) : null;

  const mine = () => ({
    $or: [
      { assignedAgent: userId },
      { userRef: userId },
      ...(user?.assignedCategories?.length
        ? [{ category: { $in: user.assignedCategories } }]
        : []),
    ],
  });

  // Anonymous and buyer traffic sees nothing. The public catalogue was removed
  // (the property book is not public), but this used to return {} — "no
  // restriction" — so a signed-in buyer account could still page through every
  // listing. A filter that matches no document is the safe floor; sharing
  // outside the agency goes through /api/share instead.
  if (!user || user.role === 'buyer') return { _id: { $in: [] } };

  if (user.role === 'admin') return scope === 'assigned' ? mine() : {};

  if (user.role === 'employee') return mine();

  // Sellers only ever see what they created.
  return { userRef: userId };
};

/**
 * Whether the caller may see internal fields (owner contacts, voice notes,
 * assignment, audit refs) on listings returned by a list endpoint.
 */
export const canSeeInternalListingFields = (user) =>
  user?.role === 'admin' || user?.role === 'employee';


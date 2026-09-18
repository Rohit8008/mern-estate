import jwt from 'jsonwebtoken';
import { AuthorizationError, AuthenticationError } from './error.js';
import { config } from '../config/environment.js';
import User from '../models/user.model.js';
import Role from '../models/role.model.js';
import { runWithTenant } from '../tenancy/tenantContext.js';

export const verifyToken = async (req, res, next) => {
  const token = req.cookies.access_token;
  if (!token) return next(new AuthenticationError('Unauthorized'));

  const jwtOpts = {
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
  };

  jwt.verify(token, config.jwt.secret, jwtOpts, async (err, payload) => {
    if (err) return next(new AuthenticationError('Unauthorized'));
    try {
      // Identity is resolved in the user's HOME workspace (`tid`), not in
      // whatever workspace the request is scoped to. A platform operator
      // viewing another agency is still themselves, and their account record
      // lives where it always did — looking them up in the workspace they are
      // viewing would simply not find them.
      const user = await runWithTenant({ tenantId: String(payload.tid) }, () =>
        User.findById(payload.id).select('-password +passwordChangedAt')
      );
      if (!user) return next(new AuthenticationError('Unauthorized'));

      // Reject disabled accounts immediately — don't wait for token expiry
      if (user.status === 'inactive' || user.status === 'suspended') {
        return next(new AuthenticationError('Account is disabled'));
      }

      // Reject tokens issued before a password change
      if (user.passwordChangedAt) {
        const changedAt = Math.floor(user.passwordChangedAt.getTime() / 1000);
        if (payload.iat < changedAt) {
          return next(new AuthenticationError('Session expired. Please log in again.'));
        }
      }

      // Ensure employees have a role assigned so permissions are configurable.
      // If missing, assign the system "Employee" role (created by default roles initializer).
      // Pinned to the user's own workspace, like the lookup above. Unpinned,
      // an operator acting elsewhere would be handed a Role belonging to the
      // CUSTOMER and have it written onto their account — a cross-tenant id
      // that outlives the visit and quietly strips their permissions at home.
      if (user.role === 'employee' && !user.assignedRole) {
        try {
          await runWithTenant({ tenantId: String(payload.tid) }, async () => {
            const defaultEmployeeRole = await Role.findOne({
              name: { $regex: /^employee$/i },
              isSystem: true,
              isDeleted: { $ne: true },
            }).select('_id');

            if (defaultEmployeeRole?._id) {
              user.assignedRole = defaultEmployeeRole._id;
              await user.save();
            }
          });
        } catch (_) {}
      }

      req.user = {
        id: String(user._id),
        email: user.email,
        username: user.username,
        status: user.status,
        role: user.role,
        assignedCategories: user.assignedCategories,
        assignedRole: user.assignedRole ? String(user.assignedRole) : null,
      };

      return next();
    } catch (_) {
      return next(new AuthenticationError('Auth lookup failed'));
    }
  });
};

export const tryVerifyToken = async (req, res, next) => {
  const token = req.cookies.access_token;
  if (!token) return next();

  const jwtOpts = {
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
  };

  jwt.verify(token, config.jwt.secret, jwtOpts, async (err, payload) => {
    if (err) return next();
    try {
      // Pinned to the token's own workspace, exactly as verifyToken is. This
      // one is easy to miss precisely because it fails quietly: an unpinned
      // lookup during an acting session finds nothing, drops req.user, and
      // every optional-auth handler downstream silently behaves as if nobody
      // were signed in. That is how sign-out came to answer "signed out"
      // while revoking nothing.
      const user = await runWithTenant({ tenantId: String(payload.tid) }, () =>
        User.findById(payload.id).select('-password')
      );
      if (!user) return next();

      // Don't attach disabled accounts
      if (user.status === 'inactive' || user.status === 'suspended') return next();

      // Don't attach if token was issued before a password change
      if (user.passwordChangedAt) {
        const changedAt = Math.floor(user.passwordChangedAt.getTime() / 1000);
        if (payload.iat < changedAt) return next();
      }

      // Pinned to the user's own workspace, like the lookup above. Unpinned,
      // an operator acting elsewhere would be handed a Role belonging to the
      // CUSTOMER and have it written onto their account — a cross-tenant id
      // that outlives the visit and quietly strips their permissions at home.
      if (user.role === 'employee' && !user.assignedRole) {
        try {
          await runWithTenant({ tenantId: String(payload.tid) }, async () => {
            const defaultEmployeeRole = await Role.findOne({
              name: { $regex: /^employee$/i },
              isSystem: true,
              isDeleted: { $ne: true },
            }).select('_id');

            if (defaultEmployeeRole?._id) {
              user.assignedRole = defaultEmployeeRole._id;
              await user.save();
            }
          });
        } catch (_) {}
      }

      req.user = {
        id: String(user._id),
        email: user.email,
        username: user.username,
        status: user.status,
        role: user.role,
        assignedCategories: user.assignedCategories,
        assignedRole: user.assignedRole ? String(user.assignedRole) : null,
      };

      return next();
    } catch (_) {
      return next();
    }
  });
};

export const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') return next(new AuthorizationError('Admin only'));
  next();
};

// requireRole('admin', 'employee') — blocks any role not in the list
export const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) {
    return next(new AuthorizationError(`Access restricted to: ${roles.join(', ')}`));
  }
  next();
};


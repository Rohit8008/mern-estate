import jwt from 'jsonwebtoken';
import { AuthorizationError, AuthenticationError } from './error.js';
import { config } from '../config/environment.js';
import User from '../models/user.model.js';
import Role from '../models/role.model.js';

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
      const user = await User.findById(payload.id).select('-password +passwordChangedAt');
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
      if (user.role === 'employee' && !user.assignedRole) {
        try {
          const defaultEmployeeRole = await Role.findOne({
            name: { $regex: /^employee$/i },
            isSystem: true,
            isDeleted: { $ne: true },
          }).select('_id');

          if (defaultEmployeeRole?._id) {
            user.assignedRole = defaultEmployeeRole._id;
            await user.save();
          }
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
      const user = await User.findById(payload.id).select('-password');
      if (!user) return next();

      // Don't attach disabled accounts
      if (user.status === 'inactive' || user.status === 'suspended') return next();

      // Don't attach if token was issued before a password change
      if (user.passwordChangedAt) {
        const changedAt = Math.floor(user.passwordChangedAt.getTime() / 1000);
        if (payload.iat < changedAt) return next();
      }

      if (user.role === 'employee' && !user.assignedRole) {
        try {
          const defaultEmployeeRole = await Role.findOne({
            name: { $regex: /^employee$/i },
            isSystem: true,
            isDeleted: { $ne: true },
          }).select('_id');

          if (defaultEmployeeRole?._id) {
            user.assignedRole = defaultEmployeeRole._id;
            await user.save();
          }
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


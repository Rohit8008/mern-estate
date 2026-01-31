import jwt from 'jsonwebtoken';
import { AuthorizationError, AuthenticationError } from './error.js';
import { config } from '../config/environment.js';
import User from '../models/user.model.js';

export const verifyToken = async (req, res, next) => {
  const token = req.cookies.access_token;
  if (!token) return next(new AuthenticationError('Unauthorized'));

  jwt.verify(token, config.jwt.secret, async (err, payload) => {
    if (err) return next(new AuthorizationError('Forbidden'));
    try {
      const user = await User.findById(payload.id).select('-password');
      if (!user) return next(new AuthenticationError('Unauthorized'));
      req.user = { 
        id: String(user._id), 
        role: user.role, 
        assignedCategories: user.assignedCategories,
        assignedRole: user.assignedRole ? String(user.assignedRole) : null,
      };
      next();
    } catch (_) {
      return next(new AuthenticationError('Auth lookup failed'));
    }
  });
};

export const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') return next(new AuthorizationError('Admin only'));
  next();
};

export const requireEmployeeOrAdminForCategory = (getCategorySlugFromReq) => {
  return (req, res, next) => {
    const role = req.user?.role;
    if (role === 'admin') return next();
    if (role === 'employee') {
      const slug = getCategorySlugFromReq(req);
      if (slug && req.user.assignedCategories?.includes(slug)) return next();
    }
    return next(new AuthorizationError('Forbidden for this category'));
  };
};

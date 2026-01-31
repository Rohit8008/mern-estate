import jwt from 'jsonwebtoken';
import User from '../models/user.model.js';
import { errorHandler } from '../utils/error.js';

// Enhanced token verification with additional security checks
export const verifyToken = async (req, res, next) => {
  try {
    const token = req.cookies.access_token;

    if (!token) {
      return next(errorHandler(401, 'Access token is required'));
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if user still exists and is active
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      return next(errorHandler(401, 'User not found'));
    }

    if (user.status === 'inactive') {
      return next(errorHandler(401, 'Account is inactive'));
    }

    if (user.status === 'suspended') {
      return next(errorHandler(401, 'Account is suspended'));
    }

    // Add user info to request
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return next(errorHandler(401, 'Invalid token'));
    }
    if (error.name === 'TokenExpiredError') {
      return next(errorHandler(401, 'Token expired'));
    }
    return next(errorHandler(401, 'Authentication failed'));
  }
};

// Role-based access control
export const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(errorHandler(401, 'Authentication required'));
    }

    if (!roles.includes(req.user.role)) {
      return next(errorHandler(403, 'Insufficient permissions'));
    }

    next();
  };
};

// Admin only access
export const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return next(errorHandler(401, 'Authentication required'));
  }

  if (req.user.role !== 'admin') {
    return next(errorHandler(403, 'Admin access required'));
  }

  next();
};

// Resource ownership verification
export const requireOwnership = (resourceModel, resourceIdParam = 'id') => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params[resourceIdParam];
      const resource = await resourceModel.findById(resourceId);

      if (!resource) {
        return next(errorHandler(404, 'Resource not found'));
      }

      // Check if user owns the resource or is admin
      const ownerField = resource.userRef ? 'userRef' : 'createdBy';
      const isOwner = resource[ownerField]?.toString() === req.user.id;
      const isAdmin = req.user.role === 'admin';

      if (!isOwner && !isAdmin) {
        return next(errorHandler(403, 'Access denied: You can only access your own resources'));
      }

      req.resource = resource;
      next();
    } catch (error) {
      next(errorHandler(500, 'Error verifying resource ownership'));
    }
  };
};

// API key authentication for external services
export const verifyApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return next(errorHandler(401, 'API key is required'));
  }

  if (apiKey !== process.env.API_KEY) {
    return next(errorHandler(401, 'Invalid API key'));
  }

  next();
};

// Rate limiting per user
export const userRateLimit = (windowMs, max) => {
  const userRequests = new Map();

  return (req, res, next) => {
    if (!req.user) {
      return next();
    }

    const userId = req.user.id;
    const now = Date.now();
    const userRequestsData = userRequests.get(userId) || { count: 0, resetTime: now + windowMs };

    if (now > userRequestsData.resetTime) {
      userRequestsData.count = 0;
      userRequestsData.resetTime = now + windowMs;
    }

    if (userRequestsData.count >= max) {
      return next(errorHandler(429, 'Rate limit exceeded for user'));
    }

    userRequestsData.count++;
    userRequests.set(userId, userRequestsData);

    next();
  };
};

// Session validation
export const validateSession = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(errorHandler(401, 'Session required'));
    }

    // Check if user session is still valid
    const user = await User.findById(req.user.id).select('lastLogin status');
    
    if (!user) {
      return next(errorHandler(401, 'User session invalid'));
    }

    if (user.status !== 'active') {
      return next(errorHandler(401, 'User account is not active'));
    }

    // Check if session is too old (optional - implement based on requirements)
    const maxSessionAge = 24 * 60 * 60 * 1000; // 24 hours
    if (user.lastLogin && Date.now() - user.lastLogin.getTime() > maxSessionAge) {
      return next(errorHandler(401, 'Session expired'));
    }

    next();
  } catch (error) {
    next(errorHandler(500, 'Session validation failed'));
  }
};

// IP-based access control
export const ipWhitelist = (allowedIPs) => {
  return (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    
    if (allowedIPs.includes(clientIP)) {
      return next();
    }
    
    return next(errorHandler(403, 'Access denied from this IP address'));
  };
};

// Device fingerprinting (basic implementation)
export const deviceFingerprint = (req, res, next) => {
  const userAgent = req.get('User-Agent');
  const acceptLanguage = req.get('Accept-Language');
  const acceptEncoding = req.get('Accept-Encoding');
  
  // Create a basic fingerprint
  const fingerprint = Buffer.from(
    `${userAgent}-${acceptLanguage}-${acceptEncoding}`
  ).toString('base64');
  
  req.deviceFingerprint = fingerprint;
  next();
};

// Security headers for authenticated routes
export const securityHeaders = (req, res, next) => {
  // Add security headers for authenticated users
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  next();
};

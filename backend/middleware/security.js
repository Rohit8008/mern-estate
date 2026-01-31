import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import xss from 'xss';
import validator from 'validator';
import { config } from '../config/environment.js';
import { logger } from '../utils/logger.js';

// Advanced rate limiting configurations
export const createRateLimit = (windowMs, max, message, extra = {}) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      success: false,
      statusCode: 429,
      message: message || 'Too many requests, please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      if (typeof extra.skip === 'function' && extra.skip(req)) return true;
      // Skip rate limiting for admin users in development
      return process.env.NODE_ENV === 'development' && req.user?.role === 'admin';
    },
    ...extra,
  });
};

// Different rate limits for different endpoints
export const authRateLimit = createRateLimit(
  config.rateLimit.windowMs,
  config.server.isDevelopment ? 1000 : config.rateLimit.authMaxRequests,
  'Too many authentication attempts, please try again later.'
);

export const apiRateLimit = createRateLimit(
  config.rateLimit.windowMs,
  config.rateLimit.maxRequests,
  'Too many API requests, please slow down.',
  {
    skip: (req) => {
      const url = req.originalUrl || req.url || '';
      // Exempt refresh endpoint to prevent accidental lockouts
      return url.endsWith('/api/auth/refresh') || url.includes('/api/health/');
    },
  }
);

export const strictRateLimit = createRateLimit(
  60 * 1000, // 1 minute
  config.rateLimit.strictMaxRequests,
  'Rate limit exceeded, please try again in 1 minute.'
);

// Higher allowance for token refresh to avoid UX issues
export const refreshRateLimit = createRateLimit(
  config.rateLimit.windowMs,
  config.server.isDevelopment ? 5000 : Math.max(config.rateLimit.authMaxRequests * 5, 500),
  'Too many token refresh attempts, please try again later.'
);

// Enhanced security headers
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", "ws:", "wss:"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
});

// MongoDB injection protection
export const mongoSanitization = mongoSanitize({
  replaceWith: '_',
  onSanitize: ({ req, key }) => {
    console.warn(`MongoDB injection attempt detected: ${key}`, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString(),
    });
  },
});

// XSS protection
export const xssProtection = (req, res, next) => {
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  if (req.params) {
    req.params = sanitizeObject(req.params);
  }
  next();
};

// Recursively sanitize objects
const sanitizeObject = (obj) => {
  if (typeof obj !== 'object' || obj === null) {
    return typeof obj === 'string' ? xss(obj) : obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    sanitized[key] = sanitizeObject(value);
  }
  return sanitized;
};

// Input validation middleware
export const validateInput = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, { 
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });
    
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value,
      }));
      
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Validation failed',
        errors,
      });
    }
    
    next();
  };
};

// Email validation
export const validateEmail = (email) => {
  return validator.isEmail(email) && 
         validator.isLength(email, { max: 254 }) &&
         !validator.contains(email, '..') &&
         !validator.contains(email, '--');
};

// Phone validation
export const validatePhone = (phone) => {
  const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
  return phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''));
};

// Password strength validation
export const validatePassword = (password) => {
  const minLength = 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  
  return {
    isValid: password.length >= minLength && 
             hasUpperCase && 
             hasLowerCase && 
             hasNumbers && 
             hasSpecialChar,
    requirements: {
      minLength,
      hasUpperCase,
      hasLowerCase,
      hasNumbers,
      hasSpecialChar,
    },
  };
};

// File upload validation
export const validateFileUpload = (allowedTypes, maxSize) => {
  return (req, res, next) => {
    if (!req.file) {
      return next();
    }
    
    const { mimetype, size } = req.file;
    
    if (!allowedTypes.includes(mimetype)) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`,
      });
    }
    
    if (size > maxSize) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: `File too large. Maximum size: ${Math.round(maxSize / 1024 / 1024)}MB`,
      });
    }
    
    next();
  };
};

// IP whitelist middleware
export const ipWhitelist = (allowedIPs) => {
  return (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    
    if (allowedIPs.includes(clientIP)) {
      return next();
    }
    
    return res.status(403).json({
      success: false,
      statusCode: 403,
      message: 'Access denied from this IP address',
    });
  };
};

// Request logging middleware
export const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?.id,
      timestamp: new Date().toISOString(),
    };
    
    if (res.statusCode >= 400) {
      console.error('Request Error:', logData);
    } else {
      console.log('Request:', logData);
    }
  });
  
  next();
};

// Error boundary middleware
export const errorBoundary = (err, req, res, next) => {
  console.error('Unhandled Error:', {
    error: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userId: req.user?.id,
    timestamp: new Date().toISOString(),
  });
  
  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(err.statusCode || 500).json({
    success: false,
    statusCode: err.statusCode || 500,
    message: isDevelopment ? err.message : 'Internal server error',
    ...(isDevelopment && { stack: err.stack }),
  });
};

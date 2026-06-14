import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
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
      return false;
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
  config.server.isDevelopment ? 5000 : config.rateLimit.maxRequests,
  'Too many requests. Please wait a moment and try again.',
  {
    // Key by user ID for authenticated requests so users don't share quotas
    keyGenerator: (req) => req.user?.id || ipKeyGenerator(req),
    skip: (req) => {
      const url = req.originalUrl || req.url || '';
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
    logger.warn(`MongoDB injection attempt detected: ${key}`, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
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

// Email validation
export const validateEmail = (email) => {
  return validator.isEmail(email) && 
         validator.isLength(email, { max: 254 }) &&
         !validator.contains(email, '..') &&
         !validator.contains(email, '--');
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

// Request logging middleware
export const requestLogger = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const accessData = {
      method:      req.method,
      url:         req.originalUrl,
      status:      res.statusCode,
      duration_ms: duration,
      ip:          req.ip,
      user_agent:  req.get('User-Agent'),
      user_id:     req.user?.id ?? null,
      content_length: parseInt(res.get('Content-Length') || '0', 10) || 0,
    };
    // All HTTP requests → access_logs (used by dashboard HTTP panels)
    logger.access(accessData);
    // Errors also land in backend_logs for error-level alerting
    if (res.statusCode >= 500) logger.error('Request Error', accessData);
    else if (res.statusCode >= 400) logger.warn('Request Warning', accessData);
  });

  next();
};


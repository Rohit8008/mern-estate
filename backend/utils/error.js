import { logger } from './logger.js';

// Custom error classes
export class AppError extends Error {
  constructor(message, statusCode, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message, field = null) {
    super(message, 400);
    this.field = field;
    this.type = 'validation';
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401);
    this.type = 'authentication';
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403);
    this.type = 'authorization';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404);
    this.type = 'not_found';
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409);
    this.type = 'conflict';
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429);
    this.type = 'rate_limit';
  }
}

export class DatabaseError extends AppError {
  constructor(message = 'Database operation failed') {
    super(message, 500);
    this.type = 'database';
  }
}

// Legacy error handler for backward compatibility
export const errorHandler = (statusCode, message) => {
  const error = new AppError(message, statusCode);
  return error;
};

// Global error handler middleware
export const globalErrorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Helper: prettify field names and messages for users
  const prettifyField = (name) => {
    if (!name) return '';
    try {
      return String(name)
        .replace(/[`'"\[\]]/g, '')
        .replace(/([A-Z])/g, ' $1')
        .replace(/_/g, ' ')
        .trim()
        .replace(/^\w/, (c) => c.toUpperCase());
    } catch (_) { return name; }
  };

  const normalizeMessage = (e) => {
    const raw = e?.message || 'Something went wrong';
    // Mongoose required path: "Path `name` is required."
    if (/Path `(.+?)` is required\./i.test(raw)) {
      const m = raw.match(/Path `(.+?)` is required\./i);
      const field = prettifyField(m?.[1]);
      return { message: `${field} is required`, field: m?.[1], type: 'validation' };
    }
    // CastError: invalid ObjectId etc.
    if (e.name === 'CastError') {
      return { message: 'Invalid identifier', type: 'validation' };
    }
    // Duplicate key
    if (e.code === 11000) {
      const field = Object.keys(e.keyValue || {})[0];
      return { message: `${prettifyField(field)} already exists`, field, type: 'conflict' };
    }
    // Mongoose ValidationError
    if (e.name === 'ValidationError' && e.errors) {
      const firstKey = Object.keys(e.errors)[0];
      const first = e.errors[firstKey];
      // Try to produce a concise message
      const field = prettifyField(first?.path || firstKey);
      const msgText = first?.message || raw;
      // Clean common prefixes
      const cleaned = msgText
        .replace(/^Path `(.+?)` /, '')
        .replace(/`/g, '')
        .replace(/is required\.$/, 'is required');
      return { message: cleaned.includes(field) ? cleaned : `${field} ${cleaned}`.trim(), field: firstKey, type: 'validation' };
    }
    // JWT
    if (e.name === 'JsonWebTokenError') return { message: 'Invalid session. Please sign in again', type: 'authentication' };
    if (e.name === 'TokenExpiredError') return { message: 'Session expired. Please sign in again', type: 'authentication' };
    // Rate limit
    if (e.statusCode === 429) return { message: 'Too many requests. Please try again shortly', type: 'rate_limit' };
    // Fallback
    return { message: raw };
  };

  // Log error
  logger.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id,
    timestamp: new Date().toISOString(),
  });

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Invalid identifier';
    error = new NotFoundError(message);
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const message = `${field} already exists`;
    error = new ConflictError(message);
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = new ValidationError(message);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token';
    error = new AuthenticationError(message);
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired';
    error = new AuthenticationError(message);
  }

  // Rate limit error
  if (err.statusCode === 429) {
    error = new RateLimitError(err.message);
  }

  // Send error response
  const isDevelopment = process.env.NODE_ENV === 'development';
  const friendly = normalizeMessage(err);
  const friendlyMessage = friendly.message || error.message || 'Something went wrong';
  // Prefer friendly type/field when available
  if (friendly.type) error.type = friendly.type;
  const responseField = friendly.field || error.field;
  
  res.status(error.statusCode || 500).json({
    success: false,
    statusCode: error.statusCode || 500,
    message: friendlyMessage,
    ...(error.type && { type: error.type }),
    ...(responseField && { field: responseField }),
    ...(isDevelopment && { 
      stack: error.stack,
      originalError: err.message 
    }),
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
  });
};

// Async error wrapper
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Error response helper
export const sendErrorResponse = (res, statusCode, message, additionalData = {}) => {
  return res.status(statusCode).json({
    success: false,
    statusCode,
    message,
    timestamp: new Date().toISOString(),
    ...additionalData,
  });
};

// Success response helper
export const sendSuccessResponse = (res, data, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    statusCode,
    message,
    data,
    timestamp: new Date().toISOString(),
  });
};

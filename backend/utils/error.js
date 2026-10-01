import { logger } from './logger.js';

// Custom error classes
export class AppError extends Error {
  constructor(message, statusCode, isOperational = true, code = undefined) {
    super(message);
    this.statusCode = statusCode;
    if (code) this.code = code;
    this.isOperational = isOperational;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message, field = null) {
    super(message, 400, true, 'VALIDATION_FAILED');
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

/**
 * Someone else saved the record after this caller loaded it. `details` says
 * when, so the UI can offer "reload theirs" or "overwrite with mine" instead of
 * silently discarding one person's edit.
 */
export class VersionConflictError extends AppError {
  constructor(details = {}, message = 'This record was changed by someone else while you were editing it.') {
    super(message, 409, true, 'VERSION_CONFLICT');
    this.type = 'conflict';
    this.details = details;
  }
}

/**
 * The `updatedAt` a caller says it loaded, as a Date — or null when it sent
 * none (the mobile app, older clients, scripts), which keeps today's
 * last-write-wins behaviour for them. An unparseable value is a 400, not a
 * silent skip: a client that meant to guard its edit must find out it did not.
 */
export function parseExpectedUpdatedAt(value) {
  if (value === undefined || value === null || value === '') return null;
  // Joi's date() hands over a Date already. Round-tripping it through String()
  // would drop the milliseconds, and every guarded save would then "conflict".
  const at = value instanceof Date ? new Date(value.getTime()) : new Date(String(value));
  if (Number.isNaN(at.getTime())) throw new ValidationError('expectedUpdatedAt is not a valid date', 'expectedUpdatedAt');
  return at;
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

/**
 * Stable, machine-readable error codes.
 *
 * `message` is for a person and changes with wording and language; `code` is
 * for a program and never does — a client switching on "Category in use" broke
 * the day the sentence was improved. Codes are additive: a response keeps its
 * `message`, `type`, `field` and `details`, and gains `code` and `requestId`.
 */
export const ERROR_CODES = Object.freeze({
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INVALID_ID: 'INVALID_ID',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  DUPLICATE: 'DUPLICATE',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  PLAN_LIMIT: 'PLAN_LIMIT',
  RATE_LIMITED: 'RATE_LIMITED',
  BAD_REQUEST: 'BAD_REQUEST',
  INTERNAL: 'INTERNAL',
});

const CODE_BY_STATUS = {
  400: ERROR_CODES.BAD_REQUEST,
  401: ERROR_CODES.UNAUTHENTICATED,
  402: ERROR_CODES.PLAN_LIMIT,
  403: ERROR_CODES.FORBIDDEN,
  404: ERROR_CODES.NOT_FOUND,
  409: ERROR_CODES.CONFLICT,
  429: ERROR_CODES.RATE_LIMITED,
};

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

/**
 * Turn any thrown value into { status, code, type, message, field, details }.
 *
 * One pass. There used to be two that disagreed — the first mapped a bad
 * ObjectId to a 404 with type 'validation', the second rewrote the message —
 * so the status and the type of the same error pointed different ways.
 */
export function classifyError(err) {
  const raw = err?.message || 'Something went wrong';

  // Mongoose: an id that is not an ObjectId. Answered as 404 — to the person
  // following a link, a malformed id and a missing record are the same thing,
  // and clients already treat 404 that way.
  if (err?.name === 'CastError') {
    return { status: 404, code: ERROR_CODES.INVALID_ID, type: 'not_found', message: 'Not found', field: err.path };
  }
  if (err?.code === 11000) {
    const field = Object.keys(err.keyValue || {}).find((k) => k !== 'tenantId');
    return { status: 409, code: ERROR_CODES.DUPLICATE, type: 'conflict', message: `${prettifyField(field) || 'That value'} already exists`, field };
  }
  if (err?.name === 'ValidationError' && err.errors) {
    const firstKey = Object.keys(err.errors)[0];
    const first = err.errors[firstKey];
    const field = prettifyField(first?.path || firstKey);
    const cleaned = String(first?.message || raw)
      .replace(/^Path `(.+?)` /, '')
      .replace(/`/g, '')
      .replace(/is required\.$/, 'is required');
    return {
      status: 400,
      code: ERROR_CODES.VALIDATION_FAILED,
      type: 'validation',
      message: cleaned.includes(field) ? cleaned : `${field} ${cleaned}`.trim(),
      field: firstKey,
    };
  }
  if (err?.name === 'JsonWebTokenError') {
    return { status: 401, code: ERROR_CODES.UNAUTHENTICATED, type: 'authentication', message: 'Invalid session. Please sign in again' };
  }
  if (err?.name === 'TokenExpiredError') {
    return { status: 401, code: ERROR_CODES.SESSION_EXPIRED, type: 'authentication', message: 'Session expired. Please sign in again' };
  }
  // body-parser: malformed JSON or an oversized body.
  if (err?.type === 'entity.parse.failed') {
    return { status: 400, code: ERROR_CODES.BAD_REQUEST, type: 'validation', message: 'The request body is not valid JSON' };
  }
  if (err?.type === 'entity.too.large') {
    return { status: 413, code: ERROR_CODES.BAD_REQUEST, type: 'validation', message: 'The request is too large' };
  }

  const status = Number(err?.statusCode || err?.status) || 500;
  return {
    status,
    // Only errors we raised on purpose name their code: an AppError, or any
    // error that also set a 4xx status (tenancy's WORKSPACE_NOT_FOUND). A
    // system error's `code` is something like ECONNREFUSED — an internal
    // detail, never a contract.
    code: typeof err?.code === 'string' && (err instanceof AppError || (status >= 400 && status < 500)) ? err.code : (CODE_BY_STATUS[status] || (status >= 500 ? ERROR_CODES.INTERNAL : ERROR_CODES.BAD_REQUEST)),
    type: err?.type,
    message: raw,
    field: err?.field,
    details: err?.details,
    // Only errors we raised on purpose may show their message to a client.
    operational: err instanceof AppError ? err.isOperational : status < 500,
  };
}

// Global error handler middleware
export const globalErrorHandler = (err, req, res, next) => {
  const c = classifyError(err);
  const isDevelopment = process.env.NODE_ENV === 'development';
  const isProduction = process.env.NODE_ENV === 'production';

  logger.error('Error occurred:', {
    message: err?.message,
    code: c.code,
    status: c.status,
    stack: err?.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id,
  });

  // An unexpected 500's message is an internal detail — a driver error, a
  // file path, a query fragment. In production the client gets a generic
  // sentence and the request id, which is all support needs to find the log.
  const hideMessage = isProduction && c.status >= 500 && !c.operational;
  const message = hideMessage
    ? 'Something went wrong on our side. Please try again; if it keeps happening, quote the request id.'
    : (c.message || 'Something went wrong');

  if (res.headersSent) return next(err);

  res.status(c.status).json({
    success: false,
    statusCode: c.status,
    code: c.code,
    message,
    ...(c.type && { type: c.type }),
    // Controllers attach `details` to say WHAT a 409 is about (how many
    // listings use the category, which fields still hold values). Dropping
    // it here left the UI unable to offer the ?force=true choice at all.
    ...(c.details && { details: c.details }),
    ...(c.field && { field: c.field }),
    ...(req.id && { requestId: req.id }),
    ...(isDevelopment && {
      stack: err?.stack,
      originalError: err?.message,
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
    code: CODE_BY_STATUS[statusCode] || (statusCode >= 500 ? ERROR_CODES.INTERNAL : ERROR_CODES.BAD_REQUEST),
    message,
    ...(res.req?.id && { requestId: res.req.id }),
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

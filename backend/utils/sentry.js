/**
 * Sentry Error Tracking for Backend
 *
 * Provides centralized error tracking and performance monitoring.
 * Configure SENTRY_DSN environment variable to enable.
 *
 * Usage:
 *   import { initSentry, captureException } from './utils/sentry.js';
 *
 *   // Initialize at app startup
 *   initSentry(app);
 *
 *   // Capture errors
 *   captureException(error, { userId, action: 'createListing' });
 */

let Sentry = null;
let isInitialized = false;

/**
 * Initialize Sentry error tracking
 * @param {Express} app - Express application instance
 */
export const initSentry = async (app) => {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    console.log('Sentry DSN not configured, error tracking disabled');
    return null;
  }

  try {
    // Dynamic import to avoid bundling Sentry when not used
    Sentry = await import('@sentry/node');

    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      release: process.env.npm_package_version || '1.0.0',

      // Performance monitoring
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

      // Filter out sensitive data
      beforeSend(event) {
        // Remove sensitive headers
        if (event.request && event.request.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers.cookie;
        }
        return event;
      },

      // Ignore common non-errors
      ignoreErrors: [
        'ECONNRESET',
        'EPIPE',
        'ENOTFOUND',
        'TokenExpiredError',
        'JsonWebTokenError',
      ],
    });

    // Add Express middleware if available
    if (app && Sentry.Handlers) {
      // Request handler should be first middleware
      app.use(Sentry.Handlers.requestHandler());

      // Tracing handler for performance monitoring
      app.use(Sentry.Handlers.tracingHandler());
    }

    isInitialized = true;
    console.log('Sentry initialized successfully');
    return Sentry;
  } catch (error) {
    console.warn('Failed to initialize Sentry:', error.message);
    console.warn('Install @sentry/node to enable error tracking: npm install @sentry/node');
    return null;
  }
};

/**
 * Get Sentry error handler middleware (use at end of middleware chain)
 * @returns {Function} Express error handler middleware
 */
export const getSentryErrorHandler = () => {
  if (Sentry && Sentry.Handlers) {
    return Sentry.Handlers.errorHandler();
  }
  return (err, req, res, next) => next(err);
};

/**
 * Capture an exception with optional context
 * @param {Error} error - The error to capture
 * @param {Object} context - Additional context (user, tags, extra data)
 */
export const captureException = (error, context = {}) => {
  // Always log to console
  console.error('Error captured:', {
    message: error.message,
    stack: error.stack,
    ...context,
  });

  if (!isInitialized || !Sentry) {
    return;
  }

  Sentry.withScope((scope) => {
    // Set user context
    if (context.userId) {
      scope.setUser({ id: context.userId });
    }
    if (context.user) {
      scope.setUser(context.user);
    }

    // Set tags for filtering
    if (context.tags) {
      Object.entries(context.tags).forEach(([key, value]) => {
        scope.setTag(key, value);
      });
    }

    // Set extra data
    if (context.extra) {
      Object.entries(context.extra).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
    }

    // Set context
    if (context.action) {
      scope.setTag('action', context.action);
    }
    if (context.component) {
      scope.setTag('component', context.component);
    }

    Sentry.captureException(error);
  });
};

/**
 * Capture a message (for non-error events)
 * @param {string} message - The message to capture
 * @param {string} level - Severity level (info, warning, error)
 * @param {Object} context - Additional context
 */
export const captureMessage = (message, level = 'info', context = {}) => {
  console.log(`[${level.toUpperCase()}]`, message, context);

  if (!isInitialized || !Sentry) {
    return;
  }

  Sentry.withScope((scope) => {
    scope.setLevel(level);

    if (context.tags) {
      Object.entries(context.tags).forEach(([key, value]) => {
        scope.setTag(key, value);
      });
    }

    Sentry.captureMessage(message);
  });
};

/**
 * Set user context for all future events
 * @param {Object} user - User object with id, email, etc.
 */
export const setUser = (user) => {
  if (isInitialized && Sentry) {
    Sentry.setUser(user);
  }
};

/**
 * Clear user context (call on logout)
 */
export const clearUser = () => {
  if (isInitialized && Sentry) {
    Sentry.setUser(null);
  }
};

/**
 * Start a performance transaction
 * @param {string} name - Transaction name
 * @param {string} op - Operation type
 * @returns {Transaction} Sentry transaction
 */
export const startTransaction = (name, op = 'custom') => {
  if (!isInitialized || !Sentry) {
    return { finish: () => {} };
  }
  return Sentry.startTransaction({ name, op });
};

export default {
  initSentry,
  getSentryErrorHandler,
  captureException,
  captureMessage,
  setUser,
  clearUser,
  startTransaction,
};

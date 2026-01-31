/**
 * Sentry Error Tracking for Frontend
 *
 * Provides centralized error tracking and performance monitoring.
 * Configure VITE_SENTRY_DSN environment variable to enable.
 *
 * Usage:
 *   import { initSentry, captureException } from './utils/sentry';
 *
 *   // Initialize at app startup (in main.jsx)
 *   initSentry();
 *
 *   // Capture errors
 *   captureException(error, { userId, action: 'createListing' });
 */

let Sentry = null;
let isInitialized = false;

/**
 * Initialize Sentry error tracking
 */
export const initSentry = async () => {
  const dsn = import.meta.env.VITE_SENTRY_DSN;

  if (!dsn) {
    console.log('Sentry DSN not configured, error tracking disabled');
    return null;
  }

  try {
    // Dynamic import to avoid bundling Sentry when not used
    Sentry = await import('@sentry/react');

    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      release: import.meta.env.VITE_APP_VERSION || '1.0.0',

      // Integration configuration
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration({
          maskAllText: true,
          blockAllMedia: true,
        }),
      ],

      // Performance monitoring
      tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,

      // Session replay
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,

      // Filter out sensitive data
      beforeSend(event) {
        // Remove sensitive URL params
        if (event.request && event.request.url) {
          const url = new URL(event.request.url);
          url.searchParams.delete('token');
          url.searchParams.delete('code');
          event.request.url = url.toString();
        }
        return event;
      },

      // Ignore common non-errors
      ignoreErrors: [
        'ResizeObserver loop',
        'Network request failed',
        'Load failed',
        'ChunkLoadError',
        'Loading chunk',
        'Non-Error promise rejection',
        // Firebase errors that are usually transient
        'auth/network-request-failed',
        'auth/popup-closed-by-user',
      ],

      denyUrls: [
        // Chrome extensions
        /extensions\//i,
        /^chrome:\/\//i,
        /^chrome-extension:\/\//i,
        // Firefox extensions
        /^moz-extension:\/\//i,
      ],
    });

    isInitialized = true;
    console.log('Sentry initialized successfully');
    return Sentry;
  } catch (error) {
    console.warn('Failed to initialize Sentry:', error.message);
    console.warn('Install @sentry/react to enable error tracking: npm install @sentry/react');
    return null;
  }
};

/**
 * Capture an exception with optional context
 * @param {Error} error - The error to capture
 * @param {Object} context - Additional context
 */
export const captureException = (error, context = {}) => {
  // Always log to console in development
  if (import.meta.env.DEV) {
    console.error('Error captured:', {
      message: error.message,
      stack: error.stack,
      ...context,
    });
  }

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

    // Set tags
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
 * Capture a message
 * @param {string} message - The message to capture
 * @param {string} level - Severity level
 * @param {Object} context - Additional context
 */
export const captureMessage = (message, level = 'info', context = {}) => {
  if (import.meta.env.DEV) {
    console.log(`[${level.toUpperCase()}]`, message, context);
  }

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
 * @param {Object} user - User object
 */
export const setUser = (user) => {
  if (isInitialized && Sentry) {
    Sentry.setUser(user ? {
      id: user._id || user.id,
      email: user.email,
      username: user.username,
    } : null);
  }
};

/**
 * Clear user context
 */
export const clearUser = () => {
  if (isInitialized && Sentry) {
    Sentry.setUser(null);
  }
};

/**
 * Get Sentry ErrorBoundary component
 * @returns {React.Component} Sentry ErrorBoundary or null
 */
export const getErrorBoundary = () => {
  if (isInitialized && Sentry) {
    return Sentry.ErrorBoundary;
  }
  return null;
};

/**
 * Add breadcrumb for debugging
 * @param {Object} breadcrumb - Breadcrumb object
 */
export const addBreadcrumb = (breadcrumb) => {
  if (isInitialized && Sentry) {
    Sentry.addBreadcrumb(breadcrumb);
  }
};

export default {
  initSentry,
  captureException,
  captureMessage,
  setUser,
  clearUser,
  getErrorBoundary,
  addBreadcrumb,
};

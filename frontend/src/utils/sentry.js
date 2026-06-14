// OpenObserve-based frontend logger — replaces Sentry.
// Keeps the same exported names so existing callers (main.jsx) don't change.

const INGEST_ENDPOINT = '/api/observability/logs';
const SERVICE = 'frontend';

let _userId = null;
let _userCtx = null;

// ---------------------------------------------------------------------------
// Internal buffer + flush
// ---------------------------------------------------------------------------
const buffer = [];
let flushTimer = null;

function tsUs() { return Math.floor(Date.now() * 1000); }

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(flush, 5000);
}

async function flush() {
  flushTimer = null;
  if (!buffer.length) return;
  const entries = buffer.splice(0);
  try {
    await fetch(INGEST_ENDPOINT, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(entries),
      keepalive: true,
    });
  } catch {
    // network unavailable — drop silently
  }
}

function push(level, message, meta = {}) {
  buffer.push({
    _timestamp: tsUs(),
    service:    SERVICE,
    level,
    message,
    url:        window.location.pathname,
    user_id:    _userId,
    ...(meta && Object.keys(meta).length ? meta : {}),
  });
  if (buffer.length >= 20) flush();
  else scheduleFlush();
}

// Flush before page unload
window.addEventListener('beforeunload', flush);

// ---------------------------------------------------------------------------
// Global error capture
// ---------------------------------------------------------------------------
function setupGlobalCapture() {
  window.addEventListener('error', (e) => {
    push('error', e.message || 'Unhandled error', {
      error_type:  'uncaught_exception',
      filename:    e.filename,
      lineno:      e.lineno,
      colno:       e.colno,
      stack:       e.error?.stack,
    });
  });

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    const message = reason instanceof Error ? reason.message : String(reason ?? 'Unhandled rejection');
    push('error', message, {
      error_type: 'unhandled_rejection',
      stack:      reason instanceof Error ? reason.stack : undefined,
    });
  });
}

// ---------------------------------------------------------------------------
// Public API  (matches the old sentry.js exports)
// ---------------------------------------------------------------------------
export const initSentry = () => {
  setupGlobalCapture();
};

export const captureException = (error, context = {}) => {
  if (import.meta.env.DEV) console.error('[OO]', error, context);
  push('error', error?.message || String(error), {
    error_type: 'captured_exception',
    stack:      error?.stack,
    ...context,
  });
};

export const captureMessage = (message, level = 'info', context = {}) => {
  push(level, message, context);
};

export const setUser = (user) => {
  _userId  = user?._id || user?.id || null;
  _userCtx = user ? { email: user.email, username: user.username } : null;
};

export const clearUser = () => {
  _userId  = null;
  _userCtx = null;
};

export const getErrorBoundary = () => null;
export const addBreadcrumb    = () => {};

export default { initSentry, captureException, captureMessage, setUser, clearUser, getErrorBoundary, addBreadcrumb };

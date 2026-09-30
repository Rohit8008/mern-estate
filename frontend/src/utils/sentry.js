// OpenObserve-based frontend logger — replaces Sentry.
// Keeps the same exported names so existing callers (main.jsx) don't change.

// Same base as apiClient: in a split deployment the API is on another origin.
const INGEST_ENDPOINT = `${import.meta.env.VITE_API_URL || ''}/api/observability/logs`;
const SERVICE = 'frontend';

let _userId = null;
let _userCtx = null;

// One id per page load, so every line from one visit can be pulled together.
const SESSION_ID = (() => {
  try { return crypto.randomUUID(); } catch { return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; }
})();
const APP_VERSION = import.meta.env.VITE_APP_VERSION || null;
const MAX_BUFFER = 200;

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
  const entries = buffer.splice(0, 50);
  if (buffer.length) scheduleFlush();
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

// The same error thrown in a render loop would otherwise send hundreds of
// identical lines a second. One per message per 10s, with a count.
const recent = new Map();
function isRepeat(level, message) {
  if (level !== 'error' && level !== 'warn') return false;
  const key = `${level}:${message}`;
  const now = Date.now();
  const seen = recent.get(key);
  if (seen && now - seen.at < 10_000) { seen.count += 1; return true; }
  recent.set(key, { at: now, count: 0 });
  if (recent.size > 200) recent.clear();
  return false;
}

// Keys whose values never leave the browser in a log line.
const SENSITIVE_KEY = /pass(word|code)?$|secret|token|authorization|cookie|otp/i;
function scrub(meta) {
  const out = {};
  for (const [k, v] of Object.entries(meta || {})) {
    if (SENSITIVE_KEY.test(k)) continue;
    out[k] = typeof v === 'string' && v.length > 4000 ? `${v.slice(0, 4000)}…` : v;
  }
  return out;
}

function push(level, message, meta = {}) {
  if (isRepeat(level, message)) return;
  if (buffer.length >= MAX_BUFFER) buffer.shift();
  buffer.push({
    _timestamp: tsUs(),
    service:    SERVICE,
    level,
    message,
    url:        window.location.pathname,
    session_id: SESSION_ID,
    app_version: APP_VERSION,
    viewport:   `${window.innerWidth}x${window.innerHeight}`,
    online:     navigator.onLine,
    ...(meta && Object.keys(meta).length ? scrub(meta) : {}),
  });
  if (buffer.length >= 20) flush();
  else scheduleFlush();
}

// Flush when the tab is hidden or closed. `visibilitychange` is the event
// mobile browsers reliably fire; `beforeunload` alone loses the last batch
// whenever a phone user switches apps. sendBeacon survives the page going away.
function flushOnExit() {
  if (!buffer.length) return;
  const body = JSON.stringify(buffer.splice(0, 50));
  try {
    if (navigator.sendBeacon?.(INGEST_ENDPOINT, new Blob([body], { type: 'application/json' }))) return;
  } catch { /* fall through */ }
  fetch(INGEST_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
}
window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushOnExit(); });
window.addEventListener('pagehide', flushOnExit);

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

/**
 * A failed API call, with the server's X-Request-Id so the report and the
 * backend's own lines for that request are one search apart. 5xx and network
 * failures are errors; 429 is a warning; other 4xx are the app working as
 * designed (validation, permissions) and are not reported.
 */
export const logApiFailure = ({ method, url, status, requestId, message, durationMs }) => {
  const level = !status || status >= 500 ? 'error' : status === 429 ? 'warn' : null;
  if (!level) return;
  push(level, status ? `API ${status}` : 'API network failure', {
    error_type: 'api_failure',
    method,
    // Path only: query strings carry search terms and filters.
    api_path: String(url || '').replace(/^https?:\/\/[^/]+/, '').split('?')[0],
    status: status || null,
    request_id: requestId || null,
    duration_ms: durationMs,
    error_message: message,
  });
};

/** One line per screen, for "what was the user doing" and usage. */
export const logPageView = (pathname) => {
  push('info', 'page_view', { path: pathname });
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

export default { initSentry, captureException, captureMessage, setUser, clearUser, getErrorBoundary, addBreadcrumb, logApiFailure, logPageView };

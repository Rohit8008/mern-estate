import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// OpenObserve configuration
// ---------------------------------------------------------------------------
const OO_URL      = process.env.OPENOBSERVE_URL      || 'http://localhost:5080';
const OO_ORG      = process.env.OPENOBSERVE_ORG      || 'default';
const OO_USERNAME = process.env.OPENOBSERVE_USERNAME  || '';
const OO_PASSWORD = process.env.OPENOBSERVE_PASSWORD  || '';

const OO_AUTH = OO_USERNAME
  ? 'Basic ' + Buffer.from(`${OO_USERNAME}:${OO_PASSWORD}`).toString('base64')
  : null;

const SERVICE = 'backend';
const ENV     = process.env.NODE_ENV || 'development';

// ---------------------------------------------------------------------------
// Log level gate
// ---------------------------------------------------------------------------
const LOG_LEVELS   = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 };
const currentLevel = LOG_LEVELS[(process.env.LOG_LEVEL || 'info').toUpperCase()] ?? LOG_LEVELS.INFO;

// ---------------------------------------------------------------------------
// Per-stream buffers  (flush every 3s or when a buffer hits 50 entries)
// ---------------------------------------------------------------------------
const STREAMS  = ['backend_logs', 'security_logs', 'audit_logs', 'access_logs', 'frontend_logs'];
const buffers  = Object.fromEntries(STREAMS.map(s => [s, []]));
let flushTimer = null;

function tsUs() { return Math.floor(Date.now() * 1000); }

async function flushStream(stream) {
  const entries = buffers[stream].splice(0);
  if (!entries.length || !OO_AUTH) return;
  try {
    await fetch(`${OO_URL}/api/${OO_ORG}/${stream}/_json`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: OO_AUTH },
      body:    JSON.stringify(entries),
      signal:  AbortSignal.timeout(5000),
    });
  } catch {
    // OO unreachable — logs already written to stdout, silently drop
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    await Promise.all(STREAMS.map(flushStream));
  }, 3000);
}

function push(stream, entry) {
  buffers[stream].push({ _timestamp: tsUs(), service: SERVICE, environment: ENV, ...entry });
  if (buffers[stream].length >= 50) flushStream(stream); // fire-and-forget
  else scheduleFlush();
}

// ---------------------------------------------------------------------------
// Dev console output  (colour-coded, suppressed in test)
// ---------------------------------------------------------------------------
const C = { ERROR:'\x1b[31m', WARN:'\x1b[33m', INFO:'\x1b[36m', DEBUG:'\x1b[90m',
            SECURITY:'\x1b[35m', AUDIT:'\x1b[32m', ACCESS:'\x1b[37m', RESET:'\x1b[0m' };

function consolePrint(level, message, meta) {
  if (process.env.NODE_ENV === 'test') return;
  const ts = new Date().toISOString();
  const mx = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
  process.stdout.write(`${C[level] ?? ''}[${ts}] [${level}] ${message}${mx}${C.RESET}\n`);
}

// ---------------------------------------------------------------------------
// Public logger API  (same surface as the previous file-based logger)
// ---------------------------------------------------------------------------
export const logger = {
  error(message, meta = {}) {
    if (currentLevel >= LOG_LEVELS.ERROR) {
      consolePrint('ERROR', message, meta);
      push('backend_logs', { level: 'error', message, ...meta });
    }
  },
  warn(message, meta = {}) {
    if (currentLevel >= LOG_LEVELS.WARN) {
      consolePrint('WARN', message, meta);
      push('backend_logs', { level: 'warn', message, ...meta });
    }
  },
  info(message, meta = {}) {
    if (currentLevel >= LOG_LEVELS.INFO) {
      consolePrint('INFO', message, meta);
      push('backend_logs', { level: 'info', message, ...meta });
    }
  },
  debug(message, meta = {}) {
    if (currentLevel >= LOG_LEVELS.DEBUG) {
      consolePrint('DEBUG', message, meta);
      push('backend_logs', { level: 'debug', message, ...meta });
    }
  },
  security(event, details = {}) {
    consolePrint('SECURITY', event, details);
    push('security_logs', { level: 'security', message: event, ...details });
  },
  audit(action, details = {}) {
    consolePrint('AUDIT', action, details);
    push('audit_logs', { level: 'audit', message: action, ...details });
  },
  // Dedicated access-log entry with numeric duration for dashboards
  access(data) {
    push('access_logs', { level: 'access', ...data });
  },
};

// ---------------------------------------------------------------------------
// Graceful-shutdown flush
// ---------------------------------------------------------------------------
export async function flushLogs() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  await Promise.all(STREAMS.map(flushStream));
}

// Allow external callers to ingest frontend logs directly
export function pushFrontendLogs(entries) {
  entries.forEach(e => push('frontend_logs', { service: 'frontend', ...e }));
}

process.on('SIGTERM', async () => { await flushLogs(); });
process.on('SIGINT',  async () => { await flushLogs(); });

// ---------------------------------------------------------------------------
// Helper exports  (kept for backward-compat with existing callers)
// ---------------------------------------------------------------------------
export const requestLogger = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const data = {
      method:        req.method,
      url:           req.originalUrl,
      status:        res.statusCode,
      duration_ms:   duration,
      ip:            req.ip,
      user_agent:    req.get('User-Agent'),
      user_id:       req.user?.id ?? null,
      content_length: parseInt(res.get('Content-Length') || '0', 10) || 0,
    };
    logger.access(data);
    if (res.statusCode >= 500) logger.error('Request error', data);
    else if (res.statusCode >= 400) logger.warn('Request warning', data);
  });
  next();
};

export const logError = (error, req = null, extra = {}) => {
  const data = { error_name: error.name, error_message: error.message, stack: error.stack, ...extra };
  if (req) {
    data.method     = req.method;
    data.url        = req.originalUrl;
    data.ip         = req.ip;
    data.user_agent = req.get('User-Agent');
    data.user_id    = req.user?.id ?? null;
  }
  logger.error('Application error', data);
};

export const logSecurityEvent  = (event, details = {}) => logger.security(event, details);
export const logAuditEvent     = (action, userId, details = {}) => logger.audit(action, { userId, ...details });
export const logDatabaseOperation = (operation, collection, details = {}) =>
  logger.debug('DB operation', { operation, collection, ...details });
export const logPerformance    = (operation, duration, details = {}) =>
  logger.info('Performance', { operation, duration_ms: duration, ...details });

// Keep old file-rotation exports as no-ops so scripts don't break
export const cleanupLogs = () => {};
export const rotateLogs  = () => {};

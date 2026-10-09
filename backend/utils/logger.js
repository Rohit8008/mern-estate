import os from 'os';
import { createRequire } from 'module';
import { getLogContext } from './logContext.js';
import { getTenantStore } from '../tenancy/tenantContext.js';
import { alertDiscord } from './discordAlert.js';

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// OpenObserve configuration
// ---------------------------------------------------------------------------
// Read at use, not at import. config/environment.js imports this module BEFORE it
// calls dotenv.config(), so constants captured here saw an empty environment
// whenever the settings lived in .env: shipping was silently off while
// the startup check (which runs after dotenv) reported nothing wrong.
const ooUrl  = () => process.env.OPENOBSERVE_URL || 'http://localhost:5080';
const ooOrg  = () => process.env.OPENOBSERVE_ORG || 'default';
const ooAuth = () => {
  const user = process.env.OPENOBSERVE_USERNAME || '';
  return user ? 'Basic ' + Buffer.from(`${user}:${process.env.OPENOBSERVE_PASSWORD || ''}`).toString('base64') : null;
};

const SERVICE = 'backend';
const ENV     = process.env.NODE_ENV || 'development';

// Infra identity stamped on every line, so logs from a PM2 cluster / multi-dyno
// deployment are attributable to the instance that wrote them, and errors can be
// correlated to the release they came from. Resolved once at load.
const HOST = os.hostname();
const PID  = process.pid;
// PM2 sets NODE_APP_INSTANCE per clustered worker; fall back to the pid.
const INSTANCE_ID = process.env.NODE_APP_INSTANCE ?? process.env.pm_id ?? String(PID);
const APP_VERSION = process.env.APP_VERSION
  || (() => { try { return require('../package.json').version; } catch { return 'unknown'; } })();

// ---------------------------------------------------------------------------
// Log level gate
// ---------------------------------------------------------------------------
const LOG_LEVELS   = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 };
const currentLevel = LOG_LEVELS[(process.env.LOG_LEVEL || 'info').toUpperCase()] ?? LOG_LEVELS.INFO;

// ---------------------------------------------------------------------------
// Per-stream buffers  (flush every 3s or when a buffer hits 50 entries)
// ---------------------------------------------------------------------------
const STREAMS  = ['backend_logs', 'security_logs', 'audit_logs', 'access_logs', 'frontend_logs', 'mobile_logs'];
const buffers  = Object.fromEntries(STREAMS.map(s => [s, []]));
let flushTimer = null;

function tsUs() { return Math.floor(Date.now() * 1000); }

// A shipment that fails is reported on stderr — at most once a minute, so an
// OpenObserve outage cannot turn into a log flood of its own. Before this a
// wrong password or a full disk on the OO side looked exactly like "no logs".
let lastShipWarning = 0;
let droppedSinceWarning = 0;
function reportShipFailure(stream, count, reason) {
  droppedSinceWarning += count;
  const now = Date.now();
  if (now - lastShipWarning < 60_000) return;
  lastShipWarning = now;
  process.stderr.write(JSON.stringify({
    ts: new Date().toISOString(), level: 'warn', service: SERVICE,
    message: 'OpenObserve shipment failed; entries dropped (they are still in stdout)',
    stream, dropped: droppedSinceWarning, reason,
  }) + '\n');
  droppedSinceWarning = 0;
}

async function flushStream(stream) {
  const entries = buffers[stream].splice(0);
  const auth = ooAuth();
  if (!entries.length || !auth) return;
  try {
    const res = await fetch(`${ooUrl()}/api/${ooOrg()}/${stream}/_json`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body:    JSON.stringify(entries),
      signal:  AbortSignal.timeout(5000),
    });
    if (!res.ok) reportShipFailure(stream, entries.length, `HTTP ${res.status}`);
  } catch (err) {
    reportShipFailure(stream, entries.length, err?.message || 'unreachable');
  }
}

/**
 * Batch the next flush to OpenObserve.
 *
 * Two properties this needs, both learned the hard way:
 *
 *  * **Nothing to ship, nothing to schedule.** Without credentials `flushStream`
 *    returns immediately, so arming a timer only creates work that does
 *    nothing. Buffers still drain at the 50-entry mark, so they stay bounded.
 *
 *  * **A pending flush must never hold the process open.** `unref()` keeps this
 *    timer out of the event loop's liveness count: a best-effort log shipment
 *    is not a reason to delay shutdown, and under Jest an armed 3s timer is
 *    reported as a leaked handle — which is exactly what made the suite fail
 *    intermittently with "Jest has detected the following 1 open handle".
 */
function scheduleFlush() {
  if (flushTimer || !ooAuth()) return;

  flushTimer = setTimeout(async () => {
    flushTimer = null;
    await Promise.all(STREAMS.map(flushStream));
  }, 3000);

  if (typeof flushTimer.unref === 'function') flushTimer.unref();
}

// ---------------------------------------------------------------------------
// Redaction  (every entry, every stream — callers should not have to remember)
// ---------------------------------------------------------------------------
// Keys whose values never belong in a log store that every workspace shares.
const SENSITIVE_KEY = /pass(word|code|wd)?$|secret|token|authorization|cookie|otp|api[_-]?key|private[_-]?key|credential|^pin$|signature/i;
const MAX_STRING = 8_000;
const MAX_DEPTH  = 5;

export function redact(value, depth = 0, key = '') {
  if (key && SENSITIVE_KEY.test(key) && value != null && value !== '') return '[redacted]';
  if (value == null) return value;
  if (typeof value === 'string') return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…[truncated]` : value;
  if (typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return redact({ name: value.name, message: value.message, code: value.code, stack: value.stack }, depth + 1);
  }
  if (depth >= MAX_DEPTH) return '[depth limit]';
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  // Mongoose documents and ObjectIds serialise to what they mean, not their internals.
  if (typeof value.toHexString === 'function') return value.toHexString();
  if (typeof value.toObject === 'function') value = value.toObject();
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = redact(v, depth + 1, k);
  return out;
}

/**
 * The routes whose path segment IS a credential — anyone holding the line can
 * open the share, accept the invite or unsubscribe someone. Named explicitly
 * rather than guessed, so listing slugs and ObjectIds stay readable.
 */
const TOKEN_PATHS = [
  /(\/api\/auth\/invite\/)[^/?]+/,
  /(\/api\/share\/open\/)[^/?]+/,
  /(\/api\/unsubscribe\/)[^/?]+/,
  /(^\/s\/)[^/?]+/,
];

export function sanitizeUrl(url) {
  if (!url) return url;
  const [pathPart, query] = String(url).split('?');
  const cleanPath = TOKEN_PATHS.reduce((acc, re) => acc.replace(re, '$1:token'), pathPart);
  if (!query) return cleanPath;
  const params = new URLSearchParams(query);
  for (const k of [...params.keys()]) if (SENSITIVE_KEY.test(k)) params.set(k, '[redacted]');
  return `${cleanPath}?${params.toString()}`;
}

/** Who and which request a line belongs to, read from async context. */
function contextFields() {
  const ctx = getLogContext();
  const tenant = getTenantStore();
  const fields = {};
  if (ctx?.requestId) fields.request_id = ctx.requestId;
  if (ctx?.job) fields.job = ctx.job;
  if (tenant?.tenantId) fields.tenant_id = String(tenant.tenantId);
  const userId = ctx?.userId || tenant?.userId;
  if (userId) fields.user_id = String(userId);
  return fields;
}

function push(stream, entry) {
  const buffer = buffers[stream];
  buffer.push({
    _timestamp: tsUs(),
    service: SERVICE,
    environment: ENV,
    host: HOST,
    instance: INSTANCE_ID,
    pid: PID,
    app_version: APP_VERSION,
    ...contextFields(),
    ...redact(entry),
  });
  if (buffer.length >= 50) flushStream(stream); // fire-and-forget
  else scheduleFlush();
}

// ---------------------------------------------------------------------------
// Dev console output  (colour-coded, suppressed in test)
// ---------------------------------------------------------------------------
const C = { ERROR:'\x1b[31m', WARN:'\x1b[33m', INFO:'\x1b[36m', DEBUG:'\x1b[90m',
            SECURITY:'\x1b[35m', AUDIT:'\x1b[32m', ACCESS:'\x1b[37m', RESET:'\x1b[0m' };

// Production writes one JSON object per line, which the host's log capture
// (Render, PM2, docker) can parse and search even when OpenObserve is down.
// Development keeps the colour-coded human format.
const JSON_STDOUT = ENV === 'production' || process.env.LOG_FORMAT === 'json';

function consolePrint(level, message, meta) {
  if (ENV === 'test') return;
  const safe = redact(meta);
  if (JSON_STDOUT) {
    const line = { ts: new Date().toISOString(), level: level.toLowerCase(), message, host: HOST, instance: INSTANCE_ID, app_version: APP_VERSION, ...contextFields(), ...safe };
    const out = level === 'ERROR' || level === 'WARN' ? process.stderr : process.stdout;
    out.write(JSON.stringify(line) + '\n');
    return;
  }
  const ts = new Date().toISOString();
  const ctx = contextFields();
  const rid = ctx.request_id ? ` (${ctx.request_id.slice(0, 8)})` : '';
  const mx = Object.keys(safe).length ? ' ' + JSON.stringify(safe) : '';
  process.stdout.write(`${C[level] ?? ''}[${ts}] [${level}]${rid} ${message}${mx}${C.RESET}\n`);
}

// Which security events deserve a Discord ping. We want logins, logouts and
// every failure/suspicious event — but NOT the access-token refresh that fires
// every ~15 minutes per active session, which is the one piece of pure traffic
// that would drown the channel. A handful of sensitive actions always ping.
const ALWAYS_ALERT_SECURITY = new Set([
  'acting_as_started', 'acting_as_ended', 'tenant_suspended', 'platform_access_denied',
  'password_changed', 'password_reset_completed', 'password_reset_otp_attempts_exceeded',
]);
function securityNoteworthy(event, details = {}) {
  if (ALWAYS_ALERT_SECURITY.has(event)) return true;
  // The only routine, high-frequency event: a SUCCESSFUL token refresh. A failed
  // or reused refresh token is an incident and still alerts.
  if (details.method === 'refresh_token' && details.status === 'success') return false;
  return true; // logins, logouts, lockouts, wrong-password, etc.
}

// ---------------------------------------------------------------------------
// Public logger API  (same surface as the previous file-based logger)
// ---------------------------------------------------------------------------
export const logger = {
  error(message, meta = {}) {
    if (currentLevel >= LOG_LEVELS.ERROR) {
      consolePrint('ERROR', message, meta);
      push('backend_logs', { level: 'error', message, ...meta });
      // Dev alert — no-op unless DISCORD_WEBHOOK_URL is set. Merge the async
      // context (request_id / tenant_id / user_id) so the alert says who/where,
      // then redact so nothing secret leaves; deduped/paced inside.
      alertDiscord('error', message, redact({ ...contextFields(), ...meta }));
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
    // Security events are off the Discord channel by default; opt in with
    // DISCORD_ALERT_SECURITY=true. Even then, only NOTEWORTHY ones alert —
    // routine successes (token refresh, sign-out, login) are suppressed so the
    // channel carries incidents, not traffic. Context identity is merged in so
    // the alert names the user/tenant.
    if (process.env.DISCORD_ALERT_SECURITY === 'true' && securityNoteworthy(event, details)) {
      // Many auth events share the generic name 'security_event' and carry the
      // specifics in `reason` — use that as the title so the channel is scannable.
      const title = event === 'security_event' && details.reason ? details.reason : event;
      alertDiscord('security', title, redact({ ...contextFields(), ...details }));
    }
  },
  audit(action, details = {}) {
    consolePrint('AUDIT', action, details);
    push('audit_logs', { level: 'audit', message: action, ...details });
  },
  // Dedicated access-log entry with numeric duration for dashboards. In
  // production it is also the stdout request line (morgan is dev-only).
  access(data) {
    if (JSON_STDOUT) consolePrint('ACCESS', `${data.method} ${data.url} ${data.status}`, data);
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

/**
 * Client reports (web and mobile). The server's own stamp — ip, user, the
 * workspace, the time it arrived — goes last so a client cannot forge it.
 */
export function pushClientLogs(stream, entries, stamp = {}) {
  if (stream !== 'frontend_logs' && stream !== 'mobile_logs') return;
  entries.forEach((e) => push(stream, { ...e, ...stamp }));
}

/** @deprecated use pushClientLogs('frontend_logs', …) */
export function pushFrontendLogs(entries) {
  pushClientLogs('frontend_logs', entries, { service: 'frontend' });
}

process.on('SIGTERM', async () => { await flushLogs(); });
process.on('SIGINT',  async () => { await flushLogs(); });

// ---------------------------------------------------------------------------
// Helper exports  (kept for backward-compat with existing callers)
// ---------------------------------------------------------------------------
// requestLogger lives in middleware/requestLogger.js (re-exported by
// middleware/security.js for app.js).

export const logError = (error, req = null, extra = {}) => {
  const data = { error_name: error.name, error_message: error.message, stack: error.stack, ...extra };
  if (req) {
    data.method     = req.method;
    data.url        = sanitizeUrl(req.originalUrl);
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

import express from 'express';
import { verifyToken } from '../utils/verifyUser.js';
import { requirePlatformAdmin } from '../middleware/platformAuth.js';
import jwt from 'jsonwebtoken';
import { pushClientLogs } from '../utils/logger.js';
import { config } from '../config/environment.js';
import { createRateLimit } from '../middleware/security.js';

const router = express.Router();

const OO_URL  = process.env.OPENOBSERVE_URL  || 'http://localhost:5080';
const OO_ORG  = process.env.OPENOBSERVE_ORG  || 'default';
const OO_AUTH = process.env.OPENOBSERVE_USERNAME
  ? 'Basic ' + Buffer.from(
      `${process.env.OPENOBSERVE_USERNAME}:${process.env.OPENOBSERVE_PASSWORD}`
    ).toString('base64')
  : null;

const ingestLimit = createRateLimit(60_000, 120, 'Too many log submissions');

// ── Client log ingest ───────────────────────────────────────────────────────
// Unauthenticated on purpose (a sign-in failure is exactly when a report is
// most useful) and rate limited. Because anyone can post here, nothing the
// client says about WHO it is is trusted: user, workspace, ip and arrival
// time are stamped by the server from the session cookie and the socket.
const MAX_ENTRIES = 50;
const MAX_ENTRY_BYTES = 8_000;
const LEVELS = new Set(['debug', 'info', 'warn', 'error']);
// Fields the server owns; a client value for these is dropped.
const SERVER_OWNED = ['_timestamp', 'received_at', 'ip', 'user_id', 'tenant_id', 'request_id', 'environment', 'stream'];

function sessionUserId(req) {
  const token = req.cookies?.access_token;
  if (!token) return null;
  try {
    // Signature only — no database read per log batch. Expired sessions still
    // attribute (ignoreExpiration): a report sent while the token lapsed is
    // still that person's.
    const payload = jwt.verify(token, config.jwt.secret, {
      issuer: config.jwt.issuer, audience: config.jwt.audience, ignoreExpiration: true,
    });
    return payload?.id ? String(payload.id) : null;
  } catch {
    return null;
  }
}

function cleanEntry(raw, service) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const entry = { ...raw };
  for (const k of SERVER_OWNED) delete entry[k];
  entry.level = LEVELS.has(String(entry.level)) ? String(entry.level) : 'info';
  entry.message = String(entry.message ?? '').slice(0, 1000);
  entry.service = service;
  // Keep the client's own clock separately; it is useful, but not trusted.
  if (Number.isFinite(raw._timestamp)) entry.client_timestamp = raw._timestamp;
  if (JSON.stringify(entry).length > MAX_ENTRY_BYTES) {
    return { level: entry.level, message: entry.message, service, truncated: true };
  }
  return entry;
}

// POST /api/observability/logs — web (frontend_logs) and mobile (mobile_logs)
router.post('/logs', ingestLimit, (req, res) => {
  const raw = Array.isArray(req.body) ? req.body : [req.body];
  const isMobile = raw.some((e) => e?.service === 'mobile') || req.get('X-Client') === 'mobile';
  const service = isMobile ? 'mobile' : 'frontend';
  const entries = raw.slice(0, MAX_ENTRIES).map((e) => cleanEntry(e, service)).filter(Boolean);

  pushClientLogs(isMobile ? 'mobile_logs' : 'frontend_logs', entries, {
    ip: req.ip,
    user_agent: req.get('User-Agent'),
    user_id: sessionUserId(req),
    received_at: new Date().toISOString(),
    ...(raw.length > MAX_ENTRIES && { batch_truncated: raw.length - MAX_ENTRIES }),
  });
  res.status(202).json({ ok: true, accepted: entries.length });
});

// ── platform operators only below ───────────────────────────────────────────
// These read the log store, which is ONE store for every workspace: request
// lines carry emails and IPs from all agencies. A workspace admin (`role:
// 'admin'`) is an admin of one agency and was able to run arbitrary SQL across
// all of them. Only the vendor's operator may read it.

// POST /api/observability/query — proxy search to OpenObserve
router.post('/query', verifyToken, requirePlatformAdmin, async (req, res, next) => {
  if (!OO_AUTH) return res.status(503).json({ success: false, message: 'OpenObserve not configured' });
  try {
    const { stream = 'backend_logs', sql, start_time, end_time, size = 200 } = req.body;
    const query = sql || `SELECT * FROM ${stream} ORDER BY _timestamp DESC LIMIT ${size}`;

    const ooRes = await fetch(`${OO_URL}/api/${OO_ORG}/_search`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: OO_AUTH },
      body: JSON.stringify({
        query: { sql: query, start_time: start_time ?? 0, end_time: end_time ?? Date.now() * 1000, size },
      }),
      signal: AbortSignal.timeout(10_000),
    });

    const data = await ooRes.json();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/observability/streams — list available streams
router.get('/streams', verifyToken, requirePlatformAdmin, async (req, res, next) => {
  if (!OO_AUTH) return res.status(503).json({ success: false, message: 'OpenObserve not configured' });
  try {
    const ooRes = await fetch(`${OO_URL}/api/${OO_ORG}/streams`, {
      headers: { Authorization: OO_AUTH },
      signal:  AbortSignal.timeout(5000),
    });
    const data = await ooRes.json();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

export default router;

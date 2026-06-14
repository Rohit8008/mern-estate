import express from 'express';
import { verifyToken, requireAdmin } from '../utils/verifyUser.js';
import { pushFrontendLogs } from '../utils/logger.js';
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

// POST /api/observability/logs — frontend log ingest (no auth, rate-limited)
router.post('/logs', ingestLimit, (req, res) => {
  const entries = Array.isArray(req.body) ? req.body : [req.body];
  pushFrontendLogs(entries);
  res.json({ ok: true });
});

// ── admin-only below ────────────────────────────────────────────────────────

// POST /api/observability/query — proxy search to OpenObserve
router.post('/query', verifyToken, requireAdmin, async (req, res, next) => {
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
router.get('/streams', verifyToken, requireAdmin, async (req, res, next) => {
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

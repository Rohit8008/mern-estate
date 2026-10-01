import express from 'express';
import { verifyToken, requireAdmin } from '../utils/verifyUser.js';
import { buildOpenApi } from '../utils/openapi.js';

const router = express.Router();

/**
 * The API's OpenAPI description (utils/openapi.js), for a workspace admin
 * wiring an integration. Admin-only: it is a map of every endpoint, which is
 * not something to hand an anonymous visitor. Built once per process, on
 * first request — the routes cannot change while it runs.
 */
let cached = null;

router.get('/openapi.json', verifyToken, requireAdmin, (req, res) => {
  if (!cached) cached = buildOpenApi(req.app);
  res.json(cached);
});

export default router;

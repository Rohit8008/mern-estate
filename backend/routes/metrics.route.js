import express from 'express';
import { verifyToken, requireAdmin } from '../utils/verifyUser.js';
import { getAdminMetrics, getMyMetrics } from '../controllers/metrics.controller.js';
import { getSystemStatus } from '../controllers/systemStatus.controller.js';

const router = express.Router();

router.use(verifyToken);

router.get('/admin', requireAdmin, getAdminMetrics);

// Deployment health, for the admin System screen. Admin-only: it names the
// host, the runtime and which integrations are configured.
router.get('/system', requireAdmin, getSystemStatus);
router.get('/me', getMyMetrics);

export default router;

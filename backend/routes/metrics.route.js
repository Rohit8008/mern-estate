import express from 'express';
import { verifyToken, requireAdmin } from '../utils/verifyUser.js';
import { getAdminMetrics, getMyMetrics } from '../controllers/metrics.controller.js';

const router = express.Router();

router.use(verifyToken);

router.get('/admin', requireAdmin, getAdminMetrics);
router.get('/me', getMyMetrics);

export default router;

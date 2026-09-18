import express from 'express';
import { verifyToken } from '../utils/verifyUser.js';
import { requirePermission } from '../middleware/permissions.js';
import { listActivity, searchActivity, exportActivity } from '../controllers/activity.controller.js';

const router = express.Router();

router.use(verifyToken);

// Per-record timeline. Access is decided per entity inside the controller.
router.get('/', listActivity);

// The workspace-wide trail, for admins and anyone holding viewLogs.
router.get('/search', requirePermission('viewLogs'), searchActivity);
router.get('/export', requirePermission('viewLogs'), exportActivity);

export default router;

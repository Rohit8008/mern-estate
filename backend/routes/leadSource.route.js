import express from 'express';
import { verifyToken, requireAdmin } from '../utils/verifyUser.js';
import { requirePermission } from '../middleware/permissions.js';
import {
  listLeadSources,
  createLeadSource,
  updateLeadSource,
  deleteLeadSource,
  getSourceRoi,
} from '../controllers/leadSource.controller.js';
import { validateBody, leadSourceValidation } from '../middleware/validation.js';

const router = express.Router();

router.use(verifyToken);

// Everyone needs the list — it fills the source dropdown on the lead form.
router.get('/', listLeadSources);

// Spend and channel names are a reporting concern, so reading ROI needs the
// analytics permission and editing the catalogue is admin-only.
router.get('/roi', requirePermission('viewAnalytics'), getSourceRoi);

router.post('/', requireAdmin, validateBody(leadSourceValidation.create), createLeadSource);
router.patch('/:id', requireAdmin, validateBody(leadSourceValidation.update), updateLeadSource);
router.delete('/:id', requireAdmin, deleteLeadSource);

export default router;

import express from 'express';
import { verifyToken, requireAdmin } from '../utils/verifyUser.js';
import {
  listEmailTemplates,
  upsertEmailTemplate,
  deleteEmailTemplate,
  previewEmailTemplate,
  sendTestEmail,
} from '../controllers/emailTemplate.controller.js';

const router = express.Router();

// These govern what goes out under the agency's name, so they are admin-only.
router.use(verifyToken, requireAdmin);

router.get('/', listEmailTemplates);
router.post('/preview', previewEmailTemplate);
router.post('/test', sendTestEmail);

router.put('/:key', upsertEmailTemplate);
router.delete('/:key', deleteEmailTemplate);

export default router;

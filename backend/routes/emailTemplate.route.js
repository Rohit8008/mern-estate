import express from 'express';
import { verifyToken, requireAdmin } from '../utils/verifyUser.js';
import {
  listEmailTemplates,
  upsertEmailTemplate,
  deleteEmailTemplate,
  previewEmailTemplate,
  sendTestEmail,
} from '../controllers/emailTemplate.controller.js';
import { validateBody, emailTemplateValidation } from '../middleware/validation.js';

const router = express.Router();

// These govern what goes out under the agency's name, so they are admin-only.
router.use(verifyToken, requireAdmin);

router.get('/', listEmailTemplates);
router.post('/preview', validateBody(emailTemplateValidation.draft), previewEmailTemplate);
router.post('/test', validateBody(emailTemplateValidation.draft), sendTestEmail);

router.put('/:key', validateBody(emailTemplateValidation.upsert), upsertEmailTemplate);
router.delete('/:key', deleteEmailTemplate);

export default router;

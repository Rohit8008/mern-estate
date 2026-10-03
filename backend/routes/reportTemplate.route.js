import express from 'express';
import { verifyToken, requireRole } from '../utils/verifyUser.js';
import { listTemplates, createTemplate, updateTemplate, deleteTemplate, incrementUsage, sendReport } from '../controllers/reportTemplate.controller.js';
import { validateBody, reportTemplateValidation } from '../middleware/validation.js';

const router = express.Router();

router.use(verifyToken);
// Client reports are CRM staff work; a seller account has no use for them and
// /send relays mail from the agency's own domain.
router.use(requireRole('admin', 'employee'));

router.get('/', listTemplates);
router.post('/', validateBody(reportTemplateValidation.create), createTemplate);
router.patch('/:id', validateBody(reportTemplateValidation.update), updateTemplate);
router.delete('/:id', deleteTemplate);
router.post('/:id/use', validateBody(reportTemplateValidation.empty), incrementUsage);
router.post('/:id/send', validateBody(reportTemplateValidation.send), sendReport);

export default router;

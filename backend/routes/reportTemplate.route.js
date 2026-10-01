import express from 'express';
import { verifyToken } from '../utils/verifyUser.js';
import { listTemplates, createTemplate, updateTemplate, deleteTemplate, incrementUsage, sendReport } from '../controllers/reportTemplate.controller.js';
import { validateBody, reportTemplateValidation } from '../middleware/validation.js';

const router = express.Router();

router.use(verifyToken);

router.get('/', listTemplates);
router.post('/', validateBody(reportTemplateValidation.create), createTemplate);
router.patch('/:id', validateBody(reportTemplateValidation.update), updateTemplate);
router.delete('/:id', deleteTemplate);
router.post('/:id/use', validateBody(reportTemplateValidation.empty), incrementUsage);
router.post('/:id/send', validateBody(reportTemplateValidation.send), sendReport);

export default router;

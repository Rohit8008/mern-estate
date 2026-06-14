import express from 'express';
import { verifyToken } from '../utils/verifyUser.js';
import { listTemplates, createTemplate, updateTemplate, deleteTemplate, incrementUsage, sendReport } from '../controllers/reportTemplate.controller.js';

const router = express.Router();

router.use(verifyToken);

router.get('/', listTemplates);
router.post('/', createTemplate);
router.patch('/:id', updateTemplate);
router.delete('/:id', deleteTemplate);
router.post('/:id/use', incrementUsage);
router.post('/:id/send', sendReport);

export default router;

import express from 'express';
import { verifyToken } from '../utils/verifyUser.js';
import {
  listReports,
  getReport,
  createReport,
  updateReport,
  deleteReport,
  sendReport,
} from '../controllers/generatedReport.controller.js';
import { validateBody, generatedReportValidation } from '../middleware/validation.js';

const router = express.Router();

router.use(verifyToken);

router.get('/', listReports);
router.get('/:id', getReport);
router.post('/', validateBody(generatedReportValidation.create), createReport);
router.patch('/:id', validateBody(generatedReportValidation.update), updateReport);
router.delete('/:id', deleteReport);
router.post('/:id/send', validateBody(generatedReportValidation.send), sendReport);

export default router;

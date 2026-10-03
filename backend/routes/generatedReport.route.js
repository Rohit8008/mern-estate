import express from 'express';
import { verifyToken, requireRole } from '../utils/verifyUser.js';
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
// Client reports are CRM staff work; a seller account has no use for them and
// /send relays mail from the agency's own domain.
router.use(requireRole('admin', 'employee'));

router.get('/', listReports);
router.get('/:id', getReport);
router.post('/', validateBody(generatedReportValidation.create), createReport);
router.patch('/:id', validateBody(generatedReportValidation.update), updateReport);
router.delete('/:id', deleteReport);
router.post('/:id/send', validateBody(generatedReportValidation.send), sendReport);

export default router;

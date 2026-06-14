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

const router = express.Router();

router.use(verifyToken);

router.get('/', listReports);
router.get('/:id', getReport);
router.post('/', createReport);
router.patch('/:id', updateReport);
router.delete('/:id', deleteReport);
router.post('/:id/send', sendReport);

export default router;

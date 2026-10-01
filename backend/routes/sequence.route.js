import express from 'express';
import { verifyToken, requireAdmin, requireRole } from '../utils/verifyUser.js';
import {
  listSequences,
  createSequence,
  updateSequence,
  deleteSequence,
  enrollClient,
  unenrollClient,
  clientEnrollments,
} from '../controllers/sequence.controller.js';
import { validateBody, sequenceValidation } from '../middleware/validation.js';

const router = express.Router();

router.use(verifyToken, requireRole('admin', 'employee'));

// Reading the catalogue and enrolling a lead are day-to-day agent work;
// authoring a sequence changes what goes out under the agency's name, so that
// is admin-only.
router.get('/', listSequences);
router.post('/', requireAdmin, validateBody(sequenceValidation.create), createSequence);
router.patch('/:id', requireAdmin, validateBody(sequenceValidation.update), updateSequence);
router.delete('/:id', requireAdmin, deleteSequence);

router.post('/:id/enroll', validateBody(sequenceValidation.enroll), enrollClient);
router.delete('/:id/enroll/:clientId', unenrollClient);

// What one lead is on. Ownership is checked in the controller.
router.get('/client/:clientId', clientEnrollments);

export default router;

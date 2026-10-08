import express from 'express';
import { verifyToken } from '../utils/verifyUser.js';
import { validateBody } from '../middleware/validation.js';
import { noteValidation } from '../middleware/validation.js';
import { getNotes, createNote, linkNoteListing, deleteNote } from '../controllers/note.controller.js';

const router = express.Router();

// Personal quick-capture notes. Any signed-in user; each sees only their own
// (scoped by userRef in the controller).
router.use(verifyToken);

router.get('/', getNotes);
router.post('/', validateBody(noteValidation.create), createNote);
router.patch('/:id', validateBody(noteValidation.link), linkNoteListing);
router.delete('/:id', deleteNote);

export default router;

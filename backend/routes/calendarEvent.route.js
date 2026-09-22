import express from 'express';
import { verifyToken } from '../utils/verifyUser.js';
import { validateBody, calendarEventValidation } from '../middleware/validation.js';
import { listCalendarEvents, createCalendarEvent, deleteCalendarEvent } from '../controllers/calendarEvent.controller.js';

const router = express.Router();

router.use(verifyToken);

router.get('/', listCalendarEvents);
router.post('/', validateBody(calendarEventValidation.create), createCalendarEvent);
router.delete('/:id', deleteCalendarEvent);

export default router;

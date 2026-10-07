import express from 'express';
import { verifyToken } from '../utils/verifyUser.js';
import {
  listNotifications,
  unreadCount,
  markRead,
  markAllRead,
  getPreferences,
  updatePreferences,
  registerDevice,
  unregisterDevice,
} from '../controllers/notification.controller.js';
import { validateBody, notificationValidation } from '../middleware/validation.js';

const router = express.Router();

// Everything here is about the signed-in caller, so a session is the only guard
// needed; there is no id in any path that belongs to somebody else.
router.use(verifyToken);

router.get('/', listNotifications);
router.get('/unread-count', unreadCount);
router.patch('/read-all', validateBody(notificationValidation.empty), markAllRead);
router.patch('/:id/read', validateBody(notificationValidation.empty), markRead);

router.get('/preferences', getPreferences);
router.patch('/preferences', validateBody(notificationValidation.preferences), updatePreferences);

router.post('/devices', registerDevice);
router.delete('/devices', unregisterDevice);

export default router;

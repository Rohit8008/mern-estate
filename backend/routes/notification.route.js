import express from 'express';
import { verifyToken } from '../utils/verifyUser.js';
import {
  listNotifications,
  unreadCount,
  markRead,
  markAllRead,
  getPreferences,
  updatePreferences,
} from '../controllers/notification.controller.js';

const router = express.Router();

// Everything here is about the signed-in caller, so a session is the only guard
// needed; there is no id in any path that belongs to somebody else.
router.use(verifyToken);

router.get('/', listNotifications);
router.get('/unread-count', unreadCount);
router.patch('/read-all', markAllRead);
router.patch('/:id/read', markRead);

router.get('/preferences', getPreferences);
router.patch('/preferences', updatePreferences);

export default router;

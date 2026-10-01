import express from 'express';
import { verifyToken } from '../utils/verifyUser.js';
import { requireStaffPermission } from '../middleware/permissions.js';
import { sendMessage, getInbox, getSent, getThread, markRead, getConversations, getOnlineUsers } from '../controllers/message.controller.js';
import { validateBody, messageValidation } from '../middleware/validation.js';

const router = express.Router();

router.post('/send', verifyToken, requireStaffPermission('sendMessages'), validateBody(messageValidation.send), sendMessage);
router.get('/inbox', verifyToken, requireStaffPermission('viewMessages'), getInbox);
router.get('/sent', verifyToken, requireStaffPermission('viewMessages'), getSent);
router.get('/online-users', verifyToken, getOnlineUsers);
router.get('/thread/:otherId', verifyToken, requireStaffPermission('viewMessages'), getThread);
router.post('/read', verifyToken, requireStaffPermission('viewMessages'), validateBody(messageValidation.markRead), markRead);
router.get('/conversations', verifyToken, requireStaffPermission('viewMessages'), getConversations);

export default router;



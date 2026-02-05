import express from 'express';
import { verifyToken } from '../utils/verifyUser.js';
import { sendMessage, getInbox, getSent, getThread, markRead, getConversations, getOnlineUsers } from '../controllers/message.controller.js';

const router = express.Router();

router.post('/send', verifyToken, sendMessage);
router.get('/inbox', verifyToken, getInbox);
router.get('/sent', verifyToken, getSent);
router.get('/online-users', verifyToken, getOnlineUsers);
router.get('/thread/:otherId', verifyToken, getThread);
router.post('/read', verifyToken, markRead);
router.get('/conversations', verifyToken, getConversations);

export default router;



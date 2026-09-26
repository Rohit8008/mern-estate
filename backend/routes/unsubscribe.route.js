import express from 'express';
import { describeUnsubscribe, confirmUnsubscribe } from '../controllers/unsubscribe.controller.js';
import { createRateLimit } from '../middleware/security.js';

const router = express.Router();

// Tokens are unguessable HMACs; the limit is against someone trying anyway.
const limit = createRateLimit(60_000, 30, 'Too many requests. Please try again in a minute.');

router.get('/:token', limit, describeUnsubscribe);
router.post('/:token', limit, confirmUnsubscribe);

export default router;

import express from 'express';
import { subscribe } from '../controllers/subscriber.controller.js';
import { validateBody, subscriberValidation } from '../middleware/validation.js';

const router = express.Router();

router.post('/subscribe', validateBody(subscriberValidation.subscribe), subscribe);

export default router;

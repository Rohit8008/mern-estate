import express from 'express';
import { verifyToken } from '../utils/verifyUser.js';
import { listActivity } from '../controllers/activity.controller.js';

const router = express.Router();

router.use(verifyToken);

router.get('/', listActivity);

export default router;

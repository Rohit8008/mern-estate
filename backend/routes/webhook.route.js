import express from 'express';
import { verifyToken, requireAdmin } from '../utils/verifyUser.js';
import {
  listWebhooks,
  createWebhook,
  updateWebhook,
  rotateSecret,
  deleteWebhook,
  listDeliveries,
  sendTestEvent,
} from '../controllers/webhook.controller.js';
import { validateBody, webhookValidation } from '../middleware/validation.js';

const router = express.Router();

// A webhook exports the workspace's data to a third party and the secret is
// readable, so the whole surface is admin-only.
router.use(verifyToken, requireAdmin);

router.get('/', listWebhooks);
router.post('/', validateBody(webhookValidation.create), createWebhook);
router.patch('/:id', validateBody(webhookValidation.update), updateWebhook);
router.delete('/:id', deleteWebhook);

router.post('/:id/rotate-secret', validateBody(webhookValidation.empty), rotateSecret);
router.post('/:id/test', validateBody(webhookValidation.empty), sendTestEvent);
router.get('/:id/deliveries', listDeliveries);

export default router;

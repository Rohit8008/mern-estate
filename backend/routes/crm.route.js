/**
 * CRM Routes
 *
 * Routes for deal pipeline, follow-ups, and communication management.
 * All routes require authentication.
 */

import express from 'express';
import { verifyToken } from '../utils/verifyUser.js';
import { validateBody, crmValidation } from '../middleware/validation.js';
import {
  addDeal,
  updateDealStage,
  updateCommission,
  getPipeline,
  addFollowUp,
  completeFollowUp,
  getUpcomingFollowUps,
  addCommunication,
  getCommunications,
  getClientSummary,
} from '../controllers/crm.controller.js';

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

// ============= DEAL ROUTES =============

// Get deal pipeline overview
router.get('/pipeline', getPipeline);

// Add a deal to a client
router.post('/:id/deals', validateBody(crmValidation.addDeal), addDeal);

// Update deal stage
router.patch('/:id/deals/:dealId/stage', validateBody(crmValidation.updateDealStage), updateDealStage);

// Update deal commission
router.patch('/:id/deals/:dealId/commission', validateBody(crmValidation.updateCommission), updateCommission);

// ============= FOLLOW-UP ROUTES =============

// Get upcoming follow-ups (for dashboard)
router.get('/follow-ups/upcoming', getUpcomingFollowUps);

// Add a follow-up to a client
router.post('/:id/follow-ups', validateBody(crmValidation.addFollowUp), addFollowUp);

// Complete a follow-up
router.patch('/:id/follow-ups/:followUpId/complete', validateBody(crmValidation.completeFollowUp), completeFollowUp);

// ============= COMMUNICATION ROUTES =============

// Get communication history for a client
router.get('/:id/communications', getCommunications);

// Log a communication
router.post('/:id/communications', validateBody(crmValidation.addCommunication), addCommunication);

// ============= CLIENT SUMMARY =============

// Get client summary with analytics
router.get('/:id/summary', getClientSummary);

export default router;

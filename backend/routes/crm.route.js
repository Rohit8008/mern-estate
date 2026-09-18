/**
 * CRM Routes
 *
 * Routes for deal pipeline, follow-ups, and communication management.
 * All routes require authentication.
 */

import express from 'express';
import { verifyToken, requireRole } from '../utils/verifyUser.js';
import { validateBody, crmValidation } from '../middleware/validation.js';
import {
  addDeal,
  updateDealStage,
  updateCommission,
  getPipeline,
  exportDeals,
  getPipelineBottlenecks,
  addFollowUp,
  completeFollowUp,
  getFollowUpsRange,
  getUpcomingFollowUps,
  addCommunication,
  updateCommunication,
  deleteCommunication,
  getCommunications,
  getClientSummary,
} from '../controllers/crm.controller.js';

const router = express.Router();

// All CRM routes require authentication + admin or employee role
router.use(verifyToken);
router.use(requireRole('admin', 'employee'));

// ============= DEAL ROUTES =============

// Get deal pipeline overview
router.get('/pipeline', getPipeline);

// Where deals are getting stuck, from stageHistory.
router.get('/pipeline/bottlenecks', getPipelineBottlenecks);

// One row per deal, as a CSV.
router.get('/pipeline/export', exportDeals);

// Add a deal to a client
router.post('/:id/deals', validateBody(crmValidation.addDeal), addDeal);

// Update deal stage
router.patch('/:id/deals/:dealId/stage', validateBody(crmValidation.updateDealStage), updateDealStage);

// Update deal commission
router.patch('/:id/deals/:dealId/commission', validateBody(crmValidation.updateCommission), updateCommission);

// ============= FOLLOW-UP ROUTES =============

// Get upcoming follow-ups (for dashboard)
router.get('/follow-ups/upcoming', getUpcomingFollowUps);

// Get follow-ups within a date range (for calendar)
router.get('/follow-ups/range', getFollowUpsRange);

// Add a follow-up to a client
router.post('/:id/follow-ups', validateBody(crmValidation.addFollowUp), addFollowUp);

// Complete a follow-up
router.patch('/:id/follow-ups/:followUpId/complete', validateBody(crmValidation.completeFollowUp), completeFollowUp);

// ============= COMMUNICATION ROUTES =============

// Get communication history for a client
router.get('/:id/communications', getCommunications);

// Log a communication
router.post('/:id/communications', validateBody(crmValidation.addCommunication), addCommunication);

// Amend or remove one. Ownership is checked in the controller: a communication
// belongs to whoever logged it, and only they or an admin may change it.
router.patch('/:id/communications/:communicationId', validateBody(crmValidation.updateCommunication), updateCommunication);
router.delete('/:id/communications/:communicationId', deleteCommunication);

// ============= CLIENT SUMMARY =============

// Get client summary with analytics
router.get('/:id/summary', getClientSummary);

export default router;

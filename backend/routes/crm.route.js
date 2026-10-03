/**
 * CRM Routes
 *
 * Routes for deal pipeline, follow-ups, and communication management.
 * All routes require authentication.
 */

import express from 'express';
import { verifyToken, requireRole } from '../utils/verifyUser.js';
import { requireStaffPermission } from '../middleware/permissions.js';
import { validateBody, crmValidation } from '../middleware/validation.js';
import {
  addDeal,
  updateDealStage,
  setDealListing,
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

// Deals, follow-ups and communications are edits to a client record, so they ask
// for the same permission as editing the client (and reading them, for viewing it).
// requireStaffPermission keeps the legacy fallback: a workspace with no usable
// role is not locked out of routes it has always had.
const canEditClient = requireStaffPermission('updateClient');
const canViewClient = requireStaffPermission('viewClients');

// ============= DEAL ROUTES =============

// Get deal pipeline overview
router.get('/pipeline', getPipeline);

// Where deals are getting stuck, from stageHistory.
router.get('/pipeline/bottlenecks', getPipelineBottlenecks);

// One row per deal, as a CSV.
router.get('/pipeline/export', exportDeals);

// Add a deal to a client
router.post('/:id/deals', canEditClient, validateBody(crmValidation.addDeal), addDeal);

// Link (or unlink) the property a deal is about
router.patch('/:id/deals/:dealId/listing', canEditClient, validateBody(crmValidation.setDealListing), setDealListing);

// Update deal stage
router.patch('/:id/deals/:dealId/stage', canEditClient, validateBody(crmValidation.updateDealStage), updateDealStage);

// Update deal commission
router.patch('/:id/deals/:dealId/commission', canEditClient, validateBody(crmValidation.updateCommission), updateCommission);

// ============= FOLLOW-UP ROUTES =============

// Get upcoming follow-ups (for dashboard)
router.get('/follow-ups/upcoming', getUpcomingFollowUps);

// Get follow-ups within a date range (for calendar)
router.get('/follow-ups/range', getFollowUpsRange);

// Add a follow-up to a client
router.post('/:id/follow-ups', canEditClient, validateBody(crmValidation.addFollowUp), addFollowUp);

// Complete a follow-up
router.patch('/:id/follow-ups/:followUpId/complete', canEditClient, validateBody(crmValidation.completeFollowUp), completeFollowUp);

// ============= COMMUNICATION ROUTES =============

// Get communication history for a client
router.get('/:id/communications', canViewClient, getCommunications);

// Log a communication
router.post('/:id/communications', canEditClient, validateBody(crmValidation.addCommunication), addCommunication);

// Amend or remove one. Ownership is checked in the controller: a communication
// belongs to whoever logged it, and only they or an admin may change it.
router.patch('/:id/communications/:communicationId', canEditClient, validateBody(crmValidation.updateCommunication), updateCommunication);
router.delete('/:id/communications/:communicationId', canEditClient, deleteCommunication);

// ============= CLIENT SUMMARY =============

// Get client summary with analytics
router.get('/:id/summary', canViewClient, getClientSummary);

export default router;

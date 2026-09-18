import express from 'express';
import { verifyToken } from '../utils/verifyUser.js';
import { validateBody, buyerRequirementValidation } from '../middleware/validation.js';
import {
  createBuyerRequirement,
  getBuyerRequirements,
  getBuyerRequirement,
  updateBuyerRequirement,
  deleteBuyerRequirement,
  findMatchingProperties,
  addMatchedProperty,
  removeMatchedProperty,
  updateBuyerStatus,
  getBuyerStats,
  exportBuyerRequirements,
  bulkUpdateBuyerRequirements,
} from '../controllers/buyerRequirement.controller.js';

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

// Create buyer requirement
router.post('/', validateBody(buyerRequirementValidation.create), createBuyerRequirement);

// Get all buyer requirements for the user
router.get('/', getBuyerRequirements);

// Get buyer requirement stats
router.get('/stats', getBuyerStats);

// Export the filtered set. Before '/:id' so "export" is not read as an id.
router.get('/export', exportBuyerRequirements);

// Act on a selection. Scoping is enforced in the controller.
router.post('/bulk', bulkUpdateBuyerRequirements);

// Get specific buyer requirement
router.get('/:id', getBuyerRequirement);

// Update buyer requirement
router.put('/:id', validateBody(buyerRequirementValidation.update), updateBuyerRequirement);

// Delete buyer requirement
router.delete('/:id', deleteBuyerRequirement);

// Find matching properties for a buyer requirement
router.get('/:id/matches', findMatchingProperties);

// Add matched property to buyer requirement
router.post('/matches', addMatchedProperty);

// Remove matched property from buyer requirement
router.delete('/matches', removeMatchedProperty);

// Update buyer status
router.patch('/:id/status', updateBuyerStatus);

export default router;

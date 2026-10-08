import express from 'express';
import { verifyToken } from '../utils/verifyUser.js';
import { requireStaffPermission, staffHasPermission } from '../middleware/permissions.js';
import { errorHandler } from '../utils/error.js';
import { validateBody, buyerRequirementValidation, buyerRequirementActionValidation } from '../middleware/validation.js';
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

const canView = requireStaffPermission('viewBuyerRequirements');
const canCreate = requireStaffPermission('createBuyerRequirement');
const canUpdate = requireStaffPermission('updateBuyerRequirement');
const canDelete = requireStaffPermission('deleteBuyerRequirement');

// /bulk carries three different actions. Deleting needs the delete permission;
// a status change or reassignment needs the update one.
const canBulk = async (req, res, next) => {
  try {
    const needed = req.body?.action === 'delete' ? 'deleteBuyerRequirement' : 'updateBuyerRequirement';
    if (await staffHasPermission(req.user, needed)) return next();
    return next(errorHandler(403, `Permission denied. Required permission: ${needed}`));
  } catch (error) {
    next(error);
  }
};

// All routes require authentication
router.use(verifyToken);

// Create buyer requirement
router.post('/', canCreate, validateBody(buyerRequirementValidation.create), createBuyerRequirement);

// Get all buyer requirements for the user
router.get('/', canView, getBuyerRequirements);

// Get buyer requirement stats
router.get('/stats', canView, getBuyerStats);

// Export the filtered set. Before '/:id' so "export" is not read as an id.
router.get('/export', canView, exportBuyerRequirements);

// Act on a selection. Scoping is enforced in the controller.
router.post('/bulk', validateBody(buyerRequirementActionValidation.bulk), canBulk, bulkUpdateBuyerRequirements);

// Saved-match add/remove. These MUST come before the generic '/:id' routes:
// Express matches in declaration order, so with '/:id' first a DELETE /matches
// was read as deleting the requirement with id "matches" (404 INVALID_ID) rather
// than removing a saved match.
router.post('/matches', canUpdate, validateBody(buyerRequirementActionValidation.match), addMatchedProperty);
router.delete('/matches', canUpdate, removeMatchedProperty);

// Get specific buyer requirement
router.get('/:id', canView, getBuyerRequirement);

// Update buyer requirement
router.put('/:id', canUpdate, validateBody(buyerRequirementValidation.update), updateBuyerRequirement);

// Delete buyer requirement
router.delete('/:id', canDelete, deleteBuyerRequirement);

// Find matching properties for a buyer requirement ('/:id/matches' is two
// segments, so it never collides with the single-segment '/:id').
router.get('/:id/matches', canView, findMatchingProperties);

// Update buyer status
router.patch('/:id/status', canUpdate, validateBody(buyerRequirementActionValidation.status), updateBuyerStatus);

export default router;

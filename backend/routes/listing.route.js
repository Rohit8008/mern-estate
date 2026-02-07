import express from 'express';
import {
  createListing,
  deleteListing,
  updateListing,
  getListing,
  getListings,
  assignListingToAgent,
  unassignListingFromAgent,
  getMyAssignedListings,
  softDeleteListing,
  restoreListing,
  bulkImportListings,
  searchListings,
  getSearchSuggestions,
  getPopularSearches
} from '../controllers/listing.controller.js';
import { verifyToken, requireAdmin } from '../utils/verifyUser.js';
import { canCreateListing } from '../middleware/permissions.js';
import { validateBody, listingValidation, listingActionValidation } from '../middleware/validation.js';

const router = express.Router();

// Search routes (public, placed first for priority)
router.get('/search', searchListings);
router.get('/suggestions', getSearchSuggestions);
router.get('/popular-searches', getPopularSearches);

router.post('/create', verifyToken, canCreateListing, validateBody(listingValidation.create), createListing);
router.delete('/delete/:id', verifyToken, deleteListing);
router.post('/update/:id', verifyToken, validateBody(listingValidation.update), updateListing);
router.get('/get/:id', getListing);
router.get('/get', getListings);

// Agent assignment routes (Admin only)
router.post('/assign-agent', verifyToken, requireAdmin, validateBody(listingActionValidation.assignAgent), assignListingToAgent);
router.post('/unassign-agent', verifyToken, requireAdmin, validateBody(listingActionValidation.unassignAgent), unassignListingFromAgent);

// Get listings assigned to current agent
router.get('/my-assigned', verifyToken, getMyAssignedListings);

// Soft delete and restore (Admin only)
router.post('/soft-delete/:id', verifyToken, requireAdmin, softDeleteListing);
router.post('/restore/:id', verifyToken, requireAdmin, restoreListing);

// Bulk import listings (Admin only)
router.post('/bulk-import', verifyToken, requireAdmin, validateBody(listingActionValidation.bulkImport), bulkImportListings);

export default router;

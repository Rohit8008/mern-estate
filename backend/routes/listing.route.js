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
  bulkImportListings
} from '../controllers/listing.controller.js';
import { verifyToken, requireAdmin } from '../utils/verifyUser.js';

const router = express.Router();

router.post('/create', verifyToken, createListing);
router.delete('/delete/:id', verifyToken, deleteListing);
router.post('/update/:id', verifyToken, updateListing);
router.get('/get/:id', getListing);
router.get('/get', getListings);

// Agent assignment routes (Admin only)
router.post('/assign-agent', verifyToken, requireAdmin, assignListingToAgent);
router.post('/unassign-agent', verifyToken, requireAdmin, unassignListingFromAgent);

// Get listings assigned to current agent
router.get('/my-assigned', verifyToken, getMyAssignedListings);

// Soft delete and restore (Admin only)
router.post('/soft-delete/:id', verifyToken, requireAdmin, softDeleteListing);
router.post('/restore/:id', verifyToken, requireAdmin, restoreListing);

// Bulk import listings (Admin only)
router.post('/bulk-import', verifyToken, requireAdmin, bulkImportListings);

export default router;

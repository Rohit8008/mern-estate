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
  getListingFacetCounts,
  getSearchSuggestions,
  getPopularSearches,
  addVoiceNote,
  deleteVoiceNote,
} from '../controllers/listing.controller.js';
import {
  getImportTemplate,
  suggestMapping,
  previewImport,
  commitImport,
} from '../controllers/listingImport.controller.js';
import { verifyToken, requireAdmin, tryVerifyToken } from '../utils/verifyUser.js';
import { canCreateListing } from '../middleware/permissions.js';
import { validateBody, listingValidation, listingActionValidation } from '../middleware/validation.js';

const router = express.Router();

// The property book is not public. Anonymous browsing was removed deliberately:
// an agency's stock, its pricing and its addresses are its own, and a visitor
// who could page through all of it had more than the business meant to give.
//
// Sharing specific properties with someone outside the agency now goes through
// a share link — see routes/share.route.js — which is per-property, expiring,
// revocable and countable, rather than an open catalogue.
router.get('/search', verifyToken, searchListings);
router.get('/facets', verifyToken, getListingFacetCounts);
router.get('/suggestions', verifyToken, getSearchSuggestions);
router.get('/popular-searches', verifyToken, getPopularSearches);
router.get('/get/:id', verifyToken, getListing);

router.post('/create', verifyToken, canCreateListing, validateBody(listingValidation.create), createListing);
router.delete('/delete/:id', verifyToken, deleteListing);
router.post('/update/:id', verifyToken, validateBody(listingValidation.update), updateListing);
router.get('/get', verifyToken, getListings);

// Agent assignment routes (Admin only)
router.post('/assign-agent', verifyToken, requireAdmin, validateBody(listingActionValidation.assignAgent), assignListingToAgent);
router.post('/unassign-agent', verifyToken, requireAdmin, validateBody(listingActionValidation.unassignAgent), unassignListingFromAgent);

// Get listings assigned to current agent
router.get('/my-assigned', verifyToken, getMyAssignedListings);

// Soft delete and restore (Admin only)
router.post('/soft-delete/:id', verifyToken, requireAdmin, softDeleteListing);
router.post('/restore/:id', verifyToken, requireAdmin, restoreListing);

// ─── Bulk import ────────────────────────────────────────────────────────────
// The wizard flow: download a template, have the server suggest a column
// mapping, dry-run the file, then commit. Every step is admin-only because an
// import can create or overwrite thousands of records.
router.get('/import/template', verifyToken, requireAdmin, getImportTemplate);
router.post('/import/suggest-mapping', verifyToken, requireAdmin, suggestMapping);
router.post('/import/preview', verifyToken, requireAdmin, previewImport);
router.post('/import/commit', verifyToken, requireAdmin, commitImport);

// Legacy single-shot import kept for any existing integration. New callers
// should use /import/preview + /import/commit, which validate before writing.
router.post('/bulk-import', verifyToken, requireAdmin, validateBody(listingActionValidation.bulkImport), bulkImportListings);

// Voice notes
router.post('/:id/voice-notes', verifyToken, addVoiceNote);
router.delete('/:id/voice-notes/:noteId', verifyToken, deleteVoiceNote);

export default router;

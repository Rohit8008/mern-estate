import express from 'express';
// B-001: Use the canonical verifyToken from verifyUser.js (checks passwordChangedAt,
// issuer/audience claims).  The one in middleware/auth.js lacks those checks.
import { verifyToken } from '../utils/verifyUser.js';
import {
  globalSearch,
  getSuggestions,
  trackClick,
  listSavedSearches,
  createSavedSearch,
  deleteSavedSearch,
  pinSavedSearch,
  getSearchAnalytics,
} from '../controllers/search.controller.js';

const router = express.Router();

// All search routes require authentication
router.use(verifyToken);

// Core search
router.get('/',         globalSearch);       // GET  /api/search?q=...
router.get('/suggest',  getSuggestions);     // GET  /api/search/suggest?q=...
router.post('/click',   trackClick);         // POST /api/search/click

// Saved searches
router.get('/saved',            listSavedSearches);
router.post('/saved',           createSavedSearch);
router.delete('/saved/:id',     deleteSavedSearch);
router.patch('/saved/:id/pin',  pinSavedSearch);

// Analytics
router.get('/analytics', getSearchAnalytics);

export default router;

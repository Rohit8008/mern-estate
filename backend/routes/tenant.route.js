import express from 'express';
import {
  getTenantConfig,
  lookupWorkspace,
  getTenantFeatures,
  getScreenCatalogue,
  getTenantUsage,
  getPipelineConfig,
  updatePipelineConfig,
  updateScreenSettings,
  updateTenantConfig,
  getMailSettings,
  updateMailSettings,
  verifyMailSettingsForTenant,
  getOnboarding,
  dismissOnboarding,
} from '../controllers/tenant.controller.js';
import { verifyToken } from '../utils/verifyUser.js';
import { authRateLimit } from '../middleware/security.js';

const router = express.Router();

// Public: the login screen needs this workspace's logo, name and colours before
// anyone has signed in. toPublicConfig() is what keeps that safe.
router.get('/config', getTenantConfig);
// Public: the sign-in screen's Workspace field checks the name typed.
router.get('/lookup', authRateLimit, lookupWorkspace);
router.get('/features', getTenantFeatures);

// Workspace admins editing their own branding, locale and workflow.
router.patch('/config', verifyToken, updateTenantConfig);

// What this workspace is using against its plan.
router.get('/usage', verifyToken, getTenantUsage);

// The sales pipeline's stages, in this workspace's order and wording.
router.get('/pipeline', verifyToken, getPipelineConfig);
router.patch('/pipeline', verifyToken, updatePipelineConfig);

// What a new workspace still has to set up. Progress is derived from the data,
// so it cannot claim a step is outstanding when it has already been done.
router.get('/onboarding', verifyToken, getOnboarding);
router.post('/onboarding/dismiss', verifyToken, dismissOnboarding);

// How this workspace's outbound mail is sent. Admin-only, enforced in the
// controller; the stored password is never returned.
router.get('/mail', verifyToken, getMailSettings);
router.patch('/mail', verifyToken, updateMailSettings);
router.post('/mail/verify', verifyToken, verifyMailSettingsForTenant);

// Which screens this workspace uses, and what it calls them.
router.get('/screens', verifyToken, getScreenCatalogue);
router.patch('/screens', verifyToken, updateScreenSettings);

export default router;

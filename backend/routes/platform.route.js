import express from 'express';
import {
  createTenant,
  listTenants,
  getTenant,
  updateTenant,
  setTenantStatus,
  checkSlug,
  getPlatformSummary,
  startActingAs,
  stopActingAs,
  resendTenantInvite,
} from '../controllers/platform.controller.js';
import {
  listPlans,
  getTenantBilling,
  changePlan,
  createInvoice,
  payInvoice,
  voidInvoice,
} from '../controllers/billing.controller.js';
import { verifyToken } from '../utils/verifyUser.js';
import { requirePlatformAdmin } from '../middleware/platformAuth.js';
import { validateBody, platformValidation } from '../middleware/validation.js';

const router = express.Router();

// Every route here administers OTHER agencies' workspaces, so the gate is the
// platform flag — not `role: 'admin'`, which only means admin of one agency.
router.use(verifyToken, requirePlatformAdmin);

router.get('/summary', getPlatformSummary);

router.get('/tenants/check-slug', checkSlug); // before /tenants/:id
router.get('/tenants', listTenants);
router.post('/tenants', validateBody(platformValidation.createTenant), createTenant);
router.get('/tenants/:id', getTenant);
router.patch('/tenants/:id', validateBody(platformValidation.updateTenant), updateTenant);
router.post('/tenants/:id/suspend', validateBody(platformValidation.reason), setTenantStatus);
router.post('/tenants/:id/resume', validateBody(platformValidation.reason), setTenantStatus);
// Re-send the first admin's invite — the remedy when it expired or went to spam.
router.post('/tenants/:id/invite', validateBody(platformValidation.empty), resendTenantInvite);

// ── Plans and billing ───────────────────────────────────────────────────────
// Vendor-side only: a self-serve upgrade needs a payment gateway and there is
// not one, so a workspace admin sees their plan but cannot change it.
router.get('/plans', listPlans);
router.get('/tenants/:id/billing', getTenantBilling);
router.post('/tenants/:id/plan', validateBody(platformValidation.changePlan), changePlan);
router.post('/tenants/:id/invoices', validateBody(platformValidation.empty), createInvoice);
router.post('/invoices/:invoiceId/pay', validateBody(platformValidation.payInvoice), payInvoice);
router.post('/invoices/:invoiceId/void', validateBody(platformValidation.reason), voidInvoice);

// Viewing a customer's workspace. `stop-acting` is deliberately reachable while
// already acting — it is the way back out — and both are exempted from the
// read-only guard for that reason.
router.post('/act-as/:id', validateBody(platformValidation.empty), startActingAs);
router.post('/stop-acting', validateBody(platformValidation.empty), stopActingAs);

export default router;

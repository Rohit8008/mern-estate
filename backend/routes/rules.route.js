import express from 'express';
import { verifyToken, requireAdmin } from '../utils/verifyUser.js';
import { availableRules, HOOKS } from '../plugins/registry.js';
import { getTenant } from '../tenancy/tenantContext.js';

const router = express.Router();

router.use(verifyToken, requireAdmin);

/**
 * The rules this deployment offers, and the ones this workspace has turned on.
 *
 * Config selects from this vocabulary; it never carries code, so an admin
 * cannot introduce behaviour the deployment did not ship.
 */
router.get('/', (req, res) => {
  res.json({
    success: true,
    data: {
      hooks: HOOKS,
      available: availableRules(),
      configured: getTenant()?.workflow?.rules || [],
    },
  });
});

export default router;

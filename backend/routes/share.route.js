import express from 'express';
import {
  createShare,
  listShares,
  revokeShare,
  openShare,
} from '../controllers/share.controller.js';
import { verifyToken } from '../utils/verifyUser.js';
import { shareRateLimit } from '../middleware/security.js';

const router = express.Router();

// Opening a link is the one unauthenticated route that returns property data.
// Rate limited because the token is the credential, and a credential in a URL
// deserves a brake on guessing even when it is 32 random bytes.
router.get('/open/:token', shareRateLimit, openShare);

router.use(verifyToken);

router.get('/', listShares);
router.post('/', createShare);
router.post('/:id/revoke', revokeShare);

export default router;

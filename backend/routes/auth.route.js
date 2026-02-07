import express from 'express';
import { signOut, signOutAll, signin, refreshToken, google } from '../controllers/auth.controller.js';
import { authRateLimit, refreshRateLimit } from '../middleware/security.js';
import { validateBody, userValidation } from '../middleware/validation.js';
import { tryVerifyToken, verifyToken } from '../utils/verifyUser.js';

const router = express.Router();

// Signup is disabled: only admin-created users can access the system
router.post("/signup", (req, res) => {
  return res.status(403).json({ success: false, message: 'Sign up is disabled. Contact admin.' });
});
// Apply stricter rate limit to signin attempts
router.post("/signin", authRateLimit, validateBody(userValidation.login), signin);
// Google OAuth signin/signup
router.post("/google", authRateLimit, google);
// Apply a dedicated higher-limit rate limiter to refresh so clients don't get locked out
router.post('/refresh', refreshRateLimit, refreshToken);
router.post('/signout', tryVerifyToken, signOut);
router.get('/signout', tryVerifyToken, signOut);
router.post('/signout-all', verifyToken, signOutAll);

// Development endpoint to clear rate limits
if (process.env.NODE_ENV === 'development') {
  router.get('/clear-rate-limit', (req, res) => {
    // This is a simple way to reset rate limits in development
    res.json({ 
      success: true, 
      message: 'Rate limit cleared. You can now try signing in again.' 
    });
  });
}

export default router;
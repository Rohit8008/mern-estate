import express from 'express';
import {
  getDashboardAnalytics,
  getPropertyStats,
  getBuyerStats,
  getEmployeePerformance,
  getActivityLog,
} from '../controllers/dashboard.controller.js';
import { verifyToken, requireAdmin } from '../utils/verifyUser.js';

const router = express.Router();

// All dashboard routes require authentication
router.use(verifyToken);

// General dashboard analytics (accessible to all authenticated users)
router.get('/analytics', getDashboardAnalytics);

// Property statistics
router.get('/property-stats', getPropertyStats);

// Buyer statistics
router.get('/buyer-stats', getBuyerStats);

// Employee performance (Admin only)
router.get('/employee-performance', requireAdmin, getEmployeePerformance);

// Activity log
router.get('/activity-log', getActivityLog);

export default router;

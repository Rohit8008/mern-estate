/**
 * Analytics Routes
 *
 * Routes for business analytics and reporting.
 * Most routes are admin/manager only.
 */

import express from 'express';
import { verifyToken } from '../utils/verifyUser.js';
import {
  getPropertyMetrics,
  getSalesAnalytics,
  getLeadConversionReport,
  getRevenueReport,
  getAgentPerformance,
  getDashboardOverview,
} from '../controllers/analytics.controller.js';

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

// Dashboard overview (for all authenticated users, filtered by role)
router.get('/dashboard', getDashboardOverview);

// Property/listing metrics
router.get('/properties', getPropertyMetrics);

// Sales/deal analytics
router.get('/sales', getSalesAnalytics);

// Lead conversion funnel
router.get('/leads/conversion', getLeadConversionReport);

// Revenue and commission reports
router.get('/revenue', getRevenueReport);

// Agent/team performance
router.get('/agents', getAgentPerformance);

export default router;

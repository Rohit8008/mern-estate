import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { getRedis, isRedisConfigured } from '../utils/redis.js';
import { isShuttingDown } from '../utils/lifecycle.js';
import databaseConnection from '../config/database.js';
import { config } from '../config/environment.js';
import { logger } from '../utils/logger.js';
import { sendSuccessResponse, sendErrorResponse } from '../utils/error.js';
import { APP_VERSION } from '../utils/version.js';

const router = express.Router();

// Health check endpoint
router.get('/health', async (req, res) => {
  try {
    const startTime = Date.now();
    
    // Check database health
    const dbHealth = await databaseConnection.healthCheck();
    
    const responseTime = Date.now() - startTime;
    
    // Up/down and version only. pid, Node version, platform and heap sizes
    // used to be here — this route is public, and those are reconnaissance,
    // not health. /metrics (token-gated) carries the numbers.
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      version: APP_VERSION,
      responseTime: `${responseTime}ms`,
      database: { status: dbHealth.status },
    };

    // Determine overall health
    const isHealthy = dbHealth.status === 'healthy';
    
    if (isHealthy) {
      sendSuccessResponse(res, healthStatus, 'Service is healthy');
    } else {
      sendErrorResponse(res, 503, 'Service is unhealthy', healthStatus);
    }
  } catch (error) {
    logger.error('Health check failed:', {
      message: error.message,
      stack: error.stack,
    });
    
    sendErrorResponse(res, 503, 'Health check failed', {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
    });
  }
});

// Readiness check endpoint
//
// Not ready while shutting down (see utils/lifecycle.js), so traffic moves
// away before the drain. Redis is reported but never makes the instance
// unready: the app is built to degrade to per-process cache and rate limits
// without it, and failing readiness would take every healthy instance out of
// service the moment Redis blinked.
router.get('/ready', async (req, res) => {
  try {
    const dbStatus = databaseConnection.getStatus();
    const redis = isRedisConfigured() ? (getRedis()?.status === 'ready' ? 'connected' : 'degraded') : 'not_configured';
    const draining = isShuttingDown();

    if (dbStatus.isConnected && !draining) {
      sendSuccessResponse(res, { ready: true, database: { isConnected: true }, redis }, 'Service is ready');
    } else {
      sendErrorResponse(res, 503, draining ? 'Shutting down' : 'Service is not ready', {
        ready: false,
        draining,
        database: { isConnected: Boolean(dbStatus.isConnected) },
        redis,
      });
    }
  } catch (error) {
    logger.error('Readiness check failed:', {
      message: error.message,
      stack: error.stack,
    });

    sendErrorResponse(res, 503, 'Readiness check failed', { ready: false });
  }
});

// Liveness check endpoint
router.get('/live', (req, res) => {
  sendSuccessResponse(res, {
    alive: true,
    timestamp: new Date().toISOString()
  }, 'Service is alive');
});

// Startup probe endpoint (for PaaS deployments like Render)
router.get('/startup', async (req, res) => {
  try {
    const dbStatus = databaseConnection.getStatus();

    if (dbStatus.isConnected) {
      return res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString(),
      });
    }

    // Still starting up
    return res.status(503).json({
      status: 'starting',
      timestamp: new Date().toISOString(),
      database: dbStatus.state,
    });
  } catch (error) {
    return res.status(503).json({
      status: 'error',
    });
  }
});

// Detailed health check (checks external services)
router.get('/detailed', async (req, res) => {
  try {
    const startTime = Date.now();
    const checks = {};

    // Database check
    try {
      const dbHealth = await databaseConnection.healthCheck();
      checks.database = {
        status: dbHealth.status,
        latency: dbHealth.latency,
      };
    } catch (e) {
      checks.database = { status: 'unhealthy' };
    }

    // Memory check
    const memUsage = process.memoryUsage();
    const memUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const memTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    const memPercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);

    checks.memory = {
      status: memPercent < 90 ? 'healthy' : 'warning',
      usedMB: memUsedMB,
      totalMB: memTotalMB,
      percentUsed: memPercent,
    };

    // Email service check (if configured)
    if (config.email.host && config.email.auth.user) {
      checks.email = { status: 'configured' };
    } else {
      checks.email = { status: 'not_configured' };
    }

    // SMS service check (if configured)
    if (config.sms.accountSid && config.sms.authToken) {
      checks.sms = { status: 'configured' };
    } else {
      checks.sms = { status: 'not_configured' };
    }

    // Determine overall health
    const allHealthy =
      checks.database.status === 'healthy' &&
      checks.memory.status !== 'critical';

    const responseTime = Date.now() - startTime;

    const response = {
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      checks,
      uptime: Math.round(process.uptime()),
      version: APP_VERSION,
      environment: config.server.nodeEnv,
    };

    res.status(allHealthy ? 200 : 503).json(response);
  } catch (error) {
    logger.error('Detailed health check failed:', { error: error.message });
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Process metrics for a scraper. With METRICS_TOKEN set, the scraper must send
 * `Authorization: Bearer <token>`; heap, CPU and environment are not for
 * whoever happens to find the URL. Without it the route stays open, as it
 * always was, so an existing scraper keeps working until the token is set.
 */
function metricsAuth(req, res, next) {
  const expected = process.env.METRICS_TOKEN;
  if (!expected) return next();
  const given = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length === b.length && timingSafeEqual(a, b)) return next();
  return sendErrorResponse(res, 401, 'Unauthorized');
}

// Metrics endpoint (basic)
router.get('/metrics', metricsAuth, (req, res) => {
  try {
    const metrics = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        used: process.memoryUsage().heapUsed,
        total: process.memoryUsage().heapTotal,
        external: process.memoryUsage().external,
        rss: process.memoryUsage().rss,
      },
      cpu: process.cpuUsage(),
      database: databaseConnection.getStatus(),
      environment: config.server.nodeEnv,
    };

    sendSuccessResponse(res, metrics, 'Metrics retrieved successfully');
  } catch (error) {
    logger.error('Metrics retrieval failed:', {
      message: error.message,
      stack: error.stack,
    });
    
    sendErrorResponse(res, 500, 'Failed to retrieve metrics');
  }
});

export default router;

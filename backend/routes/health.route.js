import express from 'express';
import databaseConnection from '../config/database.js';
import { config } from '../config/environment.js';
import { logger } from '../utils/logger.js';
import { sendSuccessResponse, sendErrorResponse } from '../utils/error.js';

const router = express.Router();

// Health check endpoint
router.get('/health', async (req, res) => {
  try {
    const startTime = Date.now();
    
    // Check database health
    const dbHealth = await databaseConnection.healthCheck();
    
    const responseTime = Date.now() - startTime;
    
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: config.server.nodeEnv,
      version: process.env.npm_package_version || '1.0.0',
      responseTime: `${responseTime}ms`,
      database: dbHealth,
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        external: Math.round(process.memoryUsage().external / 1024 / 1024),
      },
      system: {
        platform: process.platform,
        nodeVersion: process.version,
        pid: process.pid,
      },
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
      error: error.message,
    });
  }
});

// Readiness check endpoint
router.get('/ready', async (req, res) => {
  try {
    const dbStatus = databaseConnection.getStatus();
    
    if (dbStatus.isConnected) {
      sendSuccessResponse(res, { 
        ready: true, 
        database: dbStatus 
      }, 'Service is ready');
    } else {
      sendErrorResponse(res, 503, 'Service is not ready', { 
        ready: false, 
        database: dbStatus 
      });
    }
  } catch (error) {
    logger.error('Readiness check failed:', {
      message: error.message,
      stack: error.stack,
    });
    
    sendErrorResponse(res, 503, 'Readiness check failed', {
      ready: false,
      error: error.message,
    });
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
      error: error.message,
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
      checks.database = { status: 'unhealthy', error: e.message };
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
      version: process.env.npm_package_version || '1.0.0',
      environment: config.server.nodeEnv,
    };

    res.status(allHealthy ? 200 : 503).json(response);
  } catch (error) {
    logger.error('Detailed health check failed:', { error: error.message });
    res.status(503).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Metrics endpoint (basic)
router.get('/metrics', (req, res) => {
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
    
    sendErrorResponse(res, 500, 'Failed to retrieve metrics', {
      error: error.message,
    });
  }
});

export default router;

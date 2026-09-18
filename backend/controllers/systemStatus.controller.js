import mongoose from 'mongoose';
import os from 'node:os';
import databaseConnection from '../config/database.js';
import { config } from '../config/environment.js';
import { APP_VERSION } from '../utils/version.js';
import { registeredJobs } from '../jobs/scheduler.js';
import JobLock from '../models/jobLock.model.js';
import { mailSource } from '../utils/mailer.js';
import { runWithoutTenantScope } from '../tenancy/tenantContext.js';

/**
 * What an admin needs to know about the deployment, in the app.
 *
 * All of this existed already as `/api/health/*`, but those are probes for load
 * balancers — no screen in the product ever called them, so an admin had no way
 * to see whether mail was configured, whether the scheduler was running, or what
 * version they were on. That is exactly the information someone wants before
 * they report a problem.
 */
export const getSystemStatus = async (req, res, next) => {
  try {
    const dbHealth = await databaseConnection.healthCheck();

    // Job state is deployment-wide, not per workspace.
    const locks = await runWithoutTenantScope('reading scheduler state for the admin screen', () =>
      JobLock.find({}).lean()
    );
    const lockByName = new Map(locks.map((l) => [l.name, l]));

    const jobs = registeredJobs().map((job) => {
      const lock = lockByName.get(job.name);
      return {
        name: job.name,
        schedule: job.dailyAt ? `daily at ${job.dailyAt} UTC` : `every ${Math.round(job.everyMs / 60000)} min`,
        lastRunAt: lock?.lastRunAt || null,
        lastResult: lock?.lastResult || '',
        // A job whose last result starts with "failed:" is the thing worth
        // surfacing; everything else is noise.
        healthy: !String(lock?.lastResult || '').startsWith('failed:'),
      };
    });

    const memory = process.memoryUsage();

    res.json({
      success: true,
      data: {
        version: APP_VERSION,
        environment: config.server.nodeEnv,
        uptimeSeconds: Math.round(process.uptime()),
        startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),

        database: {
          status: dbHealth.status,
          readyState: mongoose.connection.readyState,
          name: mongoose.connection.name || null,
          latencyMs: dbHealth.latencyMs ?? null,
        },

        email: { source: await mailSource() },

        scheduler: {
          enabled: process.env.JOBS_ENABLED !== 'false',
          jobs,
        },

        runtime: {
          node: process.version,
          platform: `${process.platform} ${process.arch}`,
          hostname: os.hostname(),
          pid: process.pid,
          memoryMb: {
            heapUsed: Math.round(memory.heapUsed / 1048576),
            heapTotal: Math.round(memory.heapTotal / 1048576),
            rss: Math.round(memory.rss / 1048576),
          },
        },

        /*
         * Which optional integrations are configured. Booleans only — an admin
         * needs to know whether a key is present, never what it is.
         */
        integrations: {
          smtp: Boolean(process.env.SMTP_USER && process.env.SMTP_PASS),
          sms: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
          observability: Boolean(process.env.OPENOBSERVE_USERNAME),
          cloudinary: Boolean(process.env.CLOUDINARY_CLOUD_NAME || process.env.VITE_CLOUDINARY_CLOUD_NAME),
          responseEncryption: process.env.ENCRYPT_API_RESPONSES === 'true',
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

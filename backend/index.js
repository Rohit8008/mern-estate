import mongoose from 'mongoose';
import { validateConfig, config } from './config/environment.js';
import { registerTenancy } from './tenancy/tenantPlugin.js';
import { logger, flushLogs } from './utils/logger.js';
import { flushDiscordAlerts, alertDiscord } from './utils/discordAlert.js';

// Tenant scoping is a global Mongoose plugin, and a plugin only applies to
// schemas compiled AFTER it is registered. This has to run before the first
// model import — hence the deferred import of ./server.js below, which pulls in
// app.js and with it every model in the project.
registerTenancy(mongoose);

const { startServer, setupSocket, io, server } = await import('./server.js');
const { startJobs } = await import('./jobs/index.js');
const { registerBuiltinRules } = await import('./plugins/builtin.js');
const { startCacheInvalidationListener, stopCacheInvalidationListener } = await import('./utils/cache.js');
const { stopScheduler } = await import('./jobs/scheduler.js');
const { default: databaseConnection } = await import('./config/database.js');
const { closeRedis } = await import('./utils/redis.js');
const { markShuttingDown } = await import('./utils/lifecycle.js');

validateConfig();

const bootstrap = async () => {
  try {
    // Workspace rules resolve implementations by name, so the vocabulary has
    // to exist before the first request can run a hook.
    registerBuiltinRules();

    // No-op without REDIS_URL; with it, every instance drops the same keys.
    await startCacheInvalidationListener();

    setupSocket();
    await startServer();

    // Tells PM2 (wait_ready in ecosystem.config.js) the server is listening.
    // process.send exists only under a PM2/cluster/fork parent; a no-op otherwise.
    process.send?.('ready');

    // After the server is up: a job that runs before the process can serve
    // traffic has nothing to gain and a failure there should not stop boot.
    startJobs();
    logger.info('Server started successfully', {
      port: config.server.port,
      host: config.server.host,
      environment: config.server.nodeEnv,
    });
    // Optional "deploy is live" ping, so the team sees the service come back up
    // (and that alerts are wired). Off by default; opt in with
    // DISCORD_ALERT_ON_START=true. In a PM2 cluster, limit to one instance.
    if (process.env.DISCORD_ALERT_ON_START === 'true' && (process.env.NODE_APP_INSTANCE ?? '0') === '0') {
      alertDiscord('success', 'Backend started', { message: `${config.server.nodeEnv} is live and serving traffic.` });
    }
  } catch (error) {
    logger.error('Failed to start server', { message: error.message, stack: error.stack });
    process.exit(1);
  }
};

// ── Shutdown ────────────────────────────────────────────────────────────────
// One ordered sequence for every way the process ends. The pieces used to
// race: the database module exited on SIGTERM the instant Mongo disconnected,
// so requests mid-flight got a reset connection, the logger's own flush lost,
// and the scheduler's lease was never released.
//
//   1. stop accepting connections and let in-flight requests finish
//   2. stop the scheduler and the cache-invalidation listener
//   3. close sockets, disconnect the database, flush logs, exit
//
// SHUTDOWN_TIMEOUT_MS bounds the wait, so a stuck request cannot hold a
// deploy forever; the orchestrator's own kill timeout should be longer.
const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS) || 10_000;
let shuttingDown = false;

async function shutdown(reason, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  markShuttingDown();
  logger.info('Shutting down', { reason });

  const force = setTimeout(() => {
    logger.error('Shutdown timed out; closing remaining connections', { timeoutMs: SHUTDOWN_TIMEOUT_MS });
    server.closeAllConnections?.();
  }, SHUTDOWN_TIMEOUT_MS);
  force.unref();

  try {
    await new Promise((resolve) => {
      server.close(() => resolve());
      // Keep-alive sockets with no request on them would otherwise hold
      // close() open until they time out on their own.
      server.closeIdleConnections?.();
    });
    stopScheduler();
    await stopCacheInvalidationListener().catch(() => {});
    io?.close?.();
    await closeRedis().catch(() => {});
    await databaseConnection.disconnect().catch(() => {});
  } catch (err) {
    logger.error('Error during shutdown', { message: err.message });
    exitCode = exitCode || 1;
  } finally {
    clearTimeout(force);
    // Give a crash alert (uncaughtException/unhandledRejection logged just
    // above) its chance to reach Discord before the process exits.
    await flushDiscordAlerts().catch(() => {});
    await flushLogs().catch(() => {});
    process.exit(exitCode);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Process-level hardening: log, then leave through the same door.
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason: String(reason) });
  shutdown('unhandledRejection', 1);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { message: err.message, stack: err.stack });
  shutdown('uncaughtException', 1);
});

bootstrap();

export { io };
import mongoose from 'mongoose';
import { validateConfig, config } from './config/environment.js';
import { registerTenancy } from './tenancy/tenantPlugin.js';
import { logger } from './utils/logger.js';

// Tenant scoping is a global Mongoose plugin, and a plugin only applies to
// schemas compiled AFTER it is registered. This has to run before the first
// model import — hence the deferred import of ./server.js below, which pulls in
// app.js and with it every model in the project.
registerTenancy(mongoose);

const { startServer, setupSocket, io, server } = await import('./server.js');
const { startJobs } = await import('./jobs/index.js');
const { registerBuiltinRules } = await import('./plugins/builtin.js');
const { startCacheInvalidationListener } = await import('./utils/cache.js');

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

    // After the server is up: a job that runs before the process can serve
    // traffic has nothing to gain and a failure there should not stop boot.
    startJobs();
    logger.info('Server started successfully', {
      port: config.server.port,
      host: config.server.host,
      environment: config.server.nodeEnv,
    });
  } catch (error) {
    logger.error('Failed to start server', { message: error.message, stack: error.stack });
    process.exit(1);
  }
};

// Process-level hardening
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason: String(reason) });
  server.close(() => process.exit(1));
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { message: err.message, stack: err.stack });
  server.close(() => process.exit(1));
});

bootstrap();

export { io };
import { validateConfig, config } from './config/environment.js';
import { logger } from './utils/logger.js';
import { startServer, setupSocket, io, server } from './server.js';

validateConfig();

const bootstrap = async () => {
  try {
    setupSocket();
    await startServer();
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
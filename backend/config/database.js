import mongoose from 'mongoose';
import { config } from './environment.js';
import { logger } from '../utils/logger.js';

class DatabaseConnection {
  constructor() {
    this.isConnected = false;
    this.connection = null;
    this.pending = new Map(); // driver requestId -> collection, for slow-query lines
  }

  async connect() {
    try {
      if (this.isConnected) {
        logger.debug('Database already connected');
        return;
      }

      // Set mongoose options
      mongoose.set('strictQuery', false);
      
      // Connection options
      const options = {
        maxPoolSize: config.database.options.maxPoolSize,
        serverSelectionTimeoutMS: config.database.options.serverSelectionTimeoutMS,
        socketTimeoutMS: config.database.options.socketTimeoutMS,
        // Emits command timings, read by watchSlowQueries().
        monitorCommands: Number(process.env.SLOW_QUERY_MS ?? 500) > 0,
      };

      // Connect to MongoDB
      this.connection = await mongoose.connect(config.database.uri, options);
      this.isConnected = true;

      logger.info('Database connected', {
        host: this.connection.connection.host,
        port: this.connection.connection.port,
        name: this.connection.connection.name,
      });

      // Set up connection event handlers
      this.setupEventHandlers();
      this.watchSlowQueries();

    } catch (error) {
      logger.error('Database connection failed', {
        message: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Slow database commands, from the driver's own timings. Nothing else in the
   * app would tell you an index is missing until a page times out.
   * SLOW_QUERY_MS (default 500) sets the bar; 0 turns it off.
   */
  watchSlowQueries() {
    const slowMs = Number(process.env.SLOW_QUERY_MS ?? 500);
    if (!slowMs) return;
    const client = mongoose.connection.getClient?.();
    if (!client?.on) return;
    client.on('commandSucceeded', (e) => {
      const collection = this.pending.get(e.requestId);
      this.pending.delete(e.requestId);
      if (e.duration < slowMs) return;
      logger.warn('Slow database command', { command: e.commandName, collection, duration_ms: e.duration });
    });
    client.on('commandStarted', (e) => {
      // Only the collection name is kept — never the filter, which holds
      // names, phone numbers and emails.
      const collection = e.command?.[e.commandName];
      if (typeof collection === 'string') {
        this.pending.set(e.requestId, collection);
        if (this.pending.size > 5000) this.pending.clear();
      }
    });
    client.on('commandFailed', (e) => {
      this.pending.delete(e.requestId);
      logger.error('Database command failed', { command: e.commandName, duration_ms: e.duration, error: e.failure });
    });
  }

  setupEventHandlers() {
    const db = mongoose.connection;

    db.on('connected', () => {
      logger.info('Mongoose connected to MongoDB');
    });

    db.on('error', (error) => {
      logger.error('Mongoose connection error', {
        message: error.message,
        stack: error.stack,
      });
    });

    db.on('disconnected', () => {
      logger.warn('Mongoose disconnected from MongoDB');
      this.isConnected = false;
    });

    db.on('reconnected', () => {
      logger.info('Mongoose reconnected to MongoDB');
      this.isConnected = true;
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      await this.disconnect();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await this.disconnect();
      process.exit(0);
    });
  }

  async disconnect() {
    try {
      if (this.isConnected && this.connection) {
        await mongoose.disconnect();
        this.isConnected = false;
        logger.info('Database disconnected');
      }
    } catch (error) {
      logger.error('Error disconnecting from database', {
        message: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  getConnection() {
    return this.connection;
  }

  getStatus() {
    return {
      isConnected: this.isConnected,
      readyState: mongoose.connection.readyState,
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      name: mongoose.connection.name,
    };
  }

  // Health check
  async healthCheck() {
    try {
      if (!this.isConnected) {
        return { status: 'disconnected', message: 'Database not connected' };
      }

      // Ping the database
      await mongoose.connection.db.admin().ping();
      
      return { 
        status: 'healthy', 
        message: 'Database connection is healthy',
        ...this.getStatus()
      };
    } catch (error) {
      logger.error('Database health check failed', {
        message: error.message,
        stack: error.stack,
      });
      return { 
        status: 'unhealthy', 
        message: 'Database health check failed',
        error: error.message 
      };
    }
  }
}

// Create singleton instance
const databaseConnection = new DatabaseConnection();

export default databaseConnection;

import mongoose from 'mongoose';
import { config } from './environment.js';

class DatabaseConnection {
  constructor() {
    this.isConnected = false;
    this.connection = null;
  }

  async connect() {
    try {
      if (this.isConnected) {
        console.log('Database already connected');
        return;
      }

      // Set mongoose options
      mongoose.set('strictQuery', false);
      
      // Connection options
      const options = {
        maxPoolSize: config.database.options.maxPoolSize,
        serverSelectionTimeoutMS: config.database.options.serverSelectionTimeoutMS,
        socketTimeoutMS: config.database.options.socketTimeoutMS,
      };

      // Connect to MongoDB
      this.connection = await mongoose.connect(config.database.uri, options);
      this.isConnected = true;

      console.log('Database connected successfully', {
        host: this.connection.connection.host,
        port: this.connection.connection.port,
        name: this.connection.connection.name,
      });

      // Set up connection event handlers
      this.setupEventHandlers();

    } catch (error) {
      console.error('Database connection failed:', {
        message: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  setupEventHandlers() {
    const db = mongoose.connection;

    db.on('connected', () => {
      console.log('Mongoose connected to MongoDB');
    });

    db.on('error', (error) => {
      console.error('Mongoose connection error:', {
        message: error.message,
        stack: error.stack,
      });
    });

    db.on('disconnected', () => {
      console.warn('Mongoose disconnected from MongoDB');
      this.isConnected = false;
    });

    db.on('reconnected', () => {
      console.log('Mongoose reconnected to MongoDB');
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
        console.log('Database disconnected successfully');
      }
    } catch (error) {
      console.error('Error disconnecting from database:', {
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
      console.error('Database health check failed:', {
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

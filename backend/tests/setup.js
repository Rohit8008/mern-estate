/**
 * Jest Test Setup
 *
 * This file runs before each test file.
 * It sets up the test database and common utilities.
 */

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongoServer;

/**
 * Setup test database before all tests
 */
beforeAll(async () => {
  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing';
  process.env.REFRESH_SECRET = 'test-refresh-secret-key-for-testing';

  // Create in-memory MongoDB instance
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();

  // Connect to in-memory database
  await mongoose.connect(mongoUri, {
    maxPoolSize: 10,
  });

  console.log('Test database connected');
});

/**
 * Clean up database after each test
 */
afterEach(async () => {
  // Clear all collections
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
});

/**
 * Disconnect and stop database after all tests
 */
afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
  console.log('Test database disconnected');
});

/**
 * Helper to create a test user
 */
export const createTestUser = async (User, overrides = {}) => {
  const defaultUser = {
    username: 'testuser',
    email: 'test@example.com',
    password: 'Test123!@#',
    phone: '1234567890',
    status: 'active',
  };

  const user = new User({ ...defaultUser, ...overrides });
  await user.save();
  return user;
};

/**
 * Helper to create auth tokens
 */
export const createAuthToken = async (jwt, user) => {
  const payload = {
    id: user._id,
    email: user.email,
    role: user.role || 'user',
  };

  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: '15m',
  });

  const refreshToken = jwt.sign(payload, process.env.REFRESH_SECRET, {
    expiresIn: '7d',
  });

  return { accessToken, refreshToken };
};

/**
 * Helper to get authenticated agent
 */
export const getAuthenticatedAgent = (request, app, accessToken) => {
  return request(app)
    .set('Cookie', [`access_token=${accessToken}`]);
};

// Extend Jest with custom matchers
expect.extend({
  toBeValidObjectId(received) {
    const pass = mongoose.Types.ObjectId.isValid(received);
    return {
      pass,
      message: () =>
        pass
          ? `expected ${received} not to be a valid ObjectId`
          : `expected ${received} to be a valid ObjectId`,
    };
  },

  toBeWithinRange(received, floor, ceiling) {
    const pass = received >= floor && received <= ceiling;
    return {
      pass,
      message: () =>
        pass
          ? `expected ${received} not to be within range ${floor} - ${ceiling}`
          : `expected ${received} to be within range ${floor} - ${ceiling}`,
    };
  },
});

// Global test utilities
global.testUtils = {
  createTestUser,
  createAuthToken,
  getAuthenticatedAgent,
};

/**
 * Jest Test Setup
 *
 * This file runs before each test file.
 * It sets up the test database and common utilities.
 */

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { registerTenancy } from '../tenancy/tenantPlugin.js';
import { runWithTenant, runWithoutTenantScope } from '../tenancy/tenantContext.js';

/**
 * Tenancy is registered here, at module scope, so it is in place before any
 * test file's model imports are evaluated — a global Mongoose plugin only
 * applies to schemas compiled after it is registered.
 *
 * Without this the suite would run with tenant scoping switched off, and every
 * test would pass while telling you nothing about the boundary that actually
 * protects one agency's data from another's.
 */
registerTenancy(mongoose);

let mongoServer;

/** The tenant every test runs as, unless it says otherwise. */
export let TEST_TENANT_ID = null;

/** Run `fn` as the default test tenant. */
export const asTestTenant = (fn) => runWithTenant({ tenantId: String(TEST_TENANT_ID) }, fn);

/** Run `fn` as some other tenant — for asserting that data does not cross over. */
export const asTenant = (tenantId, fn) => runWithTenant({ tenantId: String(tenantId) }, fn);

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
 * A fresh tenant per test. Recreated rather than preserved through the wipe
 * above, so no test can depend on state another test left behind.
 */
beforeEach(async () => {
  const Tenant = (await import('../models/tenant.model.js')).default;
  const { invalidateTenantCache } = await import('../tenancy/resolveTenant.js');

  // Slug 'default' so resolveTenant()'s fallback finds it, matching a
  // single-workspace deployment.
  const tenant = await runWithoutTenantScope('creating the fixture tenant', () =>
    Tenant.create({ name: 'Test Workspace', slug: 'default', status: 'active' })
  );
  TEST_TENANT_ID = tenant._id;

  // Each test gets a new tenant _id, and the resolver caches for 60s — without
  // this, test two resolves to test one's deleted tenant.
  invalidateTenantCache();
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

  return asTestTenant(async () => {
    const user = new User({ ...defaultUser, ...overrides });
    await user.save();
    return user;
  });
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
  // Tenant helpers, so a test that writes directly to a model (rather than
  // through an HTTP request) can supply the context resolveTenant would.
  asTestTenant,
  asTenant,
  get tenantId() { return TEST_TENANT_ID; },
  createTestUser,
  createAuthToken,
  getAuthenticatedAgent,
};

/**
 * Authentication API Tests
 *
 * Tests for auth endpoints: signin, signout, refresh token
 */

import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import User from '../models/user.model.js';
import authRouter from '../routes/auth.route.js';
import { globalErrorHandler } from '../utils/error.js';

// Create minimal test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/auth', authRouter);
  app.use(globalErrorHandler);
  return app;
};

describe('Auth API', () => {
  let app;

  beforeAll(() => {
    app = createTestApp();
  });

  describe('POST /api/auth/signin', () => {
    it('should return 400 for missing credentials', async () => {
      const res = await request(app)
        .post('/api/auth/signin')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 400 for missing password', async () => {
      const res = await request(app)
        .post('/api/auth/signin')
        .send({ email: 'test@example.com' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 400 for missing email', async () => {
      const res = await request(app)
        .post('/api/auth/signin')
        .send({ password: 'password123' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 401 for non-existent user', async () => {
      const res = await request(app)
        .post('/api/auth/signin')
        .send({
          email: 'nonexistent@example.com',
          password: 'password123',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should return 401 for wrong password', async () => {
      // Create a test user
      await global.testUtils.createTestUser(User, {
        email: 'wrongpass@example.com',
        password: 'CorrectPassword123!',
      });

      const res = await request(app)
        .post('/api/auth/signin')
        .send({
          email: 'wrongpass@example.com',
          password: 'WrongPassword123!',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should successfully signin with valid credentials', async () => {
      // Create a test user
      const testUser = await global.testUtils.createTestUser(User, {
        email: 'valid@example.com',
        password: 'ValidPassword123!',
      });

      const res = await request(app)
        .post('/api/auth/signin')
        .send({
          email: 'valid@example.com',
          password: 'ValidPassword123!',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body._id).toBeDefined();
      expect(res.body.email).toBe('valid@example.com');
      expect(res.body.password).toBeUndefined(); // Password should not be returned

      // Check that cookies are set
      expect(res.headers['set-cookie']).toBeDefined();
    });
  });

  describe('POST /api/auth/signout', () => {
    it('should clear auth cookies on signout', async () => {
      const res = await request(app)
        .post('/api/auth/signout')
        .send();

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('signed out');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should return 401 without refresh token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send();

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should return 401 with invalid refresh token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', ['refresh_token=invalid-token'])
        .send();

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should return new access token with valid refresh token', async () => {
      // Create user and generate refresh token
      const testUser = await global.testUtils.createTestUser(User, {
        email: 'refresh@example.com',
      });

      const { refreshToken } = await global.testUtils.createAuthToken(jwt, testUser);

      // Store refresh token in user document
      testUser.refreshTokens = [refreshToken];
      await testUser.save();

      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [`refresh_token=${refreshToken}`])
        .send();

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.headers['set-cookie']).toBeDefined();
    });
  });
});

describe('Auth Validation', () => {
  let app;

  beforeAll(() => {
    app = createTestApp();
  });

  describe('Email validation', () => {
    it('should reject invalid email format', async () => {
      const res = await request(app)
        .post('/api/auth/signin')
        .send({
          email: 'invalid-email',
          password: 'password123',
        });

      expect(res.status).toBe(400);
    });
  });

  describe('Password validation', () => {
    it('should reject empty password', async () => {
      const res = await request(app)
        .post('/api/auth/signin')
        .send({
          email: 'test@example.com',
          password: '',
        });

      expect(res.status).toBe(400);
    });
  });
});

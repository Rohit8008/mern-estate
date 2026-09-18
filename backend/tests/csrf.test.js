/**
 * CSRF double-submit check.
 *
 * The reason this control exists: auth is cookie-only and production issues the
 * session cookies with `sameSite: 'none'`, which tells the browser to attach
 * them to cross-site requests. A cross-origin form POST is a CORS "simple
 * request" — no preflight, cookies attached, `express.urlencoded` parses it —
 * so CORS alone does not stop the write.
 *
 * These tests pin the four behaviours the middleware has to get right, because
 * the failure mode of a CSRF check is silence: it either lets everything past
 * or blocks the app's own traffic, and neither is visible without a test.
 */

import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { requireCsrfToken, CSRF_COOKIE } from '../middleware/csrf.js';

const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api', requireCsrfToken);
  app.post('/api/listing/create', (req, res) => res.status(201).json({ success: true }));
  app.get('/api/listing/get', (req, res) => res.status(200).json({ success: true }));
  app.post('/api/auth/signin', (req, res) => res.status(200).json({ success: true }));
  return app;
};

describe('CSRF', () => {
  let app;
  beforeAll(() => { app = createTestApp(); });

  it('refuses a cookie-authenticated write with no CSRF header', async () => {
    const res = await request(app)
      .post('/api/listing/create')
      .set('Cookie', ['access_token=whatever', `${CSRF_COOKIE}=abc123`])
      .send({ name: 'forged' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CSRF_TOKEN_INVALID');
  });

  it('refuses a write whose header does not match the cookie', async () => {
    const res = await request(app)
      .post('/api/listing/create')
      .set('Cookie', ['access_token=whatever', `${CSRF_COOKIE}=abc123`])
      .set('X-CSRF-Token', 'abc124')
      .send({ name: 'forged' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CSRF_TOKEN_INVALID');
  });

  it('allows a write that echoes the cookie back', async () => {
    const res = await request(app)
      .post('/api/listing/create')
      .set('Cookie', ['access_token=whatever', `${CSRF_COOKIE}=abc123`])
      .set('X-CSRF-Token', 'abc123')
      .send({ name: 'legitimate' });

    expect(res.status).toBe(201);
  });

  it('never blocks a read', async () => {
    const res = await request(app)
      .get('/api/listing/get')
      .set('Cookie', ['access_token=whatever', `${CSRF_COOKIE}=abc123`]);

    expect(res.status).toBe(200);
  });

  it('lets sign-in through — there is no session to forge yet', async () => {
    const res = await request(app).post('/api/auth/signin').send({ email: 'a@b.test' });
    expect(res.status).toBe(200);
  });

  it('lets a signed-out write through, so the route answers 401 rather than a confusing CSRF error', async () => {
    const res = await request(app).post('/api/listing/create').send({ name: 'anon' });
    expect(res.status).toBe(201); // the stub route; in the real app verifyToken answers 401
  });

  it('tells a pre-update session to sign in again rather than failing opaquely', async () => {
    const res = await request(app)
      .post('/api/listing/create')
      .set('Cookie', ['access_token=whatever'])
      .send({ name: 'old session' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CSRF_COOKIE_MISSING');
  });
});

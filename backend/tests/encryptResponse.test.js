/**
 * ENCRYPT_API_RESPONSES wraps every JSON body in { _enc, iv, data }. The Flutter
 * app cannot decode that, so it sends `X-Client: mobile` and must get plaintext.
 * The flag is read at import time, hence the env set before a dynamic import.
 */
import request from 'supertest';
import express from 'express';

describe('encryptResponse', () => {
  let app;

  beforeAll(async () => {
    process.env.ENCRYPT_API_RESPONSES = 'true';
    process.env.API_RESPONSE_SECRET = 'test-response-secret';
    const { encryptResponse } = await import('../middleware/encryptResponse.js');
    app = express();
    app.use('/api', encryptResponse);
    app.get('/api/thing', (req, res) => res.json({ hello: 'world' }));
    app.get('/api/health/startup', (req, res) => res.json({ ok: true }));
  });

  afterAll(() => {
    delete process.env.ENCRYPT_API_RESPONSES;
    delete process.env.API_RESPONSE_SECRET;
  });

  it('encrypts for a browser client', async () => {
    const res = await request(app).get('/api/thing');
    expect(res.body._enc).toBe(true);
    expect(res.body.hello).toBeUndefined();
  });

  it('sends plaintext to the mobile app', async () => {
    const res = await request(app).get('/api/thing').set('X-Client', 'mobile');
    expect(res.body).toEqual({ hello: 'world' });
  });

  it('still leaves health checks in the clear', async () => {
    const res = await request(app).get('/api/health/startup');
    expect(res.body).toEqual({ ok: true });
  });
});

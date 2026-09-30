/**
 * Logging: what reaches OpenObserve must be useful and must not be a leak.
 *
 * One log store serves every workspace, so a password, a session cookie or a
 * share-link token written into it is readable by anyone who can search logs.
 * These tests pin the redaction and the request id that ties a request's
 * access line, errors and audit entry together.
 */

import request from 'supertest';
import express from 'express';
import { redact, sanitizeUrl } from '../utils/logger.js';
import { requestContext, getLogContext } from '../utils/logContext.js';

describe('redact', () => {
  test('masks credential-shaped keys at any depth', () => {
    const out = redact({
      email: 'a@b.co',
      password: 'hunter2',
      nested: { refresh_token: 'abc', headers: { authorization: 'Bearer x', cookie: 'sid=1' } },
      list: [{ apiKey: 'k' }],
      passcode: '1234',
    });
    expect(out.email).toBe('a@b.co');
    expect(out.password).toBe('[redacted]');
    expect(out.nested.refresh_token).toBe('[redacted]');
    expect(out.nested.headers.authorization).toBe('[redacted]');
    expect(out.nested.headers.cookie).toBe('[redacted]');
    expect(out.list[0].apiKey).toBe('[redacted]');
    expect(out.passcode).toBe('[redacted]');
  });

  test('serialises errors instead of logging {}', () => {
    const out = redact({ error: new TypeError('boom') });
    expect(out.error.name).toBe('TypeError');
    expect(out.error.message).toBe('boom');
    expect(out.error.stack).toContain('boom');
  });

  test('truncates huge strings and survives cycles by depth limit', () => {
    const a = { big: 'x'.repeat(20_000) };
    a.self = a;
    const out = redact(a);
    expect(out.big.length).toBeLessThan(9_000);
    expect(JSON.stringify(out)).toContain('[depth limit]');
  });
});

describe('sanitizeUrl', () => {
  test('masks token path segments on credential routes only', () => {
    expect(sanitizeUrl('/api/share/open/Zx9_abc123DEF456ghi')).toBe('/api/share/open/:token');
    expect(sanitizeUrl('/api/auth/invite/abc123def456ghi789')).toBe('/api/auth/invite/:token');
    expect(sanitizeUrl('/api/unsubscribe/tok123456789')).toBe('/api/unsubscribe/:token');
    // ObjectIds and slugs stay: they are what makes an access line useful.
    expect(sanitizeUrl('/api/clients/64f1a2b3c4d5e6f7a8b9c0d1')).toBe('/api/clients/64f1a2b3c4d5e6f7a8b9c0d1');
  });

  test('masks sensitive query parameters', () => {
    const out = sanitizeUrl('/api/listing/get?q=villa&token=secret&passcode=9');
    expect(out).toContain('q=villa');
    expect(out).not.toContain('secret');
    expect(out).not.toContain('passcode=9');
  });
});

describe('requestContext', () => {
  const app = express();
  app.use(requestContext);
  app.get('/x', (req, res) => res.json({ id: getLogContext()?.requestId }));

  test('issues a request id and echoes it', async () => {
    const res = await request(app).get('/x');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.id).toBe(res.headers['x-request-id']);
  });

  test('honours a well-formed upstream id and replaces a malformed one', async () => {
    const good = await request(app).get('/x').set('X-Request-Id', 'mobile-12345678');
    expect(good.headers['x-request-id']).toBe('mobile-12345678');
    const bad = await request(app).get('/x').set('X-Request-Id', '<script>alert(1)</script>');
    expect(bad.headers['x-request-id']).not.toContain('<');
  });
});

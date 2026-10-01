/**
 * The request pipeline in app.js, through the real createApp().
 *
 * These pin properties that live in middleware ORDER, which no unit test of a
 * single middleware can see: the sanitisers ran before the body parser for
 * as long as this file existed, so `{"$ne": null}` in a JSON body reached the
 * controllers untouched; and errors came back in three shapes, with nothing to
 * tie a failure a customer saw to the log line that explains it.
 */

import mongoose from 'mongoose';
import request from 'supertest';
import express from 'express';
import { registerTenancy } from '../tenancy/tenantPlugin.js';
import { classifyError, ERROR_CODES, AppError, errorHandler } from '../utils/error.js';
import { errorEnvelope } from '../middleware/errorEnvelope.js';
import { requestId, getRequestId } from '../utils/requestContext.js';
import { mongoSanitization } from '../middleware/security.js';

let app;

beforeAll(async () => {
  registerTenancy(mongoose);
  const { createApp } = await import('../app.js');
  app = createApp();
});

describe('request id', () => {
  it('is set on every response', async () => {
    const res = await request(app).get('/api/no-such-route').set('Accept', 'application/json');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('keeps a well-formed inbound id and refuses a malformed one', async () => {
    const kept = await request(app).get('/api/no-such-route').set('X-Request-Id', 'abc12345-trace');
    expect(kept.headers['x-request-id']).toBe('abc12345-trace');

    const replaced = await request(app).get('/api/no-such-route').set('X-Request-Id', 'bad id <script>');
    expect(replaced.headers['x-request-id']).not.toBe('bad id <script>');
  });

  it('is readable anywhere inside the request', async () => {
    const mini = express();
    mini.use(requestId);
    mini.get('/x', async (req, res) => {
      await new Promise((r) => setTimeout(r, 5));
      res.json({ fromContext: getRequestId(), fromReq: req.id });
    });
    const res = await request(mini).get('/x');
    expect(res.body.fromContext).toBe(res.body.fromReq);
    expect(getRequestId()).toBeNull();
  });
});

describe('error shape', () => {
  it('carries a stable code and the request id on the 404 catch-all', async () => {
    const res = await request(app).get('/api/no-such-route').set('Accept', 'application/json');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, code: ERROR_CODES.NOT_FOUND });
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
  });

  it('answers malformed JSON as a 400, not a 500', async () => {
    const res = await request(app)
      .post('/api/auth/signin')
      .set('Content-Type', 'application/json')
      .send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ERROR_CODES.BAD_REQUEST);
  });

  it('adds code and request id to failures a route wrote by hand', async () => {
    const mini = express();
    mini.use(requestId);
    mini.use(errorEnvelope);
    mini.get('/limit', (req, res) => res.status(402).json({ success: false, message: 'Upgrade' }));
    mini.get('/own', (req, res) => res.status(409).json({ success: false, code: 'CATEGORY_IN_USE', message: 'In use' }));
    mini.get('/ok', (req, res) => res.status(200).json({ success: true, data: [] }));

    const limit = await request(mini).get('/limit');
    expect(limit.body).toMatchObject({ code: ERROR_CODES.PLAN_LIMIT, message: 'Upgrade' });
    expect(limit.body.requestId).toBeTruthy();

    const own = await request(mini).get('/own');
    expect(own.body.code).toBe('CATEGORY_IN_USE');

    const ok = await request(mini).get('/ok');
    expect(ok.body).toEqual({ success: true, data: [] });
  });
});

describe('classifyError', () => {
  it('maps a bad ObjectId to 404 INVALID_ID', () => {
    expect(classifyError({ name: 'CastError', path: '_id' })).toMatchObject({ status: 404, code: ERROR_CODES.INVALID_ID });
  });

  it('names the duplicate field, never tenantId', () => {
    const c = classifyError({ code: 11000, keyValue: { tenantId: 't', email: 'a@b.c' } });
    expect(c).toMatchObject({ status: 409, code: ERROR_CODES.DUPLICATE, field: 'email' });
  });

  it('keeps an operational message and flags an unexpected one', () => {
    expect(classifyError(errorHandler(400, 'Name is required'))).toMatchObject({ status: 400, operational: true, message: 'Name is required' });
    expect(classifyError(new Error('connection reset by peer'))).toMatchObject({ status: 500, operational: false, code: ERROR_CODES.INTERNAL });
  });

  it('does not let a system error code become the API code', () => {
    const err = new Error('refused');
    err.code = 'ECONNREFUSED';
    expect(classifyError(err).code).toBe(ERROR_CODES.INTERNAL);
    expect(classifyError(new AppError('x', 409, true, 'CATEGORY_IN_USE')).code).toBe('CATEGORY_IN_USE');
  });
});

describe('body sanitising', () => {
  it('strips Mongo operators from a parsed JSON body, keeping dotted keys', async () => {
    const mini = express();
    mini.use(express.json());
    mini.use(mongoSanitization);
    mini.post('/echo', (req, res) => res.json(req.body));

    const res = await request(mini)
      .post('/echo')
      .send({ email: { $ne: null }, mapping: { 'Phone no.': 'phone' }, note: '<3 BHK' });

    expect(res.body.email).toEqual({ _ne: null });
    expect(res.body.mapping).toEqual({ 'Phone no.': 'phone' });
    // Markup in a body is the user's content, not an attack to rewrite.
    expect(res.body.note).toBe('<3 BHK');
  });

  it('runs after the body parser in the real app', async () => {
    // An operator object where sign-in expects a string must be refused by
    // validation, never reach the user lookup as a query operator.
    const res = await request(app)
      .post('/api/auth/signin')
      .send({ email: { $ne: null }, password: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ERROR_CODES.VALIDATION_FAILED);
  });
});

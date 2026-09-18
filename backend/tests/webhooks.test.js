/**
 * Outbound webhooks: signing, retry/backoff, auto-disable and the SSRF guard.
 *
 * A webhook URL is admin-supplied input that this server then fetches, which
 * makes it a server-side request forgery vector — without the host check an
 * admin could aim a hook at the cloud metadata endpoint and use our own process
 * to read it. That guard and the HMAC signature are the two things here that
 * are security properties rather than features, so they are tested directly.
 */

import { jest } from '@jest/globals';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { registerTenancy } from '../tenancy/tenantPlugin.js';
import { runWithTenant } from '../tenancy/tenantContext.js';

let Webhook, WebhookDelivery, emitEvent, deliverDueWebhooks, signPayload, generateSecret, validateWebhookUrl;

const TENANT = new mongoose.Types.ObjectId().toString();
const inTenant = (fn) => runWithTenant({ tenantId: TENANT }, fn);

beforeAll(async () => {
  registerTenancy(mongoose);
  ({ default: Webhook } = await import('../models/webhook.model.js'));
  ({ default: WebhookDelivery } = await import('../models/webhookDelivery.model.js'));
  ({ emitEvent, deliverDueWebhooks, signPayload, generateSecret, validateWebhookUrl } =
    await import('../utils/webhooks.js'));
});

beforeEach(async () => {
  await Promise.all([
    Webhook.collection.deleteMany({}),
    WebhookDelivery.collection.deleteMany({}),
  ]);
  global.fetch = jest.fn();
});

const makeHook = (overrides = {}) =>
  inTenant(() => Webhook.create({
    name: 'Test hook',
    url: 'https://example.com/hook',
    events: ['lead.created'],
    secret: generateSecret(),
    ...overrides,
  }));

const okResponse = () => ({ ok: true, status: 200, text: async () => 'ok' });

describe('signing', () => {
  it('produces a verifiable HMAC over timestamp and body', () => {
    const secret = 'whsec_test';
    const body = JSON.stringify({ hello: 'world' });
    const ts = 1700000000;

    const expected = crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
    expect(signPayload(secret, ts, body)).toBe(expected);
  });

  it('changes when the body changes', () => {
    const a = signPayload('s', 1, JSON.stringify({ a: 1 }));
    const b = signPayload('s', 1, JSON.stringify({ a: 2 }));
    expect(a).not.toBe(b);
  });

  it('changes when the timestamp changes, so a capture cannot be replayed', () => {
    const body = JSON.stringify({ a: 1 });
    expect(signPayload('s', 1, body)).not.toBe(signPayload('s', 2, body));
  });

  it('generates a distinct secret each time', () => {
    expect(generateSecret()).not.toBe(generateSecret());
  });
});

describe('queueing', () => {
  it('queues one delivery per subscribed endpoint', async () => {
    await makeHook();
    await makeHook({ name: 'Second', url: 'https://example.org/hook' });

    const queued = await inTenant(() => emitEvent('lead.created', { id: '1' }));
    expect(queued).toBe(2);

    const deliveries = await inTenant(() => WebhookDelivery.find({}).lean());
    expect(deliveries).toHaveLength(2);
    expect(deliveries[0].status).toBe('pending');
  });

  it('ignores endpoints not subscribed to the event', async () => {
    await makeHook({ events: ['deal.stage_changed'] });
    expect(await inTenant(() => emitEvent('lead.created', {}))).toBe(0);
  });

  it('delivers to a wildcard subscriber', async () => {
    await makeHook({ events: ['*'] });
    expect(await inTenant(() => emitEvent('listing.created', {}))).toBe(1);
  });

  it('ignores an inactive endpoint', async () => {
    await makeHook({ isActive: false });
    expect(await inTenant(() => emitEvent('lead.created', {}))).toBe(0);
  });
});

describe('delivery', () => {
  it('signs the request with the endpoint secret', async () => {
    const hook = await makeHook();
    await inTenant(() => emitEvent('lead.created', { id: '1' }));
    global.fetch.mockResolvedValue(okResponse());

    await inTenant(() => deliverDueWebhooks());

    const [, options] = global.fetch.mock.calls[0];
    const ts = options.headers['X-Webhook-Timestamp'];
    const expected = `sha256=${signPayload(hook.secret, ts, options.body)}`;

    expect(options.headers['X-Webhook-Signature']).toBe(expected);
    expect(options.headers['X-Webhook-Event']).toBe('lead.created');
  });

  it('marks a 2xx as delivered and clears the failure count', async () => {
    const hook = await makeHook({ failureCount: 3 });
    await inTenant(() => emitEvent('lead.created', {}));
    global.fetch.mockResolvedValue(okResponse());

    expect(await inTenant(() => deliverDueWebhooks())).toBe(1);

    const delivery = await inTenant(() => WebhookDelivery.findOne({}).lean());
    expect(delivery.status).toBe('delivered');

    const after = await inTenant(() => Webhook.findById(hook._id).lean());
    expect(after.failureCount).toBe(0);
  });

  it('schedules a retry after a failure rather than giving up', async () => {
    await makeHook();
    await inTenant(() => emitEvent('lead.created', {}));
    global.fetch.mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' });

    await inTenant(() => deliverDueWebhooks());

    const delivery = await inTenant(() => WebhookDelivery.findOne({}).lean());
    expect(delivery.status).toBe('pending');
    expect(delivery.attempts).toBe(1);
    expect(delivery.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('does not retry a delivery before its backoff has elapsed', async () => {
    await makeHook();
    await inTenant(() => emitEvent('lead.created', {}));
    global.fetch.mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' });

    await inTenant(() => deliverDueWebhooks());
    await inTenant(() => deliverDueWebhooks());

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('gives up after the attempts run out', async () => {
    await makeHook();
    await inTenant(() => emitEvent('lead.created', {}));
    global.fetch.mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' });

    // Five attempts, forcing each one due in turn.
    for (let i = 0; i < 5; i += 1) {
      await inTenant(() => WebhookDelivery.updateMany({}, { $set: { nextAttemptAt: new Date(0) } }));
      await inTenant(() => deliverDueWebhooks());
    }

    const delivery = await inTenant(() => WebhookDelivery.findOne({}).lean());
    expect(delivery.status).toBe('failed');
    expect(delivery.attempts).toBe(5);
  });

  it('disables an endpoint that keeps failing', async () => {
    const hook = await makeHook({ failureCount: 9 });
    await inTenant(() => emitEvent('lead.created', {}));
    global.fetch.mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' });

    await inTenant(() => deliverDueWebhooks());

    const after = await inTenant(() => Webhook.findById(hook._id).lean());
    expect(after.isActive).toBe(false);
    expect(after.disabledReason).toMatch(/consecutive failures/);
  });

  it('abandons a delivery whose endpoint was deleted', async () => {
    const hook = await makeHook();
    await inTenant(() => emitEvent('lead.created', {}));
    await inTenant(() => Webhook.deleteOne({ _id: hook._id }));

    await inTenant(() => deliverDueWebhooks());

    const delivery = await inTenant(() => WebhookDelivery.findOne({}).lean());
    expect(delivery.status).toBe('abandoned');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('does not deliver one workspace’s events to another’s endpoint', async () => {
    const other = new mongoose.Types.ObjectId().toString();
    await makeHook();
    await inTenant(() => emitEvent('lead.created', {}));
    global.fetch.mockResolvedValue(okResponse());

    const delivered = await runWithTenant({ tenantId: other }, () => deliverDueWebhooks());

    expect(delivered).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('URL validation (SSRF guard)', () => {
  it.each([
    'https://example.com/hook',
    'https://hooks.zapier.com/abc/def',
    'http://example.com/hook', // allowed outside production
  ])('accepts %s', (url) => {
    expect(validateWebhookUrl(url)).toBeNull();
  });

  it.each([
    ['http://localhost:3000/x', 'localhost'],
    ['http://127.0.0.1/x', 'loopback'],
    ['http://169.254.169.254/latest/meta-data/', 'cloud metadata'],
    ['http://10.0.0.5/x', 'private class A'],
    ['http://192.168.1.1/x', 'private class C'],
    ['http://172.16.0.1/x', 'private class B'],
    ['http://0.0.0.0/x', 'unspecified'],
    ['http://db.internal/x', 'internal suffix'],
    ['http://[::1]/x', 'IPv6 loopback'],
  ])('rejects %s (%s)', (url) => {
    expect(validateWebhookUrl(url)).toBeTruthy();
  });

  it.each([
    'file:///etc/passwd',
    'gopher://example.com/',
    'ftp://example.com/',
    'not a url',
  ])('rejects the non-http scheme %s', (url) => {
    expect(validateWebhookUrl(url)).toBeTruthy();
  });

  it('requires https in production', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(validateWebhookUrl('http://example.com/hook')).toMatch(/https/);
      expect(validateWebhookUrl('https://example.com/hook')).toBeNull();
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});

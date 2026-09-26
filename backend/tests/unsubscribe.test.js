/**
 * Unsubscribing from automated follow-up email.
 *
 * Sequences emailed leads with no way to stop them — no link, no header, no
 * list — while the Terms told agencies not to send unsolicited messages. These
 * hold the parts that make "stop" mean stop: the link is genuine and cannot be
 * forged, the address is remembered across re-created leads, the sequence
 * checks it at send time, and the agency cannot undo a person's own choice.
 */

import mongoose from 'mongoose';
import request from 'supertest';
import { registerTenancy } from '../tenancy/tenantPlugin.js';
import { runWithTenant, runWithoutTenantScope } from '../tenancy/tenantContext.js';

let Sequence, SequenceEnrollment, Client, EmailSuppression, runDueSequenceSteps, buildFollowUpEmail;
let signUnsubscribeToken, verifyUnsubscribeToken, suppress, unsuppressAgentEntry, isSuppressed;

const TENANT = new mongoose.Types.ObjectId().toString();
const OTHER = new mongoose.Types.ObjectId().toString();
const inTenant = (fn, tenantId = TENANT) => runWithTenant({ tenantId }, fn);
const AGENT = new mongoose.Types.ObjectId();

beforeAll(async () => {
  registerTenancy(mongoose);
  ({ default: Sequence } = await import('../models/sequence.model.js'));
  ({ default: SequenceEnrollment } = await import('../models/sequenceEnrollment.model.js'));
  ({ default: Client } = await import('../models/client.model.js'));
  ({ default: EmailSuppression } = await import('../models/emailSuppression.model.js'));
  ({ runDueSequenceSteps, buildFollowUpEmail } = await import('../jobs/sequences.js'));
  ({ signUnsubscribeToken, verifyUnsubscribeToken, suppress, unsuppressAgentEntry, isSuppressed } =
    await import('../utils/unsubscribe.js'));
});

beforeEach(async () => {
  await Promise.all([
    Sequence.collection.deleteMany({}),
    SequenceEnrollment.collection.deleteMany({}),
    Client.collection.deleteMany({}),
    EmailSuppression.collection.deleteMany({}),
  ]);
});

const makeClient = (overrides = {}, tenantId = TENANT) =>
  inTenant(() => Client.create({
    name: 'Anil Kumar',
    phone: '9876543210',
    email: 'anil@example.com',
    assignedTo: AGENT,
    createdBy: AGENT,
    ...overrides,
  }), tenantId);

describe('the token', () => {
  const clientId = new mongoose.Types.ObjectId().toString();

  it('round-trips', () => {
    const token = signUnsubscribeToken({ tenantId: TENANT, clientId });
    expect(verifyUnsubscribeToken(token)).toEqual({ tenantId: TENANT, clientId });
  });

  it('rejects a token pointed at another lead or workspace', () => {
    const [, , mac] = signUnsubscribeToken({ tenantId: TENANT, clientId }).split('.');
    const otherLead = new mongoose.Types.ObjectId().toString();
    expect(verifyUnsubscribeToken(`${TENANT}.${otherLead}.${mac}`)).toBeNull();
    expect(verifyUnsubscribeToken(`${OTHER}.${clientId}.${mac}`)).toBeNull();
  });

  it('rejects junk', () => {
    for (const junk of ['', 'a.b.c', 'x', `${TENANT}.${clientId}`, null]) {
      expect(verifyUnsubscribeToken(junk)).toBeNull();
    }
  });

  it('carries no email address', () => {
    expect(signUnsubscribeToken({ tenantId: TENANT, clientId })).not.toMatch(/@/);
  });
});

describe('the email', () => {
  it('ends with an unsubscribe link and carries the one-click headers', () => {
    const client = { _id: new mongoose.Types.ObjectId(), email: 'anil@example.com' };
    const mail = buildFollowUpEmail({
      client,
      workspace: { name: 'Acme Realty', customDomain: 'crm.acme.in' },
      subject: 'Hello',
      body: 'Still looking?',
      tenantId: TENANT,
    });
    expect(mail.text).toMatch(/enquired with Acme Realty/);
    expect(mail.text).toMatch(/https:\/\/crm\.acme\.in\/unsubscribe\/[\w.-]+/);
    expect(mail.headers['List-Unsubscribe']).toMatch(/^<https:\/\/crm\.acme\.in\/api\/unsubscribe\/[\w.-]+>$/);
    expect(mail.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });
});

describe('the sequence runner', () => {
  it('skips the email step for an unsubscribed address', async () => {
    const sequence = await inTenant(() => Sequence.create({
      name: 'Nurture',
      steps: [{ action: 'email', delayDays: 0, subject: 'Hi', body: 'Still looking?' }],
    }));
    const client = await makeClient();
    await inTenant(() => suppress({ email: 'ANIL@example.com', clientId: client._id, source: 'link' }));
    await inTenant(() => SequenceEnrollment.create({
      sequence: sequence._id, client: client._id, nextStepAt: new Date(Date.now() - 1000), enrolledBy: AGENT,
    }));

    await inTenant(() => runDueSequenceSteps());

    const [enrollment] = await inTenant(() => SequenceEnrollment.find({}).lean());
    expect(enrollment.history[0].outcome).toBe('skipped: unsubscribed');
  });
});

describe('the suppression list', () => {
  it('marks every lead with the address, and a lead created later', async () => {
    const first = await makeClient();
    await inTenant(() => suppress({ email: 'anil@example.com', clientId: first._id, source: 'link' }));

    const reloaded = await inTenant(() => Client.findById(first._id).lean());
    expect(reloaded.emailOptOut?.source).toBe('link');

    // The same person, re-imported as a new lead next month.
    const again = await makeClient({ name: 'Anil K', phone: '9876500000' });
    expect(again.emailOptOut?.source).toBe('link');
  });

  it('is per workspace', async () => {
    await inTenant(() => suppress({ email: 'anil@example.com', source: 'link' }));
    expect(await inTenant(() => isSuppressed('anil@example.com'))).toBe(true);
    expect(await inTenant(() => isSuppressed('anil@example.com'), OTHER)).toBe(false);
  });

  it('keeps the first record: a later agent entry does not replace the person\'s own', async () => {
    await inTenant(() => suppress({ email: 'anil@example.com', source: 'link' }));
    await inTenant(() => suppress({ email: 'anil@example.com', source: 'agent', recordedBy: AGENT }));
    const rows = await inTenant(() => EmailSuppression.find({}).lean());
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('link');
  });

  it('lets the agency undo only what the agency recorded', async () => {
    await inTenant(() => suppress({ email: 'self@example.com', source: 'one_click' }));
    await inTenant(() => suppress({ email: 'agent@example.com', source: 'agent', recordedBy: AGENT }));

    expect(await inTenant(() => unsuppressAgentEntry('self@example.com'))).toEqual({ removed: false, reason: 'person_unsubscribed' });
    expect(await inTenant(() => unsuppressAgentEntry('agent@example.com'))).toEqual({ removed: true });
    expect(await inTenant(() => isSuppressed('self@example.com'))).toBe(true);
    expect(await inTenant(() => isSuppressed('agent@example.com'))).toBe(false);
  });
});

describe('the public endpoints', () => {
  let app, Tenant;

  beforeAll(async () => {
    ({ default: Tenant } = await import('../models/tenant.model.js'));
    const { createApp } = await import('../app.js');
    app = createApp();
  });

  beforeEach(async () => {
    await runWithoutTenantScope('seeding a tenant for unsubscribe tests', async () => {
      await Tenant.collection.deleteMany({});
      await Tenant.create({ _id: TENANT, name: 'Acme Realty', slug: 'acme', status: 'active' });
    });
  });

  it('describes the link with a masked address and the agency name only', async () => {
    const client = await makeClient();
    const token = signUnsubscribeToken({ tenantId: TENANT, clientId: client._id });

    const res = await request(app).get(`/api/unsubscribe/${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ agency: 'Acme Realty', email: 'a•••@example.com', unsubscribed: false });
  });

  it('takes a mail client\'s one-click POST — no cookies, no CSRF header, a form body', async () => {
    const client = await makeClient();
    const token = signUnsubscribeToken({ tenantId: TENANT, clientId: client._id });

    const res = await request(app)
      .post(`/api/unsubscribe/${token}`)
      .type('form')
      .send('List-Unsubscribe=One-Click');

    expect(res.status).toBe(200);
    const [row] = await inTenant(() => EmailSuppression.find({}).lean());
    expect(row).toMatchObject({ email: 'anil@example.com', source: 'one_click' });
  });

  it('refuses a forged token', async () => {
    const client = await makeClient();
    const token = signUnsubscribeToken({ tenantId: TENANT, clientId: client._id });
    const res = await request(app).post(`/api/unsubscribe/${token.slice(0, -2)}xx`);
    expect(res.status).toBe(404);
    expect(await inTenant(() => EmailSuppression.countDocuments({}))).toBe(0);
  });
});

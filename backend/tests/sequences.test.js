/**
 * Drip sequences.
 *
 * Following up was entirely manual before this — a reminder someone set by
 * hand, one at a time — so it stopped happening whenever people got busy.
 *
 * The two properties that matter most here are safety ones, because an
 * automation that emails leads is the part of a CRM that can most easily
 * embarrass its owner: a step must fire exactly once, and a lead that has
 * already bought or already said no must never be chased again.
 */

import mongoose from 'mongoose';
import { registerTenancy } from '../tenancy/tenantPlugin.js';
import { runWithTenant } from '../tenancy/tenantContext.js';

let Sequence, SequenceEnrollment, Client, Task, runDueSequenceSteps, stopSequencesForClient;

const TENANT = new mongoose.Types.ObjectId().toString();
const inTenant = (fn) => runWithTenant({ tenantId: TENANT }, fn);
const AGENT = new mongoose.Types.ObjectId();

beforeAll(async () => {
  registerTenancy(mongoose);
  ({ default: Sequence } = await import('../models/sequence.model.js'));
  ({ default: SequenceEnrollment } = await import('../models/sequenceEnrollment.model.js'));
  ({ default: Client } = await import('../models/client.model.js'));
  ({ default: Task } = await import('../models/task.model.js'));
  ({ runDueSequenceSteps, stopSequencesForClient } = await import('../jobs/sequences.js'));
});

beforeEach(async () => {
  await Promise.all([
    Sequence.collection.deleteMany({}),
    SequenceEnrollment.collection.deleteMany({}),
    Client.collection.deleteMany({}),
    Task.collection.deleteMany({}),
  ]);
});

const makeSequence = (steps) =>
  inTenant(() => Sequence.create({
    name: 'Nurture',
    steps: steps || [
      { action: 'task', delayDays: 0, subject: 'Call {{firstName}}' },
      { action: 'reminder', delayDays: 3, subject: 'Second touch' },
    ],
  }));

const makeClient = (overrides = {}) =>
  inTenant(() => Client.create({
    name: 'Anil Kumar',
    phone: '9876543210',
    assignedTo: AGENT,
    createdBy: AGENT,
    ...overrides,
  }));

const enroll = (sequence, client, overrides = {}) =>
  inTenant(() => SequenceEnrollment.create({
    sequence: sequence._id,
    client: client._id,
    nextStepAt: new Date(Date.now() - 1000),
    enrolledBy: AGENT,
    ...overrides,
  }));

describe('firing due steps', () => {
  it('fires a step that is due', async () => {
    const sequence = await makeSequence();
    const client = await makeClient();
    await enroll(sequence, client);

    expect(await inTenant(() => runDueSequenceSteps())).toBe(1);

    const tasks = await inTenant(() => Task.find({}).lean());
    expect(tasks).toHaveLength(1);
  });

  it('resolves merge fields against the lead', async () => {
    const sequence = await makeSequence();
    const client = await makeClient({ name: 'Priya Sharma' });
    await enroll(sequence, client);

    await inTenant(() => runDueSequenceSteps());

    const [task] = await inTenant(() => Task.find({}).lean());
    expect(task.title).toBe('Call Priya');
  });

  it('does not fire a step that is not due yet', async () => {
    const sequence = await makeSequence();
    const client = await makeClient();
    await enroll(sequence, client, { nextStepAt: new Date(Date.now() + 86400000) });

    expect(await inTenant(() => runDueSequenceSteps())).toBe(0);
  });

  it('fires each step exactly once', async () => {
    // The job retries and may run on more than one instance.
    const sequence = await makeSequence();
    const client = await makeClient();
    await enroll(sequence, client);

    await inTenant(() => runDueSequenceSteps());
    await inTenant(() => runDueSequenceSteps());

    const tasks = await inTenant(() => Task.find({}).lean());
    expect(tasks).toHaveLength(1);
  });

  it('schedules the next step by its delay', async () => {
    const sequence = await makeSequence();
    const client = await makeClient();
    const enrollment = await enroll(sequence, client);

    const now = new Date();
    await inTenant(() => runDueSequenceSteps({ now }));

    const after = await inTenant(() => SequenceEnrollment.findById(enrollment._id).lean());
    expect(after.currentStep).toBe(1);
    // Step two has delayDays: 3.
    const days = Math.round((after.nextStepAt - now) / 86400000);
    expect(days).toBe(3);
  });

  it('completes the enrollment after the last step', async () => {
    const sequence = await makeSequence([{ action: 'reminder', delayDays: 0, subject: 'Only step' }]);
    const client = await makeClient();
    const enrollment = await enroll(sequence, client);

    await inTenant(() => runDueSequenceSteps());

    const after = await inTenant(() => SequenceEnrollment.findById(enrollment._id).lean());
    expect(after.status).toBe('completed');
  });

  it('records what happened in the history', async () => {
    const sequence = await makeSequence();
    const client = await makeClient();
    const enrollment = await enroll(sequence, client);

    await inTenant(() => runDueSequenceSteps());

    const after = await inTenant(() => SequenceEnrollment.findById(enrollment._id).lean());
    expect(after.history).toHaveLength(1);
    expect(after.history[0]).toMatchObject({ stepIndex: 0, action: 'task', outcome: 'task created' });
  });
});

describe('never chasing a closed lead', () => {
  it.each(['won', 'lost'])('stops when the lead is marked %s', async (status) => {
    const sequence = await makeSequence();
    const client = await makeClient({ status });
    const enrollment = await enroll(sequence, client);

    await inTenant(() => runDueSequenceSteps());

    const after = await inTenant(() => SequenceEnrollment.findById(enrollment._id).lean());
    expect(after.status).toBe('stopped');
    expect(after.stoppedReason).toContain(status);

    // And nothing was sent on the way out.
    expect(await inTenant(() => Task.countDocuments({}))).toBe(0);
  });

  it('stops when the lead is deleted', async () => {
    const sequence = await makeSequence();
    const client = await makeClient();
    await enroll(sequence, client);
    await inTenant(() => Client.updateOne({ _id: client._id }, { $set: { isDeleted: true } }));

    await inTenant(() => runDueSequenceSteps());

    const after = await inTenant(() => SequenceEnrollment.findOne({ client: client._id }).lean());
    expect(after.status).toBe('stopped');
  });

  it('stops when the sequence is paused', async () => {
    const sequence = await makeSequence();
    const client = await makeClient();
    await enroll(sequence, client);
    await inTenant(() => Sequence.updateOne({ _id: sequence._id }, { $set: { isActive: false } }));

    await inTenant(() => runDueSequenceSteps());

    const after = await inTenant(() => SequenceEnrollment.findOne({ client: client._id }).lean());
    expect(after.status).toBe('stopped');
    expect(after.stoppedReason).toBe('sequence paused');
  });

  it('stopSequencesForClient takes a lead off everything at once', async () => {
    const a = await makeSequence();
    const b = await inTenant(() => Sequence.create({
      name: 'Other', steps: [{ action: 'reminder', delayDays: 0 }],
    }));
    const client = await makeClient();
    await enroll(a, client);
    await enroll(b, client);

    expect(await inTenant(() => stopSequencesForClient(client._id, 'deal won'))).toBe(2);

    const remaining = await inTenant(() =>
      SequenceEnrollment.countDocuments({ client: client._id, status: 'active' })
    );
    expect(remaining).toBe(0);
  });
});

describe('resilience', () => {
  it('skips an email step when the lead has no address, without wedging', async () => {
    const sequence = await makeSequence([
      { action: 'email', delayDays: 0, subject: 'Hello', body: 'Hi {{firstName}}' },
      { action: 'reminder', delayDays: 1, subject: 'Next' },
    ]);
    const client = await makeClient({ email: '' });
    const enrollment = await enroll(sequence, client);

    await inTenant(() => runDueSequenceSteps());

    const after = await inTenant(() => SequenceEnrollment.findById(enrollment._id).lean());
    expect(after.history[0].outcome).toMatch(/no email address/);
    // It moved on rather than retrying the same step forever.
    expect(after.currentStep).toBe(1);
    expect(after.status).toBe('active');
  });

  it('does not run one workspace’s enrollments in another', async () => {
    const sequence = await makeSequence();
    const client = await makeClient();
    await enroll(sequence, client);

    const other = new mongoose.Types.ObjectId().toString();
    const fired = await runWithTenant({ tenantId: other }, () => runDueSequenceSteps());

    expect(fired).toBe(0);
  });
});

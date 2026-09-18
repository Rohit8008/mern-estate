/**
 * Lead scoring, temperature and duplicate detection.
 *
 * The score existed but was computed in exactly one place — when a
 * communication was logged — so a fresh lead with a stated budget and an urgent
 * priority read as 0, and a lead that went quiet six months ago kept whatever
 * it had earned when it was busy. Temperature did not exist at all, and nothing
 * stopped the same person being entered three times by three agents.
 */

import mongoose from 'mongoose';
import { registerTenancy } from '../tenancy/tenantPlugin.js';
import { runWithTenant } from '../tenancy/tenantContext.js';

let Client, rescoreLeads;

const TENANT = new mongoose.Types.ObjectId().toString();
const inTenant = (fn) => runWithTenant({ tenantId: TENANT }, fn);

beforeAll(async () => {
  registerTenancy(mongoose);
  ({ default: Client } = await import('../models/client.model.js'));
  ({ rescoreLeads } = await import('../jobs/leadScoring.js'));
});

beforeEach(async () => {
  await Client.collection.deleteMany({});
});

/** A lead document, scored, without going through the controller. */
const makeLead = (overrides = {}) => {
  const client = new Client({
    name: 'Test Lead',
    phone: '9876543210',
    assignedTo: new mongoose.Types.ObjectId(),
    createdBy: new mongoose.Types.ObjectId(),
    ...overrides,
  });
  client.calculateScore();
  return client;
};

describe('calculateScore', () => {
  it('scores a brand-new lead above zero when it has signal', () => {
    const lead = makeLead({ priority: 'urgent', budget: { min: 5000000, max: 9000000 } });
    expect(lead.score).toBeGreaterThan(0);
  });

  it('rates an urgent lead above a low-priority one', () => {
    const urgent = makeLead({ priority: 'urgent' });
    const low = makeLead({ priority: 'low' });
    expect(urgent.score).toBeGreaterThan(low.score);
  });

  it('rewards a stated budget', () => {
    const withBudget = makeLead({ budget: { min: 1000000, max: 5000000 } });
    const without = makeLead({});
    expect(withBudget.score).toBeGreaterThan(without.score);
  });

  it('never exceeds the schema cap', () => {
    const lead = makeLead({
      priority: 'urgent',
      budget: { min: 1, max: 99999999 },
      interestedListings: Array.from({ length: 50 }, () => new mongoose.Types.ObjectId()),
      communications: Array.from({ length: 50 }, () => ({
        type: 'call', summary: 'spoke', createdAt: new Date(),
      })),
      lastContactAt: new Date(),
    });
    expect(lead.score).toBeLessThanOrEqual(100);
    expect(lead.score).toBeGreaterThan(0);
  });

  it('is never negative', () => {
    expect(makeLead({ priority: 'low' }).score).toBeGreaterThanOrEqual(0);
  });
});

describe('recency', () => {
  it('scores a lead contacted today above one contacted a year ago', () => {
    const fresh = makeLead({ lastContactAt: new Date() });
    const stale = makeLead({ lastContactAt: new Date(Date.now() - 400 * 86400000) });

    expect(fresh.score).toBeGreaterThan(stale.score);
    expect(fresh.scoreFactors.recency).toBeGreaterThan(stale.scoreFactors.recency);
  });

  it('gives a long-silent lead no recency credit at all', () => {
    const stale = makeLead({ lastContactAt: new Date(Date.now() - 400 * 86400000) });
    expect(stale.scoreFactors.recency).toBe(0);
  });
});

describe('temperature', () => {
  it('follows the score', () => {
    const hot = makeLead({
      priority: 'urgent',
      budget: { min: 1, max: 9000000 },
      lastContactAt: new Date(),
      interestedListings: [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()],
      communications: [{ type: 'call', summary: 'spoke', createdAt: new Date() }],
    });
    expect(hot.temperature).toBe('hot');

    const cold = makeLead({ priority: 'low', lastContactAt: new Date(Date.now() - 400 * 86400000) });
    expect(cold.temperature).toBe('cold');
  });

  it('does not overwrite a temperature a person pinned', () => {
    // An agent who has spoken to someone knows better than the arithmetic.
    const lead = makeLead({ priority: 'low' });
    lead.temperature = 'hot';
    lead.temperatureManual = true;

    lead.calculateScore();

    expect(lead.temperature).toBe('hot');
  });

  it('resumes following the score once unpinned', () => {
    const lead = makeLead({ priority: 'low' });
    lead.temperature = 'hot';
    lead.temperatureManual = false;
    lead.calculateScore();
    expect(lead.temperature).not.toBe('hot');
  });
});

describe('rescoreLeads', () => {
  it('updates a lead whose score has drifted', async () => {
    const lead = makeLead({ priority: 'urgent', lastContactAt: new Date() });
    await inTenant(() => lead.save());

    // Force a stale stored score, as if the record had not been touched.
    await inTenant(() => Client.updateOne({ _id: lead._id }, { $set: { score: 0, temperature: 'cold' } }));

    const changed = await inTenant(() => rescoreLeads());
    expect(changed).toBe(1);

    const after = await inTenant(() => Client.findById(lead._id).lean());
    expect(after.score).toBeGreaterThan(0);
  });

  it('leaves won and lost leads alone, so past reports keep saying what they said', async () => {
    const won = makeLead({ status: 'won', priority: 'urgent' });
    await inTenant(() => won.save());
    await inTenant(() => Client.updateOne({ _id: won._id }, { $set: { score: 1 } }));

    await inTenant(() => rescoreLeads());

    const after = await inTenant(() => Client.findById(won._id).lean());
    expect(after.score).toBe(1);
  });

  it('does not touch another workspace’s leads', async () => {
    const other = new mongoose.Types.ObjectId().toString();
    const lead = makeLead({ priority: 'urgent' });
    await inTenant(() => lead.save());
    await inTenant(() => Client.updateOne({ _id: lead._id }, { $set: { score: 0 } }));

    const changed = await runWithTenant({ tenantId: other }, () => rescoreLeads());
    expect(changed).toBe(0);
  });
});

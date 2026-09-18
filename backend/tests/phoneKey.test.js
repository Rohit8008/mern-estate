/**
 * The derived phone key that duplicate detection matches on.
 *
 * Detection used a suffix regex — `{ phone: /9876543210$/ }` — which no index
 * can serve. In the importer that meant one collection scan per row inside a
 * single $or, so a 5,000-row portal export was a self-inflicted outage.
 *
 * The key is derived in a pre-save hook rather than set by callers, because a
 * stored value that can disagree with the field it came from is worse than no
 * stored value at all. These tests hold both halves: the derivation, and the
 * hook that keeps it in step.
 */

import mongoose from 'mongoose';
import { registerTenancy } from '../tenancy/tenantPlugin.js';
import { runWithTenant } from '../tenancy/tenantContext.js';

let Client, phoneKeyOf;

const TENANT = new mongoose.Types.ObjectId().toString();
const inTenant = (fn) => runWithTenant({ tenantId: TENANT }, fn);

beforeAll(async () => {
  registerTenancy(mongoose);
  ({ default: Client, phoneKeyOf } = await import('../models/client.model.js'));
});

beforeEach(async () => {
  await Client.collection.deleteMany({});
});

const makeClient = (phone) =>
  inTenant(() => Client.create({
    name: 'Test',
    phone,
    assignedTo: new mongoose.Types.ObjectId(),
    createdBy: new mongoose.Types.ObjectId(),
  }));

describe('phoneKeyOf', () => {
  it.each([
    ['+91 98765 43210', '9876543210'],
    ['098765 43210',    '9876543210'],
    ['98765-43210',     '9876543210'],
    ['(98765) 43210',   '9876543210'],
    ['919876543210',    '9876543210'],
    ['00919876543210',  '9876543210'],
  ])('%s → %s', (phone, expected) => {
    expect(phoneKeyOf(phone)).toBe(expected);
  });

  it('gives two different people different keys', () => {
    expect(phoneKeyOf('9876543210')).not.toBe(phoneKeyOf('9876543211'));
  });

  it('returns something harmless for junk rather than throwing', () => {
    expect(phoneKeyOf('')).toBe('');
    expect(phoneKeyOf(null)).toBe('');
    expect(phoneKeyOf('n/a')).toBe('');
  });
});

describe('the pre-save hook', () => {
  it('derives the key when a client is created', async () => {
    const client = await makeClient('+91 98765 43210');
    expect(client.phoneKey).toBe('9876543210');
  });

  it('keeps the key in step when the phone changes', async () => {
    const client = await makeClient('9876543210');
    client.phone = '98765 99999';
    await inTenant(() => client.save());
    expect(client.phoneKey).toBe('9876599999');
  });

  it('does not disturb the key when an unrelated field changes', async () => {
    const client = await makeClient('9876543210');
    client.name = 'Renamed';
    await inTenant(() => client.save());
    expect(client.phoneKey).toBe('9876543210');
  });
});

describe('the duplicate lookup it exists for', () => {
  it('finds the same person entered in a different format', async () => {
    await makeClient('+91 98765 43210');

    // What the importer and createClient both now run: one indexed lookup.
    const found = await inTenant(() =>
      Client.findOne({ phoneKey: phoneKeyOf('098765 43210'), isDeleted: { $ne: true } })
    );

    expect(found).not.toBeNull();
  });

  it('does not match a different number', async () => {
    await makeClient('9876543210');
    const found = await inTenant(() => Client.findOne({ phoneKey: phoneKeyOf('9876543299') }));
    expect(found).toBeNull();
  });

  it('matches a whole batch in one query, which is the point', async () => {
    await makeClient('9876500001');
    await makeClient('9876500002');
    await makeClient('9876500003');

    const keys = ['9876500001', '9876500003', '9876509999'].map(phoneKeyOf);
    const found = await inTenant(() => Client.find({ phoneKey: { $in: keys } }).lean());

    expect(found).toHaveLength(2);
  });

  it('does not reach across workspaces', async () => {
    await makeClient('9876543210');
    const other = new mongoose.Types.ObjectId().toString();

    const found = await runWithTenant({ tenantId: other }, () =>
      Client.findOne({ phoneKey: '9876543210' })
    );

    expect(found).toBeNull();
  });
});

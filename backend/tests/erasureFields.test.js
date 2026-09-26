/**
 * Erasure clears fields that exist.
 *
 * Mongoose drops a $set key the schema does not know, silently. Erasure named
 * `altPhone` (the field is `alternatePhone`), `address` (owners have
 * `addressLine1`/`addressLine2`), and cleared four of a user's fifteen personal
 * fields — so "erased" contacts kept their address, PAN and second phone, and
 * no test or error ever said so. These tests fail on a name that is not a path.
 */

import mongoose from 'mongoose';
import { registerTenancy } from '../tenancy/tenantPlugin.js';
import { runWithTenant } from '../tenancy/tenantContext.js';

let User, ERASABLE_CONTACTS, erasedUserFields;

beforeAll(async () => {
  registerTenancy(mongoose);
  ({ default: User } = await import('../models/user.model.js'));
  ({ ERASABLE_CONTACTS, erasedUserFields } = await import('../controllers/dataRights.controller.js'));
});

const unknownPaths = (Model, fields) => Object.keys(fields).filter((key) => !Model.schema.path(key));

describe('erasure field names', () => {
  it('names only real User paths', () => {
    expect(unknownPaths(User, erasedUserFields('0123456789abcdef01234567'))).toEqual([]);
  });

  it('clears every personal field on the User model', () => {
    const cleared = Object.keys(erasedUserFields('0123456789abcdef01234567'));
    for (const field of ['email', 'phone', 'firstName', 'lastName', 'addressLine1', 'addressLine2', 'postalCode', 'bio']) {
      expect(cleared).toContain(field);
    }
  });

  it.each(['client', 'owner', 'buyer'])('names only real %s paths', (kind) => {
    const { Model, fields } = ERASABLE_CONTACTS[kind];
    expect(unknownPaths(Model, fields)).toEqual([]);
  });

  it('clears an owner\'s tax id and address', () => {
    const { fields } = ERASABLE_CONTACTS.owner;
    expect(Object.keys(fields)).toEqual(expect.arrayContaining(['taxId', 'addressLine1', 'addressLine2', 'postalCode']));
  });
});

describe('erasing more than one person in a workspace', () => {
  // username and email are unique per workspace, and phone has a partial
  // unique index on strings. Erasure used a constant username and '' for the
  // phone, so the second erasure in a workspace failed with E11000 and left
  // that person's data exactly where it was.
  const TENANT = new mongoose.Types.ObjectId().toString();
  const inTenant = (fn) => runWithTenant({ tenantId: TENANT }, fn);

  beforeEach(async () => {
    await User.collection.deleteMany({});
    await User.syncIndexes();
  });

  it('erases two, then three, team members without a duplicate-key error', async () => {
    const people = await inTenant(() => User.create([
      { username: 'asha', email: 'asha@example.com', phone: '+919876543210', password: 'Passw0rd!x' },
      { username: 'ravi', email: 'ravi@example.com', phone: '+919876543211', password: 'Passw0rd!x' },
      { username: 'meena', email: 'meena@example.com', phone: '+919876543212', password: 'Passw0rd!x' },
    ]));

    for (const person of people) {
      await inTenant(() => User.updateOne({ _id: person._id }, { $set: erasedUserFields(person._id) }));
    }

    const after = await inTenant(() => User.find({}).lean());
    expect(after.map((u) => u.email).sort()).toEqual(
      people.map((p) => `redacted-${p._id}@removed.invalid`).sort()
    );
    expect(after.every((u) => u.phone === null)).toBe(true);
  });
});

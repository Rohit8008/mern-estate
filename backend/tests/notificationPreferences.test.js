/**
 * Saving notification preferences.
 *
 * `preferences.notifications` was a Mongoose Map. Every key in the catalogue
 * is dotted — 'lead.assigned', 'deal.stage_changed', 'task.due' — and Mongoose
 * refuses dotted keys in a Map, so writing this field threw
 * "Mongoose maps do not support keys that contain ." and the endpoint answered
 * 500. Every attempt to change a notification preference failed, on web and on
 * mobile, for every user.
 *
 * What made it survive is that the read path never depended on the write: it
 * falls back to the catalogue's defaults for anything absent, so the settings
 * screen rendered perfectly and simply forgot whatever you chose. A test that
 * only read preferences would have passed throughout.
 *
 * So these tests write first, then read back through a fresh query — the round
 * trip is the only thing that would have caught it.
 */

import mongoose from 'mongoose';
import { registerTenancy } from '../tenancy/tenantPlugin.js';
import { runWithTenant } from '../tenancy/tenantContext.js';
import { NOTIFICATION_TYPE_KEYS } from '../utils/notificationTypes.js';

let User;

const TENANT = new mongoose.Types.ObjectId().toString();
const inTenant = (fn) => runWithTenant({ tenantId: TENANT }, fn);

beforeAll(async () => {
  registerTenancy(mongoose);
  ({ default: User } = await import('../models/user.model.js'));
});

beforeEach(async () => {
  await User.collection.deleteMany({});
});

const makeUser = () =>
  inTenant(() =>
    User.create({
      username: `u${Date.now()}${Math.floor(Math.random() * 1000)}`,
      email: `u${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`,
      password: 'hashed-password-placeholder',
    })
  );

describe('notification preferences survive a write', () => {
  it('stores a dotted catalogue key — the exact shape that used to throw', async () => {
    const user = await makeUser();

    await inTenant(() =>
      User.updateOne(
        { _id: user._id },
        { $set: { 'preferences.notifications': { 'lead.assigned': { inApp: true, email: false } } } }
      )
    );

    const reloaded = await inTenant(() => User.findById(user._id).select('preferences').lean());
    expect(reloaded.preferences.notifications['lead.assigned']).toEqual({ inApp: true, email: false });
  });

  it('stores every key the catalogue defines, not just the one we happened to try', async () => {
    const user = await makeUser();

    // If any single key is unwritable the whole $set throws, so this asserts
    // the catalogue as a whole rather than a sample of it.
    const all = Object.fromEntries(
      NOTIFICATION_TYPE_KEYS.map((key) => [key, { inApp: false, email: true }])
    );

    await inTenant(() =>
      User.updateOne({ _id: user._id }, { $set: { 'preferences.notifications': all } })
    );

    const reloaded = await inTenant(() => User.findById(user._id).select('preferences').lean());
    for (const key of NOTIFICATION_TYPE_KEYS) {
      expect(reloaded.preferences.notifications[key]).toEqual({ inApp: false, email: true });
    }
  });

  it('a later write replaces the earlier one rather than merging into it', async () => {
    const user = await makeUser();

    await inTenant(() =>
      User.updateOne(
        { _id: user._id },
        { $set: { 'preferences.notifications': { 'lead.assigned': { inApp: true, email: true } } } }
      )
    );
    await inTenant(() =>
      User.updateOne(
        { _id: user._id },
        { $set: { 'preferences.notifications': { 'task.due': { inApp: false, email: false } } } }
      )
    );

    const reloaded = await inTenant(() => User.findById(user._id).select('preferences').lean());
    expect(reloaded.preferences.notifications['task.due']).toEqual({ inApp: false, email: false });
    expect(reloaded.preferences.notifications['lead.assigned']).toBeUndefined();
  });

  it('keeps privacy flags writable alongside — they shared the failed update', async () => {
    const user = await makeUser();

    await inTenant(() =>
      User.updateOne(
        { _id: user._id },
        {
          $set: {
            'preferences.notifications': { 'lead.assigned': { inApp: true, email: false } },
            'preferences.privacy.showEmail': true,
          },
        }
      )
    );

    const reloaded = await inTenant(() => User.findById(user._id).select('preferences').lean());
    expect(reloaded.preferences.privacy.showEmail).toBe(true);
  });
});

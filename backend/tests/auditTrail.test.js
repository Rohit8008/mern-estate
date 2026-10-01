/**
 * The workspace audit trail: its filters, and the dropdown lists it returns.
 *
 * Two bugs this holds shut. `until` went straight into `new Date('YYYY-MM-DD')`
 * — midnight UTC at the START of the day — so filtering "to today" hid
 * everything logged today; and a malformed date or user id reached Mongo and
 * came back as a 500. The actions/actors lists are new, and because they are
 * read with `distinct` they are checked here for staying inside one workspace.
 */

import mongoose from 'mongoose';
import { registerTenancy } from '../tenancy/tenantPlugin.js';
import { runWithTenant } from '../tenancy/tenantContext.js';

let User, ActivityLog, buildTrailFilter, searchActivity;

beforeAll(async () => {
  registerTenancy(mongoose);
  ({ default: User } = await import('../models/user.model.js'));
  ({ default: ActivityLog } = await import('../models/activityLog.model.js'));
  ({ buildTrailFilter, searchActivity } = await import('../controllers/activity.controller.js'));
});

describe('buildTrailFilter', () => {
  it('treats dates as whole days in the workspace timezone, end date included', () => {
    const f = buildTrailFilter({ since: '2026-09-23', until: '2026-09-23' }, 'Asia/Kolkata');
    expect(f.createdAt.$gte.toISOString()).toBe('2026-09-22T18:30:00.000Z');
    expect(f.createdAt.$lt.toISOString()).toBe('2026-09-23T18:30:00.000Z');
    // 14:00 IST on the end date is inside the range.
    const at = new Date('2026-09-23T08:30:00.000Z');
    expect(at >= f.createdAt.$gte && at < f.createdAt.$lt).toBe(true);
  });

  it('still accepts a full timestamp as an exact bound', () => {
    const f = buildTrailFilter({ until: '2026-09-23T10:00:00.000Z' });
    expect(f.createdAt.$lte.toISOString()).toBe('2026-09-23T10:00:00.000Z');
  });

  it('ignores a malformed date or user id instead of failing the query', () => {
    const f = buildTrailFilter({ since: 'yesterday', until: 'soon', userId: 'nope' });
    expect(f.createdAt).toBeUndefined();
    expect(f.createdBy).toBeUndefined();
  });

  it('ignores an entity type the log does not record', () => {
    expect(buildTrailFilter({ entityType: 'passwordResetToken' }).entityType).toBeUndefined();
    expect(buildTrailFilter({ entityType: 'client' }).entityType).toBe('client');
  });

  it('escapes the search text', () => {
    const f = buildTrailFilter({ q: 'a.b(' });
    expect(f.$or[0].message.$regex).toBe('a\\.b\\(');
  });
});

describe('searchActivity', () => {
  const ACME = new mongoose.Types.ObjectId().toString();
  const BETA = new mongoose.Types.ObjectId().toString();
  const inAcme = (fn) => runWithTenant({ tenantId: ACME }, fn);
  const inBeta = (fn) => runWithTenant({ tenantId: BETA }, fn);

  const call = (query) => new Promise((resolve, reject) => {
    const req = { query, user: { id: 'x', role: 'admin' }, tenant: { locale: { timezone: 'Asia/Kolkata' } } };
    const res = { json: resolve };
    inAcme(() => searchActivity(req, res, reject));
  });

  it('lists only this workspace\'s actions and actors for the filters', async () => {
    const [asha] = await inAcme(() => User.create([{ username: 'asha', email: 'asha@acme.test', password: 'Passw0rd!x' }]));
    const [bob] = await inBeta(() => User.create([{ username: 'bob', email: 'bob@beta.test', password: 'Passw0rd!x' }]));
    const entityId = new mongoose.Types.ObjectId();

    await inAcme(() => ActivityLog.create([
      { entityType: 'client', entityId, action: 'client.created', createdBy: asha._id },
      { entityType: 'client', entityId, action: 'client.updated', createdBy: asha._id },
    ]));
    await inBeta(() => ActivityLog.create([
      { entityType: 'task', entityId, action: 'task.deleted', createdBy: bob._id },
    ]));

    const body = await call({});
    expect(body.data.total).toBe(2);
    expect(body.data.actions).toEqual(['client.created', 'client.updated']);
    expect(body.data.actors.map((a) => a.username)).toEqual(['asha']);
  });

  it('keeps the dropdown lists whole while a filter narrows the rows', async () => {
    const [asha] = await inAcme(() => User.create([{ username: 'asha', email: 'asha@acme.test', password: 'Passw0rd!x' }]));
    const entityId = new mongoose.Types.ObjectId();
    await inAcme(() => ActivityLog.create([
      { entityType: 'client', entityId, action: 'client.created', createdBy: asha._id },
      { entityType: 'task', entityId, action: 'task.created', createdBy: asha._id },
    ]));

    const body = await call({ action: 'task.created' });
    expect(body.data.total).toBe(1);
    expect(body.data.actions).toEqual(['client.created', 'task.created']);
  });
});

/**
 * Planning a week of tasks: filter by due date, by assignee, and hand tasks to
 * other people. Dates are stored as the picked day at 00:00 UTC (the form sends
 * `YYYY-MM-DD`), so a date-only range has to include its last whole day.
 */

import mongoose from 'mongoose';
import { registerTenancy } from '../tenancy/tenantPlugin.js';
import { runWithTenant } from '../tenancy/tenantContext.js';

let Task, User, listTasks, createTask, updateTask;

const TENANT = new mongoose.Types.ObjectId().toString();
const inTenant = (fn) => runWithTenant({ tenantId: TENANT }, fn);
const ADMIN = { id: new mongoose.Types.ObjectId().toString(), role: 'admin' };
let emp;

beforeAll(async () => {
  registerTenancy(mongoose);
  ({ default: Task } = await import('../models/task.model.js'));
  ({ default: User } = await import('../models/user.model.js'));
  ({ listTasks, createTask, updateTask } = await import('../controllers/task.controller.js'));
});

beforeEach(async () => {
  await Task.collection.deleteMany({});
  await User.collection.deleteMany({});
  await inTenant(async () => {
    emp = await User.create({ username: 'emp1', email: 'emp1@example.com', password: 'Password123!', role: 'employee' });
  });
});

async function call(handler, req) {
  let out; let error;
  const res = { status: () => res, json: (v) => { out = v; return res; } };
  await handler({ query: {}, params: {}, body: {}, ...req }, res, (e) => { error = e; });
  if (error) throw error;
  return out;
}

const task = (title, dueAt, extra = {}) =>
  Task.create({ title, dueAt, assignedTo: ADMIN.id, createdBy: ADMIN.id, ...extra });

describe('task date filters', () => {
  it('includes the whole last day of a date-only range', () =>
    inTenant(async () => {
      await task('before', '2026-10-04T00:00:00.000Z');
      await task('first', '2026-10-05T00:00:00.000Z');
      await task('last', '2026-10-11T00:00:00.000Z');
      await task('after', '2026-10-12T00:00:00.000Z');
      const out = await call(listTasks, { user: ADMIN, query: { dueFrom: '2026-10-05', dueTo: '2026-10-11' } });
      expect(out.data.map((t) => t.title).sort()).toEqual(['first', 'last']);
    }));

  it('finds tasks with no date, and overdue ones that are not finished', () =>
    inTenant(async () => {
      await task('undated', null);
      await task('late', '2020-01-01T00:00:00.000Z');
      await task('late but done', '2020-01-01T00:00:00.000Z', { status: 'done' });
      await task('future', '2999-01-01T00:00:00.000Z');
      const none = await call(listTasks, { user: ADMIN, query: { due: 'none' } });
      expect(none.data.map((t) => t.title)).toEqual(['undated']);
      const late = await call(listTasks, { user: ADMIN, query: { due: 'overdue' } });
      expect(late.data.map((t) => t.title)).toEqual(['late']);
    }));

  it('answers a malformed date with a validation error, not a crash', () =>
    inTenant(async () => {
      await expect(call(listTasks, { user: ADMIN, query: { dueFrom: 'not-a-date' } })).rejects.toThrow(/valid date/);
    }));
});

describe('assigning tasks', () => {
  it('lets an admin filter by assignee and names who has each task', () =>
    inTenant(async () => {
      await task('mine', null);
      await task('theirs', null, { assignedTo: emp._id });
      const out = await call(listTasks, { user: ADMIN, query: { assignedTo: String(emp._id) } });
      expect(out.data).toHaveLength(1);
      expect(out.data[0].title).toBe('theirs');
      expect(out.data[0].assigneeName).toBe('emp1');
    }));

  it('keeps an employee to their own tasks whatever they ask for', () =>
    inTenant(async () => {
      await task('mine', null);
      await task('theirs', null, { assignedTo: emp._id });
      const out = await call(listTasks, {
        user: { id: String(emp._id), role: 'employee' },
        query: { assignedTo: ADMIN.id },
      });
      expect(out.data.map((t) => t.title)).toEqual(['theirs']);
    }));

  it('lets an admin create a task for an employee, and refuses someone who is not a person here', () =>
    inTenant(async () => {
      const made = await call(createTask, { user: ADMIN, body: { title: 'Call the buyer', assignedTo: String(emp._id) } });
      expect(String(made.data?.assignedTo ?? made.assignedTo)).toBe(String(emp._id));
      await expect(
        call(createTask, { user: ADMIN, body: { title: 'x', assignedTo: String(new mongoose.Types.ObjectId()) } })
      ).rejects.toThrow(/cannot be assigned/);
    }));

  it('reassigns through update, for admins only', () =>
    inTenant(async () => {
      const t = await task('move me', null);
      await call(updateTask, { user: ADMIN, params: { id: String(t._id) }, body: { assignedTo: String(emp._id) } });
      expect(String((await Task.findById(t._id)).assignedTo)).toBe(String(emp._id));
    }));
});

/**
 * Regression tests for the docs-audit fixes: places where the code did less
 * than the product (or its own documentation) promised.
 *
 * Each describe block names the promise it holds the code to.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { runWithTenant } from '../tenancy/tenantContext.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

const TENANT = new mongoose.Types.ObjectId();
const USER = new mongoose.Types.ObjectId();

/** A workspace record as the request pipeline would attach it. */
const workspace = (extra = {}) => ({
  _id: TENANT,
  slug: 'acme',
  plan: 'starter',
  limits: { maxListings: 1000 },
  workflow: {},
  ...extra,
});

const inWorkspace = (tenant, fn) => runWithTenant({ tenantId: String(TENANT), tenant }, fn);

/**
 * Run a handler and resolve with what it answered. Resolves on res.json,
 * rejects on next(err) - asyncHandler swallows its own promise, so awaiting
 * the handler directly proves nothing.
 */
function call(handler, { tenant = workspace(), user, body = {}, params = {}, query = {} } = {}) {
  const req = {
    user,
    body,
    params,
    query,
    tenantId: String(TENANT),
    ip: '127.0.0.1',
    originalUrl: '/test',
    get: () => undefined,
  };
  return inWorkspace(
    tenant,
    () =>
      new Promise((resolve, reject) => {
        const res = {
          statusCode: 200,
          status(code) { this.statusCode = code; return this; },
          set() { return this; },
          json(payload) { resolve({ ...payload, __status: this.statusCode }); return this; },
        };
        Promise.resolve(handler(req, res, (err) => (err ? reject(err) : resolve(undefined)))).catch(reject);
      })
  );
}

const waitFor = async (fn, ms = 2000) => {
  const start = Date.now();
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() - start > ms) return value;
    await new Promise((r) => setTimeout(r, 25));
  }
};

const admin = { id: String(USER), role: 'admin' };

// ─── 1. every webhook event is emitted somewhere ──────────────────────────────

describe('webhook events', () => {
  it('has an emitEvent call site for every event in the catalogue', async () => {
    const { WEBHOOK_EVENT_NAMES } = await import('../models/webhook.model.js');

    const dirs = ['controllers', 'jobs', 'utils', 'tenancy'];
    const source = dirs
      .flatMap((d) => fs.readdirSync(path.join(root, d)).map((f) => path.join(root, d, f)))
      .filter((f) => f.endsWith('.js'))
      .map((f) => fs.readFileSync(f, 'utf8'))
      .join('\n');

    const missing = WEBHOOK_EVENT_NAMES.filter(
      (name) => !new RegExp(`emitEvent\\(\\s*'${name.replace('.', '\\.')}'`).test(source)
    );
    expect(missing).toEqual([]);
  });

  it('queues task.created and task.completed for a subscribed workspace', async () => {
    const { default: Webhook } = await import('../models/webhook.model.js');
    const { default: WebhookDelivery } = await import('../models/webhookDelivery.model.js');
    const { createTask, updateTask } = await import('../controllers/task.controller.js');

    await inWorkspace(workspace(), () =>
      Webhook.create({
        name: 'all tasks',
        url: 'https://example.com/hook',
        events: ['task.created', 'task.completed'],
        secret: 'whsec_x',
      })
    );

    const created = await call(createTask, { user: admin, body: { title: 'Call the owner' } });
    const taskId = created.data._id;

    const events = () =>
      inWorkspace(workspace(), () => WebhookDelivery.find({}).lean()).then((rows) => rows.map((r) => r.event));

    expect(await waitFor(async () => (await events()).includes('task.created') && true)).toBe(true);

    await call(updateTask, { user: admin, params: { id: taskId }, body: { status: 'done' } });
    expect(await waitFor(async () => (await events()).includes('task.completed') && true)).toBe(true);

    // Payloads carry identifiers and titles, not the description or reminders.
    const rows = await inWorkspace(workspace(), () => WebhookDelivery.find({ event: 'task.created' }).lean());
    expect(Object.keys(rows[0].payload.data)).not.toContain('description');
  });
});

// ─── 2. rule hooks ────────────────────────────────────────────────────────────

describe('listing.beforeImport', () => {
  it('skips rows the skipRowsWithoutPrice rule rejects, and says why', async () => {
    const { registerBuiltinRules } = await import('../plugins/builtin.js');
    const { resetRules } = await import('../plugins/registry.js');
    const { default: Category } = await import('../models/category.model.js');
    const { default: Listing } = await import('../models/listing.model.js');
    const { commitImport } = await import('../controllers/listingImport.controller.js');
    resetRules();
    registerBuiltinRules();

    const tenant = workspace({
      workflow: {
        rules: [{ hook: 'listing.beforeImport', implementation: 'skipRowsWithoutPrice', enabled: true }],
      },
    });
    await inWorkspace(tenant, () => Category.create({ name: 'Plots', slug: 'plots', fields: [] }));

    const mapping = [
      { column: 0, target: 'core', key: 'name' },
      { column: 1, target: 'core', key: 'city' },
      { column: 2, target: 'core', key: 'regularPrice' },
    ];
    const result = await call(commitImport, {
      tenant,
      user: admin,
      body: {
        category: 'plots',
        mapping,
        rows: [
          ['Priced plot', 'Bathinda', '2500000'],
          ['Free plot', 'Bathinda', ''],
        ],
      },
    });

    const outcomes = result.data.rows || result.data.outcomes || [];
    const skipped = outcomes.find((o) => o.name === 'Free plot');
    expect(skipped.outcome).toBe('skipped');
    expect(skipped.reason).toBe('no price');

    const names = (await inWorkspace(tenant, () => Listing.find({}).lean())).map((l) => l.name);
    expect(names).toEqual(['Priced plot']);
    resetRules();
  });
});

describe('listing.beforeSave on update', () => {
  it('lets a veto rule refuse an edit with a 400', async () => {
    const { registerBuiltinRules } = await import('../plugins/builtin.js');
    const { resetRules } = await import('../plugins/registry.js');
    const { default: Listing } = await import('../models/listing.model.js');
    const { updateListing } = await import('../controllers/listing.controller.js');
    resetRules();
    registerBuiltinRules();

    const tenant = workspace({
      workflow: {
        rules: [{ hook: 'listing.beforeSave', implementation: 'requirePriceOnPublish', enabled: true }],
      },
    });
    const listing = await inWorkspace(tenant, () =>
      Listing.create({ name: 'Draft', address: 'x', userRef: USER, status: 'sold', regularPrice: 0 })
    );

    // Publishing a priceless property is exactly what the rule forbids. It is
    // judged on the stored record plus the edit, not on the fields sent.
    const err = await call(updateListing, {
      tenant,
      user: admin,
      params: { id: String(listing._id) },
      body: { status: 'available' },
    }).catch((e) => e);

    expect(err.statusCode).toBe(400);
    expect(err.message).toMatch(/price/i);
    resetRules();
  });
});

// ─── 3. defaults ──────────────────────────────────────────────────────────────

describe('tenant schema defaults', () => {
  it('defaults the brand colour to the product petrol blue, not stock indigo', async () => {
    const { default: Tenant } = await import('../models/tenant.model.js');
    const t = new Tenant({ name: 'X', slug: 'x-defaults' });
    expect(t.branding.tokens.brand).toBe('#2b6faa');
  });

  it('derives limit defaults from the default plan', async () => {
    const { default: Tenant } = await import('../models/tenant.model.js');
    const { PLANS } = await import('../tenancy/plans.js');
    const t = new Tenant({ name: 'X', slug: 'x-limits' });
    expect(t.plan).toBe('trial');
    expect(t.limits.toObject()).toEqual(PLANS.trial.limits);
  });

  it('does not overwrite a stored limit', async () => {
    const { default: Tenant } = await import('../models/tenant.model.js');
    const t = new Tenant({ name: 'X', slug: 'x-stored', limits: { maxUsers: 77 } });
    expect(t.limits.maxUsers).toBe(77);
  });
});

// ─── 4. restoring a listing counts against the plan ───────────────────────────

describe('restoreListing', () => {
  it('refuses with 402 when the plan is already full', async () => {
    const { default: Listing } = await import('../models/listing.model.js');
    const { restoreListing } = await import('../controllers/listing.controller.js');

    const tenant = workspace({ limits: { maxListings: 1 } });
    const [, deleted] = await inWorkspace(tenant, async () => [
      await Listing.create({ name: 'Live', address: 'a', userRef: USER }),
      await Listing.create({ name: 'Binned', address: 'b', userRef: USER, isDeleted: true }),
    ]);

    const err = await call(restoreListing, {
      tenant,
      user: admin,
      params: { id: String(deleted._id) },
    }).catch((e) => e);

    expect(err.statusCode).toBe(402);
    const still = await inWorkspace(tenant, () => Listing.findById(deleted._id).lean());
    expect(still.isDeleted).toBe(true);
  });

  it('restores when there is room', async () => {
    const { default: Listing } = await import('../models/listing.model.js');
    const { restoreListing } = await import('../controllers/listing.controller.js');

    const deleted = await inWorkspace(workspace(), () =>
      Listing.create({ name: 'Binned', address: 'b', userRef: USER, isDeleted: true })
    );
    const res = await call(restoreListing, { user: admin, params: { id: String(deleted._id) } });
    expect(res.success).toBe(true);
  });
});

// ─── 5. the vestigial import-usage-reset job is gone ──────────────────────────

describe('scheduled jobs', () => {
  it('no longer registers import-usage-reset', async () => {
    const { registerAllJobs } = await import('../jobs/index.js');
    const { registeredJobs, resetJobs } = await import('../jobs/scheduler.js');
    resetJobs();
    registerAllJobs();
    const names = registeredJobs().map((j) => j.name || j);
    expect(names).not.toContain('import-usage-reset');
    expect(names).toContain('lead-rescore');
    resetJobs();
  });
});

// ─── 6. leads ─────────────────────────────────────────────────────────────────

describe('lead rescoring', () => {
  const makeLead = async (Client, i, extra = {}) =>
    Client.collection.insertOne({
      tenantId: TENANT,
      name: `Lead ${i}`,
      phone: `98765432${String(i).padStart(2, '0')}`,
      assignedTo: USER,
      createdBy: USER,
      status: 'lead',
      score: 99,
      temperature: 'hot',
      isDeleted: false,
      createdAt: new Date(Date.now() - 200 * 86400000),
      updatedAt: new Date(Date.now() - 200 * 86400000),
      ...extra,
    });

  it('walks past the first batch and leaves updatedAt alone', async () => {
    const { default: Client } = await import('../models/client.model.js');
    const { rescoreLeads } = await import('../jobs/leadScoring.js');

    for (let i = 0; i < 5; i += 1) await makeLead(Client, i);
    const before = (await Client.collection.findOne({ name: 'Lead 0' })).updatedAt;

    const changed = await inWorkspace(workspace(), () => rescoreLeads({ batchSize: 2 }));
    expect(changed).toBe(5); // all of them, not just the first two

    const rows = await Client.collection.find({}).toArray();
    expect(rows.every((r) => r.score !== 99)).toBe(true);
    // A rescore is not a touch: bumping updatedAt would reset the recency decay.
    expect(rows.find((r) => r.name === 'Lead 0').updatedAt.getTime()).toBe(before.getTime());
  });
});

describe('temperature back to automatic', () => {
  it('accepts temperature "auto" and clears the manual pin', async () => {
    const { default: Client } = await import('../models/client.model.js');
    const { updateClient } = await import('../controllers/client.controller.js');
    const { clientValidation } = await import('../middleware/validation.js');

    expect(clientValidation.update.validate({ temperature: 'auto' }).error).toBeUndefined();

    const lead = await inWorkspace(workspace(), async () => {
      const c = new Client({
        name: 'Pinned Lead',
        phone: '9876500001',
        assignedTo: USER,
        createdBy: USER,
        temperature: 'hot',
        temperatureManual: true,
      });
      c.calculateScore();
      return c.save();
    });
    expect(lead.temperature).toBe('hot');

    const res = await call(updateClient, { user: admin, params: { id: String(lead._id) }, body: { temperature: 'auto' } });
    expect(res.data.temperatureManual).toBe(false);
    // Following the score again: whatever it says, no longer the pinned 'hot'.
    const s = res.data.score;
    expect(res.data.temperature).toBe(s >= 60 ? 'hot' : s >= 30 ? 'warm' : 'cold');
    expect(res.data.temperature).not.toBe('hot');
  });
});

describe('deal stages follow the workspace pipeline', () => {
  it('refuses a stage the workspace has switched off', async () => {
    const { default: Client } = await import('../models/client.model.js');
    const { addDeal } = await import('../controllers/crm.controller.js');

    const lead = await inWorkspace(workspace(), () =>
      Client.create({ name: 'Deal Lead', phone: '9876500002', assignedTo: USER, createdBy: USER })
    );

    // A pipeline of three stages: 'negotiation' is a catalogue stage but not theirs.
    const tenant = workspace({
      workflow: {
        dealStages: [
          { key: 'new_lead', label: 'New', order: 10 },
          { key: 'closed_won', label: 'Won', order: 20 },
          { key: 'closed_lost', label: 'Lost', order: 30 },
        ],
      },
    });

    const err = await call(addDeal, {
      tenant,
      user: admin,
      params: { id: String(lead._id) },
      body: { stage: 'negotiation', value: 100 },
    }).catch((e) => e);
    expect(err.statusCode).toBe(400);

    const ok = await call(addDeal, {
      tenant,
      user: admin,
      params: { id: String(lead._id) },
      body: { stage: 'new_lead', value: 100 },
    });
    expect(ok.success).toBe(true);
  });
});

describe('duplicate lead 409', () => {
  it('puts the existing lead in details so the UI can offer "Create anyway"', async () => {
    const { default: Client } = await import('../models/client.model.js');
    const { createClient } = await import('../controllers/client.controller.js');

    await inWorkspace(workspace(), () =>
      Client.create({ name: 'Already Here', phone: '9876500003', assignedTo: USER, createdBy: USER })
    );

    const res = await call(createClient, {
      user: admin,
      body: { name: 'Same Person', phone: '9876500003' },
    });
    expect(res.__status).toBe(409);
    expect(res.details.duplicate.name).toBe('Already Here');
    expect(res.details.canForce).toBe(true);
  });
});

describe('deleting a lead stops its sequences', () => {
  it('stops active enrollments before answering', async () => {
    const { default: Client } = await import('../models/client.model.js');
    const { default: Sequence } = await import('../models/sequence.model.js');
    const { default: SequenceEnrollment } = await import('../models/sequenceEnrollment.model.js');
    const { deleteClient } = await import('../controllers/client.controller.js');

    const { lead, enrollment } = await inWorkspace(workspace(), async () => {
      const sequence = await Sequence.create({
        name: 'Nurture',
        steps: [{ action: 'task', delayDays: 0, subject: 'Call' }],
      });
      const c = await Client.create({ name: 'Leaving', phone: '9876500004', assignedTo: USER, createdBy: USER });
      const e = await SequenceEnrollment.create({ sequence: sequence._id, client: c._id, status: 'active' });
      return { lead: c, enrollment: e };
    });

    await call(deleteClient, { user: admin, params: { id: String(lead._id) } });

    const after = await inWorkspace(workspace(), () => SequenceEnrollment.findById(enrollment._id).lean());
    expect(after.status).toBe('stopped');
    expect(after.stoppedReason).toBe('lead deleted');
  });
});

// ─── 7. sharing ───────────────────────────────────────────────────────────────

describe('createShare', () => {
  it.each(['buyer', 'seller'])('refuses a %s account', async (role) => {
    const { createShare } = await import('../controllers/share.controller.js');
    const err = await call(createShare, {
      user: { id: String(USER), role },
      body: { listingIds: [String(new mongoose.Types.ObjectId())] },
    }).catch((e) => e);
    expect(err.statusCode).toBe(403);
  });
});

// ─── 8. category names ────────────────────────────────────────────────────────

describe('category name length', () => {
  it('lets create and rename use the model\'s full 100 characters', async () => {
    const { categoryValidation, CATEGORY_NAME_MAX } = await import('../middleware/validation.js');
    const { default: Category } = await import('../models/category.model.js');

    expect(CATEGORY_NAME_MAX).toBe(Category.schema.path('name').options.maxlength);

    const name = 'a'.repeat(100);
    expect(categoryValidation.rename.validate({ name }).error).toBeUndefined();
    expect(categoryValidation.rename.validate({ name: `${name}b` }).error).toBeDefined();
    expect(categoryValidation.create.validate({ name }).error).toBeUndefined();
  });
});

// ─── 9. default roles are defined once ────────────────────────────────────────

describe('default roles', () => {
  it('are one list shared by the model and the seed script', async () => {
    const { DEFAULT_ROLES } = await import('../utils/defaultRoles.js');
    const { default: Role } = await import('../models/role.model.js');
    const seed = fs.readFileSync(path.join(root, 'scripts/seedRoles.js'), 'utf8');

    expect(DEFAULT_ROLES).toHaveLength(5);
    expect(Role.getDefaultRoles().map((r) => r.name)).toEqual(DEFAULT_ROLES.map((r) => r.name));
    expect(seed).toContain("from '../utils/defaultRoles.js'");
  });

  it('only grant permissions that exist', async () => {
    const { DEFAULT_ROLES } = await import('../utils/defaultRoles.js');
    const { PERMISSION_KEYS } = await import('../utils/permissionCatalogue.js');
    DEFAULT_ROLES.forEach((role) => {
      Object.keys(role.permissions).forEach((key) => expect(PERMISSION_KEYS).toContain(key));
    });
  });

  it('are created idempotently by initializeDefaultRoles', async () => {
    const { default: Role } = await import('../models/role.model.js');
    const { initializeDefaultRoles } = await import('../controllers/role.controller.js');

    const first = await call(initializeDefaultRoles, { user: admin });
    const second = await call(initializeDefaultRoles, { user: admin });

    expect(first.data.createdRoles).toBe(5);
    expect(second.data.createdRoles).toBe(0);
    expect(await inWorkspace(workspace(), () => Role.countDocuments({}))).toBe(5);
  });
});

// ─── 10. audit log has a menu entry ───────────────────────────────────────────

describe('audit log screen', () => {
  it('is in the catalogue, for admins with viewLogs', async () => {
    const { getScreen } = await import('../tenancy/screenCatalogue.js');
    const screen = getScreen('auditLog');
    expect(screen).toMatchObject({ section: 'admin', adminOnly: true, requires: 'viewLogs' });
  });
});

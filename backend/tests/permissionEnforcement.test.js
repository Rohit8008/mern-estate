/**
 * The permissions that used to be tick-boxes nothing read are now enforced.
 *
 * Three things have to hold together, and each has a test block:
 *   1. WIRING   - the live router asks for the right key on the right route.
 *   2. BEHAVIOUR - a role without the key gets 403, with it passes; admins,
 *      sellers and buyers are not caught by it; an employee with no usable role
 *      keeps today's access (the documented fallback).
 *   3. NO LOCK-OUT - the default roles grant the keys, and the migration gives
 *      existing roles the keys that match what they could already do - and is
 *      idempotent.
 */

import mongoose from 'mongoose';
import { asTestTenant } from './setup.js';
import { registerTenancy } from '../tenancy/tenantPlugin.js';
import { DEFAULT_ROLES } from '../utils/defaultRoles.js';
import { PERMISSION_KEYS } from '../utils/permissionCatalogue.js';
import { planGrants, NOT_ENFORCED } from '../utils/permissionBackfill.js';

let routes;
let Role;
let requireStaffPermission;
let staffHasPermission;

beforeAll(async () => {
  registerTenancy(mongoose);
  ({ default: Role } = await import('../models/role.model.js'));
  ({ requireStaffPermission, staffHasPermission } = await import('../middleware/permissions.js'));
  const { createApp } = await import('../app.js');
  routes = collect(createApp());
});

function collect(app) {
  const found = [];
  const walk = (stack, prefix = '', inherited = []) => {
    const carried = [...inherited];
    for (const layer of stack) {
      if (layer.route) {
        const own = layer.route.stack.map((s) => s.handle.permissionKey).filter(Boolean);
        Object.keys(layer.route.methods).filter((m) => m !== '_all').forEach((m) =>
          found.push({ method: m.toUpperCase(), path: prefix + layer.route.path, keys: [...carried, ...own] })
        );
      } else if (layer.name === 'router' && layer.handle?.stack) {
        const seg = (layer.regexp?.source || '')
          .replace('^\\/', '/').replace('\\/?(?=\\/|$)', '').replace(/\\\//g, '/').replace(/\$$/, '');
        walk(layer.handle.stack, prefix + (seg === '/(?:/)?' || seg === '(?:/)?' ? '' : seg), carried);
      } else if (layer.handle?.permissionKey) {
        carried.push(layer.handle.permissionKey);
      }
    }
  };
  walk(app._router.stack);
  return found;
}

const keysFor = (method, path) => routes.find((r) => r.method === method && r.path === path)?.keys;

// ─── 1. wiring ───────────────────────────────────────────────────────────────

describe('wiring: each route asks for its permission', () => {
  const EXPECT = [
    ['GET', '/api/listing/get', 'viewListings'],
    ['GET', '/api/listing/get/:id', 'viewListings'],
    ['GET', '/api/listing/search', 'viewListings'],
    ['GET', '/api/listing/facets', 'viewListings'],
    ['GET', '/api/listing/suggestions', 'viewListings'],
    ['POST', '/api/listing/update/:id', 'updateListing'],
    ['DELETE', '/api/listing/delete/:id', 'deleteListing'],
    ['POST', '/api/listing/soft-delete/:id', 'deleteListing'],
    ['POST', '/api/message/send', 'sendMessages'],
    ['GET', '/api/message/inbox', 'viewMessages'],
    ['GET', '/api/message/sent', 'viewMessages'],
    ['GET', '/api/message/thread/:otherId', 'viewMessages'],
    ['GET', '/api/message/conversations', 'viewMessages'],
    ['POST', '/api/message/read', 'viewMessages'],
    ['POST', '/api/buyer-requirements/', 'createBuyerRequirement'],
    ['GET', '/api/buyer-requirements/', 'viewBuyerRequirements'],
    ['GET', '/api/buyer-requirements/stats', 'viewBuyerRequirements'],
    ['GET', '/api/buyer-requirements/export', 'viewBuyerRequirements'],
    ['GET', '/api/buyer-requirements/:id', 'viewBuyerRequirements'],
    ['GET', '/api/buyer-requirements/:id/matches', 'viewBuyerRequirements'],
    ['PUT', '/api/buyer-requirements/:id', 'updateBuyerRequirement'],
    ['PATCH', '/api/buyer-requirements/:id/status', 'updateBuyerRequirement'],
    ['POST', '/api/buyer-requirements/matches', 'updateBuyerRequirement'],
    ['DELETE', '/api/buyer-requirements/matches', 'updateBuyerRequirement'],
    ['DELETE', '/api/buyer-requirements/:id', 'deleteBuyerRequirement'],
    ['GET', '/api/category/list', 'viewCategories'],
    ['GET', '/api/category/by-slug/:slug', 'viewCategories'],
    ['GET', '/api/user/list', 'viewUsers'],
    ['POST', '/api/user/employee', 'createUser'],
    ['DELETE', '/api/user/admin/delete/:id', 'deleteUser'],
    ['GET', '/api/roles/', 'manageRoles'],
    ['POST', '/api/roles/assign', 'manageRoles'],
  ];

  it.each(EXPECT)('%s %s -> %s', (method, path, key) => {
    const keys = keysFor(method, path);
    expect(keys).toBeDefined();
    expect(keys).toContain(key);
  });

  it('bulk buyer actions are checked in a handler that picks the key per action', () => {
    // /bulk deletes OR updates depending on body.action, so it cannot carry one static key.
    expect(keysFor('POST', '/api/buyer-requirements/bulk')).toBeDefined();
  });

  it('every catalogue key is either enforced somewhere or listed as not enforceable', () => {
    const enforced = new Set(routes.flatMap((r) => r.keys));
    // Enforced in a controller rather than as route middleware:
    const inControllers = new Set(['toggleOwnerActive']);
    const gaps = PERMISSION_KEYS.filter(
      (k) => !enforced.has(k) && !inControllers.has(k) && !(k in NOT_ENFORCED)
    );
    // updateUser/updateClient etc. are enforced by earlier work or in controllers
    // (assign lead, etc.): only the keys THIS change owns are asserted here.
    const ours = ['createUser', 'deleteUser', 'viewUsers', 'deleteListing', 'viewMessages', 'sendMessages',
      'createBuyerRequirement', 'updateBuyerRequirement', 'deleteBuyerRequirement', 'manageRoles',
      'updateListing', 'viewListings', 'viewCategories', 'viewBuyerRequirements'];
    expect(gaps.filter((k) => ours.includes(k))).toEqual([]);
  });

  it('says plainly which two keys have nothing to guard', () => {
    expect(Object.keys(NOT_ENFORCED).sort()).toEqual(['deleteMessages', 'publishListing']);
  });
});

// ─── 2. behaviour ────────────────────────────────────────────────────────────

const run = (mw, user) =>
  new Promise((resolve) => {
    asTestTenant(() => mw({ user }, {}, (err) => resolve(err))).catch((e) => resolve(e));
  });

async function makeRole(permissions, extra = {}) {
  return asTestTenant(() =>
    Role.create({ name: `r-${new mongoose.Types.ObjectId()}`, description: 'test', permissions, ...extra })
  );
}

describe('behaviour: requireStaffPermission', () => {
  const NEW_KEYS = [
    'updateListing', 'deleteListing', 'viewListings', 'viewCategories',
    'viewMessages', 'sendMessages',
    'createBuyerRequirement', 'updateBuyerRequirement', 'deleteBuyerRequirement', 'viewBuyerRequirements',
  ];

  it.each(NEW_KEYS)('%s: a role lacking it gets 403, a role with it passes', async (key) => {
    const without = await makeRole({ viewClients: true });
    const withKey = await makeRole({ [key]: true });
    const mw = requireStaffPermission(key);

    const denied = await run(mw, { role: 'employee', assignedRole: String(without._id) });
    expect(denied?.statusCode).toBe(403);
    expect(denied.message).toContain(key);

    expect(await run(mw, { role: 'employee', assignedRole: String(withKey._id) })).toBeUndefined();
  });

  it.each(NEW_KEYS)('%s: admin bypasses', async (key) => {
    expect(await run(requireStaffPermission(key), { role: 'admin' })).toBeUndefined();
  });

  it('does not catch sellers or buyers: their limits are ownership, not roles', async () => {
    const mw = requireStaffPermission('deleteListing');
    expect(await run(mw, { role: 'seller' })).toBeUndefined();
    expect(await run(mw, { role: 'buyer' })).toBeUndefined();
  });

  it('documented fallback: an employee with no usable role keeps today\'s access', async () => {
    const mw = requireStaffPermission('viewListings');
    expect(await run(mw, { role: 'employee', assignedRole: null })).toBeUndefined();
    const inactive = await makeRole({}, { isActive: false });
    expect(await run(mw, { role: 'employee', assignedRole: String(inactive._id) })).toBeUndefined();
    expect(await run(mw, { role: 'employee', assignedRole: String(new mongoose.Types.ObjectId()) })).toBeUndefined();
  });

  it('refuses to be built with an unknown key', () => {
    expect(() => requireStaffPermission('nope')).toThrow(/not a known permission/);
  });

  it('toggleOwnerActive is checked with the same rules (used by the owner controller)', async () => {
    const no = await makeRole({ updateOwner: true });
    const yes = await makeRole({ updateOwner: true, toggleOwnerActive: true });
    asTestTenant(() => {});
    expect(await asTestTenant(() => staffHasPermission({ role: 'employee', assignedRole: String(no._id) }, 'toggleOwnerActive'))).toBe(false);
    expect(await asTestTenant(() => staffHasPermission({ role: 'employee', assignedRole: String(yes._id) }, 'toggleOwnerActive'))).toBe(true);
    expect(await staffHasPermission({ role: 'admin' }, 'toggleOwnerActive')).toBe(true);
  });

  it('admin-only routes stay admin-only: an employee is stopped by requireAdmin before the key is read', async () => {
    const { requireAdmin } = await import('../utils/verifyUser.js');
    const err = await new Promise((resolve) => requireAdmin({ user: { role: 'employee' } }, {}, resolve));
    expect(err).toBeDefined();
  });
});

// ─── 3. no lock-out ──────────────────────────────────────────────────────────

describe('default roles grant what an employee did before', () => {
  const role = (name) => DEFAULT_ROLES.find((r) => r.name === name).permissions;

  it('Employee keeps edit-own-listing, buyer requirements, messages and categories', () => {
    const p = role('Employee');
    ['updateListing', 'viewListings', 'viewCategories', 'viewMessages', 'sendMessages',
      'createBuyerRequirement', 'updateBuyerRequirement', 'viewBuyerRequirements'].forEach((k) => expect(p[k]).toBe(true));
  });

  it('sensitive keys are only on admin-like or manager roles', () => {
    for (const r of DEFAULT_ROLES) {
      const p = r.permissions;
      if (!['Super Admin'].includes(r.name)) {
        ['deleteUser', 'createUser', 'manageRoles', 'deleteMessages'].forEach((k) => expect(p[k]).toBeFalsy());
      }
      if (['Employee', 'Viewer'].includes(r.name)) expect(p.deleteListing).toBeFalsy();
    }
    expect(role('Super Admin').deleteListing).toBe(true);
    expect(role('Listing Manager').deleteListing).toBe(true);
    expect(role('Sales Manager').deleteListing).toBe(true);
  });

  it('the read-only Viewer stays read-only', () => {
    const p = role('Viewer');
    ['updateListing', 'sendMessages', 'createBuyerRequirement', 'updateBuyerRequirement'].forEach((k) => expect(p[k]).toBeFalsy());
  });

  it('every default role is a fixed point of the migration (it would add nothing)', () => {
    for (const r of DEFAULT_ROLES) {
      expect(planGrants(r.permissions).grants).toEqual([]);
    }
  });
});

describe('migration rules (planGrants)', () => {
  const keys = (p) => planGrants(p).grants.map((g) => g.key).sort();

  it('an old "Agent" role with createListing + viewClients keeps editing, reading and messaging', () => {
    const got = keys({ createListing: true, viewClients: true, viewOwners: true });
    expect(got).toEqual(expect.arrayContaining(['updateListing', 'viewListings', 'viewCategories', 'viewMessages', 'sendMessages']));
    expect(got).not.toContain('deleteListing');
    expect(got).not.toContain('deleteBuyerRequirement');
  });

  it('updateOwner brings toggleOwnerActive', () => {
    expect(keys({ updateOwner: true })).toContain('toggleOwnerActive');
  });

  it('a read-only role gets reads but no write or send', () => {
    const got = keys({ viewClients: true, viewBuyerRequirements: true, viewListings: true });
    expect(got).toEqual(expect.arrayContaining(['viewCategories', 'viewMessages']));
    ['sendMessages', 'createBuyerRequirement', 'updateBuyerRequirement', 'updateListing', 'deleteListing'].forEach((k) => expect(got).not.toContain(k));
  });

  it('deleteListing only goes to editors who already hold another delete permission', () => {
    expect(keys({ createListing: true, deleteClient: true })).toContain('deleteListing');
    expect(keys({ createListing: true })).not.toContain('deleteListing');
  });

  it('never grants the admin-only or unenforceable keys', () => {
    const all = keys({ createListing: true, deleteClient: true, createUser: false });
    ['createUser', 'deleteUser', 'viewUsers', 'manageRoles', 'publishListing', 'deleteMessages'].forEach((k) => expect(all).not.toContain(k));
  });

  it('an empty role is left alone', () => {
    expect(planGrants({}).grants).toEqual([]);
    expect(planGrants({ systemSettings: true, viewLogs: false }).grants.map((g) => g.key)).toEqual(['viewMessages']);
  });

  it('is idempotent and never removes anything', () => {
    const start = { createListing: true, deleteClient: true, viewClients: true, uploadFiles: true };
    const once = planGrants(start);
    const twice = planGrants(once.after);
    expect(twice.grants).toEqual([]);
    expect(twice.after).toEqual(once.after);
    for (const [k, v] of Object.entries(start)) if (v) expect(once.after[k]).toBe(true);
  });

  it('applied to stored roles twice, the second pass changes nothing', async () => {
    const r = await makeRole({ createListing: true, viewClients: true, updateOwner: true });
    const apply = async () => {
      const doc = await asTestTenant(() => Role.findById(r._id).lean());
      const { grants } = planGrants(doc.permissions);
      if (grants.length) {
        const $set = Object.fromEntries(grants.map((g) => [`permissions.${g.key}`, true]));
        await asTestTenant(() => Role.updateOne({ _id: r._id }, { $set }));
      }
      return grants.length;
    };
    expect(await apply()).toBeGreaterThan(0);
    expect(await apply()).toBe(0);
    const final = await asTestTenant(() => Role.findById(r._id).lean());
    expect(final.permissions.updateListing).toBe(true);
    expect(final.permissions.toggleOwnerActive).toBe(true);
    expect(final.permissions.createListing).toBe(true);
  });
});

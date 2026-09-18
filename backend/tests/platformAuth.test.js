/**
 * The platform boundary.
 *
 * This is the single check separating a workspace admin — of which there is one
 * per agency, and eventually hundreds — from the vendor operator who can read,
 * provision and suspend every workspace in the estate. Conflating the two would
 * be the worst bug in the product.
 *
 * tests/routeAccess.test.js already asserts that `requirePlatformAdmin` is
 * ATTACHED to every /api/platform route. It cannot tell you the guard actually
 * denies anyone, because it never executes it — it reads the router's stack and
 * matches the function's name. These tests execute it.
 */

import mongoose from 'mongoose';
import User from '../models/user.model.js';
import { requirePlatformAdmin } from '../middleware/platformAuth.js';

let tenantId;

beforeEach(() => {
  tenantId = global.testUtils.tenantId;
});

/**
 * Drive the middleware directly and capture whatever it hands `next`.
 *
 * Mutates the caller's own req rather than spreading it into a copy — the
 * middleware's output is `req.platformAdmin`, which a copy would swallow.
 */
const run = (req) => {
  req.ip ??= '127.0.0.1';
  req.originalUrl ??= '/api/platform/tenants';
  return new Promise((resolve) => requirePlatformAdmin(req, {}, resolve));
};

const makeUser = (overrides = {}) =>
  global.testUtils.asTestTenant(() =>
    User.create({
      username: `u${Math.random().toString(36).slice(2, 9)}`,
      email: `${Math.random().toString(36).slice(2, 9)}@test.dev`,
      password: 'x'.repeat(20),
      role: 'admin',
      status: 'active',
      ...overrides,
    })
  );

describe('requirePlatformAdmin', () => {
  it('refuses a workspace admin — role:admin is not the platform flag', async () => {
    const user = await makeUser({ role: 'admin', isPlatformAdmin: false });

    const err = await run({ user: { id: String(user._id) }, tenantId: String(tenantId) });

    expect(err).toBeDefined();
    expect(err.message).toMatch(/platform operators/i);
    expect(err.statusCode).toBe(403);
  });

  it('admits a platform operator', async () => {
    const user = await makeUser({ isPlatformAdmin: true });

    const req = { user: { id: String(user._id) }, tenantId: String(tenantId) };
    const err = await run(req);

    expect(err).toBeUndefined();
    expect(req.platformAdmin).toMatchObject({ id: String(user._id), email: user.email });
  });

  it('refuses a suspended operator, flag or no flag', async () => {
    // Revoking access has to mean something even for the vendor's own staff.
    const user = await makeUser({ isPlatformAdmin: true, status: 'suspended' });

    const err = await run({ user: { id: String(user._id) }, tenantId: String(tenantId) });

    expect(err).toBeDefined();
    expect(err.message).toMatch(/platform operators/i);
  });

  it('refuses a request with no session at all', async () => {
    const err = await run({ user: undefined, tenantId: String(tenantId) });

    expect(err).toBeDefined();
    expect(err.message).toMatch(/sign in/i);
  });

  it('still admits an operator whose request is scoped to a CUSTOMER workspace', async () => {
    // The acting-as case, and the reason the lookup is pinned to homeTenantId.
    // While viewing a customer the request is scoped to that customer, where the
    // operator's own account record does not exist. An unpinned findById would
    // return null and lock them out of the console they are standing in.
    const operator = await makeUser({ isPlatformAdmin: true });
    const customerTenant = new mongoose.Types.ObjectId();

    const req = {
      user: { id: String(operator._id) },
      homeTenantId: String(tenantId),
      tenantId: String(customerTenant),
    };
    const err = await run(req);

    expect(err).toBeUndefined();
    expect(req.platformAdmin.email).toBe(operator.email);
  });

  it('does not trust a flag asserted on req.user', async () => {
    // isPlatformAdmin is `select: false` precisely so it is never carried on the
    // request object. Anything that put it there must not be believed.
    const user = await makeUser({ isPlatformAdmin: false });

    const err = await run({
      user: { id: String(user._id), isPlatformAdmin: true, role: 'admin' },
      tenantId: String(tenantId),
    });

    expect(err).toBeDefined();
    expect(err.message).toMatch(/platform operators/i);
  });
});

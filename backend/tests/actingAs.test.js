/**
 * Tenant switching for platform operators.
 *
 * Two claims do the work and the tests are organised around keeping them
 * apart: `tid` says where the operator's ACCOUNT lives, `act` says which
 * workspace they are LOOKING at. Collapse them and the operator's identity
 * lands in a workspace their account is not in — the session stops resolving
 * and they are signed out. Honour `act` without `pa` and any user can read any
 * agency's data by editing a token claim.
 *
 * The third thing under test is the promise the banner makes to the customer:
 * this view is read-only.
 */

import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { readOnlyWhileActing } from '../tenancy/readOnlyWhileActing.js';
import { resolveTenant } from '../tenancy/resolveTenant.js';
import Tenant from '../models/tenant.model.js';
import { config } from '../config/environment.js';
import { inHomeTenant, runWithTenant, runWithoutTenantScope } from '../tenancy/tenantContext.js';
import User from '../models/user.model.js';

const HOME = new mongoose.Types.ObjectId();
const TARGET = new mongoose.Types.ObjectId();

// ─── The read-only guard ──────────────────────────────────────────────────────

function guard({ method = 'POST', url = '/api/listing/create', acting = true } = {}) {
  const req = {
    method,
    originalUrl: url,
    ip: '127.0.0.1',
    user: { id: 'u1' },
    actingAs: acting
      ? { tenantId: String(TARGET), name: 'AKM', slug: 'akm', homeTenantId: String(HOME) }
      : undefined,
  };
  return new Promise((resolve) => {
    readOnlyWhileActing(req, {}, (err) => resolve(err));
  });
}

describe('a platform operator inside a customer workspace can look, not touch', () => {
  it('lets every read through', async () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      expect(await guard({ method, url: '/api/listing/get' })).toBeUndefined();
    }
  });

  it.each([
    ['POST', '/api/listing/create'],
    ['PATCH', '/api/category/update-fields/abc'],
    ['PUT', '/api/clients/1'],
    ['DELETE', '/api/listing/delete/1'],
  ])('refuses %s %s', async (method, url) => {
    const err = await guard({ method, url });
    expect(err).toBeDefined();
    expect(err.message).toMatch(/read-only/i);
    expect(err.actingReadOnly).toBe(true);
  });

  it('names the workspace in the refusal, so the operator knows where they are', async () => {
    const err = await guard({});
    expect(err.message).toContain('AKM');
  });

  it('still lets them leave', async () => {
    // Blocking this would trap the operator inside the workspace they visited,
    // with no way back to their own.
    expect(await guard({ url: '/api/platform/stop-acting' })).toBeUndefined();
  });

  it('still lets them switch straight to another workspace', async () => {
    expect(await guard({ url: `/api/platform/act-as/${TARGET}` })).toBeUndefined();
  });

  it('still lets the session refresh and sign out', async () => {
    expect(await guard({ url: '/api/auth/refresh' })).toBeUndefined();
    expect(await guard({ url: '/api/auth/signout' })).toBeUndefined();
  });

  it('ignores a query string when matching the exempt list', async () => {
    expect(await guard({ url: '/api/platform/stop-acting?from=banner' })).toBeUndefined();
  });

  it('is not a prefix match on something merely similar', async () => {
    // `/api/platform/stop-acting-now` is not `/api/platform/stop-acting`.
    const err = await guard({ url: '/api/platform/stop-acting-now' });
    expect(err).toBeDefined();
  });

  it('does nothing at all when nobody is acting', async () => {
    expect(await guard({ acting: false })).toBeUndefined();
  });

  it('refuses a path that could mean two things', async () => {
    // The exempt list is matched by prefix because act-as carries an id, which
    // makes the shape of the path load-bearing. A `..` segment is ambiguous
    // between what we match and what a normaliser might route, so it is
    // refused rather than interpreted.
    for (const url of [
      '/api/platform/stop-acting/../../listing/create',
      '/api/platform/stop-acting/./../listing/create',
      '/api/platform/act-as/..%2F..%2Flisting%2Fcreate',
    ]) {
      expect(await guard({ url })).toBeDefined();
    }
  });

  it('refuses a path with an empty segment', async () => {
    expect(await guard({ url: '/api/platform/stop-acting//../listing/create' })).toBeDefined();
  });
});

// ─── The claims ───────────────────────────────────────────────────────────────

/**
 * These drive the REAL resolveTenant middleware.
 *
 * The previous version of this block verified a token and then restated
 * resolveTenant's own expression inline —
 * `payload.pa === true && payload.act ? String(payload.act) : null` — which is
 * the same line as tenancy/resolveTenant.js:105. That asserts the rule is
 * correct as written in the test, not that the shipped code implements it: all
 * three tests would have passed with resolveTenant deleted.
 */
describe('the acting claim', () => {
  const sign = (claims) =>
    jwt.sign(claims, config.jwt.secret, {
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    });

  /** Run resolveTenant over a request carrying `claims` as its access token. */
  async function resolve(claims) {
    const req = {
      cookies: { access_token: sign(claims) },
      headers: {},
      ip: '127.0.0.1',
      originalUrl: '/api/listing/get',
      method: 'GET',
    };
    await new Promise((resolveP, reject) => {
      resolveTenant()(req, {}, (err) => (err ? reject(err) : resolveP()));
    });
    return req;
  }

  let home;
  let target;

  beforeEach(async () => {
    await runWithoutTenantScope('seeding tenants for an acting-as test', async () => {
      home = await Tenant.create({ _id: HOME, name: 'Vendor HQ', slug: 'vendor-hq', status: 'active' });
      target = await Tenant.create({ _id: TARGET, name: 'AKM Realty', slug: 'akm', status: 'active' });
    });
  });

  it('ignores `act` that is not accompanied by a signed `pa`', async () => {
    // A user who got `act` onto a token — an old one, a copied one, a forged
    // body — is scoped to their own workspace, which is where they started.
    const req = await resolve({ id: 'u1', tid: String(HOME), act: String(TARGET) });

    expect(req.tenantId).toBe(String(HOME));
    expect(req.actingAs).toBeUndefined();
  });

  it('honours `act` when `pa` is signed alongside it', async () => {
    const req = await resolve({ id: 'u1', tid: String(HOME), act: String(TARGET), pa: true });

    expect(req.tenantId).toBe(String(TARGET));
    expect(req.actingAs).toMatchObject({ tenantId: String(TARGET), slug: 'akm' });
  });

  it('never moves the account out of its own workspace', async () => {
    // The bug this guards against: rewriting `tid` to the target instead of
    // adding `act`. The account would then be looked up in a workspace it is
    // not in, and the operator would be signed out on their next request.
    const req = await resolve({ id: 'u1', tid: String(HOME), act: String(TARGET), pa: true });

    expect(req.homeTenantId).toBe(String(HOME));
    expect(req.actingAs.homeTenantId).toBe(String(HOME));
    // Data scope moved; identity did not.
    expect(req.tenantId).not.toBe(req.homeTenantId);
  });

  it('falls back to the operator\'s own workspace when the target is gone', async () => {
    await runWithoutTenantScope('deleting the target', () => Tenant.deleteOne({ _id: TARGET }));

    const req = await resolve({ id: 'u1', tid: String(HOME), act: String(TARGET), pa: true });

    expect(req.tenantId).toBe(String(HOME));
    expect(req.actingAs).toBeUndefined();
  });

  it('still opens a SUSPENDED workspace, which is the one support needs most', async () => {
    await runWithoutTenantScope('suspending the target', () =>
      Tenant.updateOne({ _id: TARGET }, { $set: { status: 'suspended' } })
    );

    const req = await resolve({ id: 'u1', tid: String(HOME), act: String(TARGET), pa: true });

    expect(req.tenantId).toBe(String(TARGET));
    expect(req.actingAs.status).toBe('suspended');
  });

  it('refuses the request when the operator\'s OWN workspace is suspended', async () => {
    await runWithoutTenantScope('suspending home', () =>
      Tenant.updateOne({ _id: HOME }, { $set: { status: 'suspended' } })
    );

    await expect(resolve({ id: 'u1', tid: String(HOME) })).rejects.toThrow(/suspended/i);
  });
});

// ─── Identity stays at home ───────────────────────────────────────────────────

describe('reads about the caller resolve in their own workspace', () => {
  it('finds the operator while the request is scoped to somewhere else', async () => {
    const operator = await runWithTenant({ tenantId: String(HOME) }, () =>
      User.create({
        username: 'operator',
        email: 'ops@vendor.test',
        password: 'x'.repeat(20),
        role: 'admin',
      })
    );

    // The request is scoped to the customer's workspace, as it would be while
    // acting. An unpinned lookup here finds nothing, and "nothing" reads as
    // "signed out" — which is the bug this exists to prevent.
    const found = await runWithTenant({ tenantId: String(TARGET) }, () =>
      inHomeTenant({ homeTenantId: String(HOME), tenantId: String(TARGET) }, () =>
        User.findById(operator._id)
      )
    );

    expect(found).not.toBeNull();
    expect(found.email).toBe('ops@vendor.test');
  });

  it('is a no-op when nobody is acting', async () => {
    const user = await runWithTenant({ tenantId: String(HOME) }, () =>
      User.create({ username: 'plain', email: 'a@b.test', password: 'x'.repeat(20) })
    );
    const found = await runWithTenant({ tenantId: String(HOME) }, () =>
      inHomeTenant({ homeTenantId: String(HOME), tenantId: String(HOME) }, () =>
        User.findById(user._id)
      )
    );
    expect(String(found._id)).toBe(String(user._id));
  });

  it('does not let the pin become a way to read another workspace', async () => {
    // inHomeTenant pins to req.homeTenantId, which resolveTenant sets from the
    // token — never from anything the caller sends.
    const stranger = await runWithTenant({ tenantId: String(TARGET) }, () =>
      User.create({ username: 'theirs', email: 'them@akm.test', password: 'x'.repeat(20) })
    );
    const found = await runWithTenant({ tenantId: String(TARGET) }, () =>
      inHomeTenant({ homeTenantId: String(HOME), tenantId: String(TARGET) }, () =>
        User.findById(stranger._id)
      )
    );
    expect(found).toBeNull();
  });
});


// ─── Signing out while acting ─────────────────────────────────────────────────

/**
 * The bug these exist to prevent, found in review:
 *
 * signOut revoked the refresh token with an unpinned `User.findByIdAndUpdate`.
 * While acting, the request is scoped to the CUSTOMER's workspace, where the
 * operator's account does not exist — so the update matched nothing, the
 * endpoint still answered "signed out successfully", and the refresh token
 * stayed valid for its full 30 days. A sign-out that does not sign you out is
 * worse than one that fails loudly.
 */
describe('signing out works from inside a customer workspace', () => {
  async function operatorWithToken() {
    return runWithTenant({ tenantId: String(HOME) }, () =>
      User.create({
        username: 'ops2',
        email: `ops${Date.now()}@vendor.test`,
        password: 'x'.repeat(20),
        role: 'admin',
        refreshTokens: [{ token: 'hashed-token-value' }],
      })
    );
  }

  const actingReq = (user) => ({
    homeTenantId: String(HOME),
    tenantId: String(TARGET),
    user: { id: String(user._id) },
  });

  it('revokes one token even though the request is scoped elsewhere', async () => {
    const user = await operatorWithToken();

    await runWithTenant({ tenantId: String(TARGET) }, () =>
      inHomeTenant(actingReq(user), () =>
        User.findByIdAndUpdate(user._id, {
          $pull: { refreshTokens: { token: 'hashed-token-value' } },
        })
      )
    );

    const after = await runWithTenant({ tenantId: String(HOME) }, () =>
      User.findById(user._id).select('+refreshTokens')
    );
    expect(after.refreshTokens).toHaveLength(0);
  });

  it('revokes every token on sign-out-from-all-devices', async () => {
    const user = await operatorWithToken();

    await runWithTenant({ tenantId: String(TARGET) }, () =>
      inHomeTenant(actingReq(user), () =>
        User.findByIdAndUpdate(user._id, { $set: { refreshTokens: [] } })
      )
    );

    const after = await runWithTenant({ tenantId: String(HOME) }, () =>
      User.findById(user._id).select('+refreshTokens')
    );
    expect(after.refreshTokens).toHaveLength(0);
  });

  it('would silently do nothing without the pin — the bug, pinned down', async () => {
    const user = await operatorWithToken();

    // Exactly the old code: no pin, so it runs in the customer's workspace.
    await runWithTenant({ tenantId: String(TARGET) }, () =>
      User.findByIdAndUpdate(user._id, { $set: { refreshTokens: [] } })
    );

    const after = await runWithTenant({ tenantId: String(HOME) }, () =>
      User.findById(user._id).select('+refreshTokens')
    );
    expect(after.refreshTokens).toHaveLength(1); // still there — nothing revoked
  });
});

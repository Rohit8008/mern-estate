/**
 * Choosing a workspace on a shared address.
 *
 * With no custom domain or subdomain, the sign-in screen's Workspace field
 * arrives as the x-tenant header. Before it existed every sign-in looked the
 * email up in the default workspace, so members of any other workspace could
 * accept an invitation but never sign in again.
 */

import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { config } from '../config/environment.js';
import Tenant from '../models/tenant.model.js';
import { resolveTenant } from '../tenancy/resolveTenant.js';
import { runWithoutTenantScope } from '../tenancy/tenantContext.js';

// The suite's setup empties the database between tests, so each test gets
// its own pair, under fresh names (the tenant cache is keyed by slug).
let SLUG_A;
let SLUG_B;
let a;
let b;

beforeEach(async () => {
  const suffix = new mongoose.Types.ObjectId().toString().slice(-8);
  SLUG_A = `alpha${suffix}`;
  SLUG_B = `beta${suffix}`;
  [a, b] = await runWithoutTenantScope('seeding two workspaces', () =>
    Promise.all([
      Tenant.create({ name: 'Alpha Homes', slug: SLUG_A, status: 'active' }),
      Tenant.create({ name: 'Beta Estates', slug: SLUG_B, status: 'active' }),
    ])
  );
});

const sessionFor = (tenantId) =>
  jwt.sign({ id: 'u1', tid: String(tenantId) }, config.jwt.secret, { issuer: config.jwt.issuer, audience: config.jwt.audience, expiresIn: '5m' });

function resolve({ method = 'POST', path = '/auth/signin', tenantHeader, tokenTenant } = {}) {
  const req = {
    method,
    path,
    headers: { host: 'realvista.example', ...(tenantHeader ? { 'x-tenant': tenantHeader } : {}) },
    cookies: tokenTenant ? { access_token: sessionFor(tokenTenant) } : {},
    ip: '127.0.0.1',
  };
  return new Promise((done) => {
    resolveTenant()(req, {}, (err) => done({ err, tenant: req.tenant }));
  });
}

describe('the Workspace field', () => {
  it('signs in to the workspace named', async () => {
    const { err, tenant } = await resolve({ tenantHeader: SLUG_B });
    expect(err).toBeUndefined();
    expect(String(tenant._id)).toBe(String(b._id));
  });

  it('ignores case and spaces', async () => {
    const { tenant } = await resolve({ tenantHeader: `  ${SLUG_A.toUpperCase()} ` });
    expect(String(tenant._id)).toBe(String(a._id));
  });

  it('says so for a workspace that does not exist, instead of using the default', async () => {
    const { err, tenant } = await resolve({ tenantHeader: 'no-such-agency' });
    expect(tenant).toBeUndefined();
    expect(err.statusCode).toBe(404);
    expect(err.message).toMatch(/no workspace called "no-such-agency"/);
  });

  it('checks a name on the lookup route too', async () => {
    const { err, tenant } = await resolve({ method: 'GET', path: '/tenant/lookup', tenantHeader: SLUG_A });
    expect(err).toBeUndefined();
    expect(tenant.slug).toBe(SLUG_A);
  });

  it('beats a session cookie left over from another workspace, when signing in', async () => {
    // Signed in to Alpha before; now choosing Beta on the sign-in screen.
    const { tenant } = await resolve({ tenantHeader: SLUG_B, tokenTenant: a._id });
    expect(String(tenant._id)).toBe(String(b._id));
  });

  it('never lets the header move an existing session anywhere else', async () => {
    const { tenant } = await resolve({ method: 'GET', path: '/crm/clients', tenantHeader: SLUG_B, tokenTenant: a._id });
    expect(String(tenant._id)).toBe(String(a._id));
  });
});

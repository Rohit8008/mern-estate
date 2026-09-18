/**
 * Workspace provisioning.
 *
 * A workspace that exists but cannot be used is worse than one that failed to
 * be created: it holds its address, looks fine in a list, and the customer
 * discovers the problem instead of the operator. So these tests care as much
 * about what happens when provisioning fails as about the happy path.
 */

import mongoose from 'mongoose';
import Tenant from '../models/tenant.model.js';
import User from '../models/user.model.js';
import Role from '../models/role.model.js';
import Category from '../models/category.model.js';
import {
  provisionTenant,
  normalizeSlug,
  validateSlug,
  limitsForPlan,
  PLAN_LIMITS,
  RESERVED_SLUGS,
} from '../tenancy/provisionTenant.js';
import { runWithTenant, runWithoutTenantScope } from '../tenancy/tenantContext.js';

const inWorkspace = (tenant, fn) => runWithTenant({ tenantId: String(tenant._id) }, fn);

describe('normalizeSlug', () => {
  it('turns an agency name into a usable address', () => {
    expect(normalizeSlug('Acme Realty')).toBe('acme-realty');
    expect(normalizeSlug('  Bluestar   Properties  ')).toBe('bluestar-properties');
    expect(normalizeSlug('R&K Estates!')).toBe('r-k-estates');
  });

  it('trims separators from the ends', () => {
    expect(normalizeSlug('--acme--')).toBe('acme');
  });
});

describe('validateSlug', () => {
  it('rejects the platform\'s own hostnames', async () => {
    // These would shadow the platform's real subdomains once routing is on.
    for (const reserved of ['www', 'api', 'admin', 'app']) {
      expect(RESERVED_SLUGS.has(reserved)).toBe(true);
      await expect(validateSlug(reserved)).rejects.toThrow(/reserved/i);
    }
  });

  it('rejects malformed addresses', async () => {
    await expect(validateSlug('ab')).rejects.toThrow();          // too short
    await expect(validateSlug('-acme')).rejects.toThrow();       // leading hyphen
    await expect(validateSlug('Acme')).rejects.toThrow();        // uppercase
    await expect(validateSlug('acme_realty')).rejects.toThrow(); // underscore
  });

  it('rejects an address already in use', async () => {
    await provisionTenant({ name: 'Acme', slug: 'acme', adminEmail: 'a@acme.test' });
    await expect(validateSlug('acme')).rejects.toThrow(/already taken/i);
  });
});

describe('provisionTenant', () => {
  it('creates a workspace that can actually be used', async () => {
    const { tenant, adminUser } = await provisionTenant({
      name: 'Acme Realty',
      slug: 'acme',
      adminEmail: 'owner@acme.test',
      plan: 'growth',
    });

    expect(tenant.slug).toBe('acme');
    expect(tenant.status).toBe('active');
    expect(tenant.branding.productName).toBe('Acme Realty');

    await inWorkspace(tenant, async () => {
      // Roles, or the permission system has nothing to resolve against.
      const roles = await Role.find();
      expect(roles.map((r) => r.name).sort()).toEqual(['Employee', 'Super Admin', 'Viewer']);

      // An admin, or nobody can sign in.
      const admin = await User.findOne({ role: 'admin' });
      expect(admin.email).toBe('owner@acme.test');
      expect(String(admin.assignedRole)).toBe(
        String(roles.find((r) => r.name === 'Super Admin')._id)
      );

      // A category, or the property form has nothing to offer.
      const categories = await Category.find();
      expect(categories).toHaveLength(1);
      expect(categories[0].fields.length).toBeGreaterThan(0);
    });

    expect(String(adminUser.tenantId)).toBe(String(tenant._id));
  });

  it('starts a trial with an end date, and a paid plan without one', async () => {
    const trial = await provisionTenant({
      name: 'Trial Co', slug: 'trialco', adminEmail: 't@trial.test', trialDays: 30,
    });
    expect(trial.tenant.status).toBe('trial');
    const days = Math.round((trial.tenant.trialEndsAt - Date.now()) / 86400000);
    expect(days).toBe(30);

    const paid = await provisionTenant({
      name: 'Paid Co', slug: 'paidco', adminEmail: 'p@paid.test', plan: 'enterprise',
    });
    expect(paid.tenant.status).toBe('active');
    expect(paid.tenant.trialEndsAt).toBeNull();
  });

  it('leaves the admin without a password unless one was given', async () => {
    // A password chosen by the vendor and emailed around is a password everyone
    // keeps using, so the default makes the admin set their own.
    const { adminUser, needsPasswordSetup } = await provisionTenant({
      name: 'No Pass', slug: 'nopass', adminEmail: 'np@x.test',
    });
    expect(needsPasswordSetup).toBe(true);
    const stored = await runWithoutTenantScope('test', () =>
      User.findById(adminUser._id).select('+password')
    );
    expect(stored.password).toBeFalsy();
  });

  it('hashes a supplied password rather than storing it', async () => {
    const { adminUser } = await provisionTenant({
      name: 'Pass', slug: 'passco', adminEmail: 'p@x.test', adminPassword: 'Secret@12345',
    });
    const stored = await runWithoutTenantScope('test', () =>
      User.findById(adminUser._id).select('+password')
    );
    expect(stored.password).toBeTruthy();
    expect(stored.password).not.toBe('Secret@12345');
  });

  it('skips the starter category when asked', async () => {
    const { tenant } = await provisionTenant({
      name: 'Bare', slug: 'bareco', adminEmail: 'b@x.test', seedSampleData: false,
    });
    await inWorkspace(tenant, async () => {
      expect(await Category.countDocuments()).toBe(0);
      // Roles and the admin are not optional, though.
      expect(await Role.countDocuments()).toBe(3);
      expect(await User.countDocuments()).toBe(1);
    });
  });

  it('keeps two workspaces entirely separate', async () => {
    const a = await provisionTenant({ name: 'A Co', slug: 'aco', adminEmail: 'x@a.test' });
    const b = await provisionTenant({ name: 'B Co', slug: 'bco', adminEmail: 'x@b.test' });

    await inWorkspace(a.tenant, async () => {
      expect(await User.countDocuments()).toBe(1);
      expect((await User.findOne()).email).toBe('x@a.test');
    });
    await inWorkspace(b.tenant, async () => {
      expect((await User.findOne()).email).toBe('x@b.test');
    });
  });

  it('lets the same person be an admin at two agencies', async () => {
    // Identity is per workspace — a consultant may run two agencies' CRMs, and
    // a globally unique email would make the second one impossible.
    await provisionTenant({ name: 'One', slug: 'one', adminEmail: 'shared@x.test' });
    await expect(
      provisionTenant({ name: 'Two', slug: 'two', adminEmail: 'shared@x.test' })
    ).resolves.toBeTruthy();
  });

  it('rolls back completely when a later step fails', async () => {
    // The failure that matters: a workspace that exists but cannot be signed
    // into. An invalid admin email fails at user creation, after the tenant and
    // its roles have already been written.
    await expect(
      provisionTenant({ name: 'Broken', slug: 'brokenco', adminEmail: 'not-an-email' })
    ).rejects.toThrow();

    const tenant = await runWithoutTenantScope('test', () => Tenant.findOne({ slug: 'brokenco' }));
    expect(tenant).toBeNull();

    // And no orphaned rows left behind pointing at a tenant that is gone.
    const orphanRoles = await runWithoutTenantScope('test', () =>
      Role.countDocuments({ name: 'Super Admin' })
    );
    expect(orphanRoles).toBe(0);
  });

  it('frees the address again after a rollback', async () => {
    // The operator's next move is to fix the input and retry with the same
    // address, so a failed attempt must not hold it.
    await expect(
      provisionTenant({ name: 'Retry', slug: 'retryco', adminEmail: 'bad' })
    ).rejects.toThrow();
    await expect(
      provisionTenant({ name: 'Retry', slug: 'retryco', adminEmail: 'good@x.test' })
    ).resolves.toBeTruthy();
  });

  it('refuses without a name or an admin email', async () => {
    await expect(provisionTenant({ slug: 'x', adminEmail: 'a@b.test' })).rejects.toThrow(/name/i);
    await expect(provisionTenant({ name: 'X Co', slug: 'xco' })).rejects.toThrow(/admin email/i);
  });

  it('gives a workspace the allowances its plan includes', async () => {
    // Without this, a starter workspace would silently carry whatever the
    // schema happened to default to — and an upgrade would be a price change
    // with no extra capacity, which is the thing the customer is buying.
    const starter = await provisionTenant({
      name: 'Starter Co', slug: 'starterco', adminEmail: 's@x.test', plan: 'starter',
    });
    expect(starter.tenant.limits.maxUsers).toBe(PLAN_LIMITS.starter.maxUsers);
    expect(starter.tenant.limits.maxListings).toBe(PLAN_LIMITS.starter.maxListings);

    const trial = await provisionTenant({
      name: 'Trial Two', slug: 'trialtwo', adminEmail: 't2@x.test',
    });
    expect(trial.tenant.limits.maxListings).toBe(PLAN_LIMITS.trial.maxListings);
  });

  it('treats enterprise as unlimited rather than as a very large number', async () => {
    const { tenant } = await provisionTenant({
      name: 'Ent Co', slug: 'entco', adminEmail: 'e@x.test', plan: 'enterprise',
    });
    expect(tenant.limits.maxUsers).toBe(0);
    expect(tenant.limits.maxListings).toBe(0);
  });

  it('lets an explicit allowance override the plan', async () => {
    // An operator granting a bespoke allowance should not have to invent a plan.
    const { tenant } = await provisionTenant({
      name: 'Bespoke', slug: 'bespokeco', adminEmail: 'b2@x.test',
      plan: 'starter', limits: { maxUsers: 99 },
    });
    expect(tenant.limits.maxUsers).toBe(99);
    expect(tenant.limits.maxListings).toBe(PLAN_LIMITS.starter.maxListings);
  });

  it('falls back to trial allowances for an unrecognised plan', () => {
    expect(limitsForPlan('made-up')).toEqual(PLAN_LIMITS.trial);
  });

  it('does not make anyone a platform admin by default', async () => {
    // Platform admin administers EVERY workspace. Provisioning must never grant
    // it — only scripts/provisionTenant.js --platform-admin does.
    const { tenant, adminUser } = await provisionTenant({
      name: 'Normal', slug: 'normalco', adminEmail: 'n@x.test',
    });
    const stored = await inWorkspace(tenant, () =>
      User.findById(adminUser._id).select('+isPlatformAdmin')
    );
    expect(stored.isPlatformAdmin).toBe(false);
  });
});

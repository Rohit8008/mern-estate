/**
 * Plan limits.
 *
 * A plan that says "up to 25 users" and then lets a workspace create 400 is a
 * suggestion, not a plan. These tests pin the two rules that matter: limits
 * gate creation only, and an unlimited plan costs nothing to check.
 */

import { assertWithinLimit, getLimitUsage, PlanLimitError } from '../tenancy/limits.js';
import { runWithTenant, runWithoutTenantScope } from '../tenancy/tenantContext.js';

const workspace = (limits, extra = {}) => ({
  _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  slug: 'acme',
  plan: 'starter',
  limits,
  ...extra,
});

const withWorkspace = (tenant, fn) =>
  runWithTenant({ tenantId: String(tenant._id), tenant }, fn);

describe('assertWithinLimit', () => {
  // The cap boundary, pinned as a pair by the next two tests: 24 existing + 1
  // = 25 is allowed because that is what "up to 25" means, and 25 + 1 is not.
  // A third test asserting the same 24 was removed — it restated this one
  // verbatim while claiming to cover the boundary.
  it('allows the create that exactly reaches the cap', async () => {
    await expect(
      withWorkspace(workspace({ maxUsers: 25 }), () => assertWithinLimit('maxUsers', async () => 24))
    ).resolves.toBeUndefined();
  });

  it('refuses the one that would go past it', async () => {
    await expect(
      withWorkspace(workspace({ maxUsers: 25 }), () => assertWithinLimit('maxUsers', async () => 25))
    ).rejects.toThrow(PlanLimitError);
  });

  it('answers with 402, not 403', async () => {
    // "Your plan doesn't cover this" is a different thing from "you may not do
    // this", and the client shows a different screen for each.
    const err = await withWorkspace(workspace({ maxUsers: 1 }), () =>
      assertWithinLimit('maxUsers', async () => 1).catch((e) => e)
    );
    expect(err.statusCode).toBe(402);
  });

  it('says what to do next, not just that something failed', async () => {
    const err = await withWorkspace(workspace({ maxUsers: 25 }), () =>
      assertWithinLimit('maxUsers', async () => 25).catch((e) => e)
    );
    expect(err.message).toMatch(/25/);
    expect(err.message).toMatch(/user seats/);
    expect(err.message).toMatch(/Remove a user|larger plan/);
  });

  it('accounts for a bulk create in one go', async () => {
    // Import is the path that can take a workspace from inside its plan to far
    // past it in a single request.
    const tenant = workspace({ maxListings: 1000 });
    await expect(
      withWorkspace(tenant, () => assertWithinLimit('maxListings', async () => 900, 100))
    ).resolves.toBeUndefined();
    await expect(
      withWorkspace(tenant, () => assertWithinLimit('maxListings', async () => 900, 101))
    ).rejects.toThrow(/101|remaining/i);
  });

  it('treats a missing, zero or negative cap as unlimited', async () => {
    for (const limits of [{}, { maxUsers: 0 }, { maxUsers: -1 }]) {
      await expect(
        withWorkspace(workspace(limits), () => assertWithinLimit('maxUsers', async () => 999999))
      ).resolves.toBeUndefined();
    }
  });

  it('does not count anything when the plan is unlimited', async () => {
    // The count is a database query on a large collection; an enterprise plan
    // should not pay for it on every create.
    // A plain counter rather than jest.fn: under ESM the `jest` global is not
    // injected, and importing it here would buy nothing.
    let calls = 0;
    const count = async () => { calls += 1; return 0; };
    await withWorkspace(workspace({ maxUsers: 0 }), () => assertWithinLimit('maxUsers', count));
    expect(calls).toBe(0);
  });

  it('enforces nothing outside a workspace context', async () => {
    // Migrations and platform jobs are not subject to a customer's plan.
    await expect(
      runWithoutTenantScope('a migration', () => assertWithinLimit('maxUsers', async () => 99999))
    ).resolves.toBeUndefined();
  });
});

describe('getLimitUsage', () => {
  it('reports remaining headroom per limit', async () => {
    const usage = await getLimitUsage(workspace({ maxUsers: 25, maxListings: 10000 }), {
      maxUsers: 10,
      maxListings: 250,
    });
    expect(usage.maxUsers).toMatchObject({ used: 10, cap: 25, remaining: 15, unlimited: false });
    expect(usage.maxListings.remaining).toBe(9750);
  });

  it('flags a workspace at 80% so they can act before being blocked', async () => {
    const under = await getLimitUsage(workspace({ maxUsers: 10 }), { maxUsers: 7 });
    const at = await getLimitUsage(workspace({ maxUsers: 10 }), { maxUsers: 8 });
    expect(under.maxUsers.nearLimit).toBe(false);
    expect(at.maxUsers.nearLimit).toBe(true);
  });

  it('never reports negative headroom for a workspace over its cap', async () => {
    // Happens legitimately after a downgrade; the number should read 0, not -5.
    const usage = await getLimitUsage(workspace({ maxUsers: 10 }), { maxUsers: 15 });
    expect(usage.maxUsers.remaining).toBe(0);
    expect(usage.maxUsers.used).toBe(15);
  });

  it('marks an unlimited plan as such rather than as zero remaining', async () => {
    const usage = await getLimitUsage(workspace({ maxUsers: 0 }), { maxUsers: 500 });
    expect(usage.maxUsers).toMatchObject({ unlimited: true, cap: null, remaining: null });
  });

  it('omits limits it has no count for', async () => {
    const usage = await getLimitUsage(workspace({ maxUsers: 25, maxStorageMb: 5120 }), { maxUsers: 3 });
    expect(usage.maxUsers).toBeDefined();
    expect(usage.maxStorageMb).toBeUndefined();
  });
});

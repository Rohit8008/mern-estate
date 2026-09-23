/**
 * Creating a new workspace.
 *
 * One function, used by both the platform API and the CLI, so a workspace
 * created by a script is identical to one created through the console. A new
 * agency needs more than a Tenant row — without roles it has no permissions
 * model, without an admin nobody can sign in, and without categories the
 * property form has nothing to offer. Getting any of those wrong leaves a
 * workspace that exists but cannot be used, which is worse than one that
 * failed outright.
 *
 * ── On atomicity ──────────────────────────────────────────────────────────────
 * This spans several collections, which a MongoDB transaction would cover — but
 * transactions need a replica set, and a single-node deployment (which is what
 * this runs on today) cannot start one. So `provisionTenant` compensates
 * instead: it records what it created and unwinds it if a later step throws.
 * That is weaker than a transaction under a crash, but it is honest about the
 * failure mode and works on every deployment. If this moves to a replica set,
 * wrapping the whole thing in a session is a small change and worth making.
 */

import Tenant from '../models/tenant.model.js';
// Imported as well as re-exported: `export ... from` forwards the binding
// without introducing it into this module's own scope, and line 199 uses it.
import { PLANS, limitsForPlan } from './plans.js';
import Listing from '../models/listing.model.js';
import User from '../models/user.model.js';
import Role from '../models/role.model.js';
import Category from '../models/category.model.js';
import { runWithTenant, runWithoutTenantScope } from './tenantContext.js';
import { invalidateTenantCache } from './resolveTenant.js';
import { attachInvite, sendInviteEmail, inviteUrl } from './invites.js';
import { logger } from '../utils/logger.js';
import { ValidationError, ConflictError } from '../utils/error.js';

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

/**
 * Slugs that must not become a workspace, because they would collide with the
 * platform's own hostnames once subdomain routing is on. Kept in step with
 * RESERVED_SUBDOMAINS in resolveTenant.js.
 */
const RESERVED_SLUGS = new Set([
  'www', 'app', 'api', 'admin', 'auth', 'static', 'cdn', 'assets', 'localhost',
  'mail', 'smtp', 'ftp', 'blog', 'help', 'support', 'status', 'docs', 'platform',
  'billing', 'account', 'accounts', 'login', 'signup', 'test', 'staging', 'demo',
]);

/**
 * The roles every workspace starts with.
 *
 * Deliberately a small set: an agency can add their own, and five starter roles
 * they have to read through is worse onboarding than two they understand.
 */
const STARTER_ROLES = [
  {
    name: 'Super Admin',
    description: 'Full access to everything in this workspace.',
    isSystem: true,
    permissions: {
      createUser: true, updateUser: true, deleteUser: true, viewUsers: true,
      createClient: true, updateClient: true, deleteClient: true, viewClients: true,
      createOwner: true, updateOwner: true, deleteOwner: true, viewOwners: true, toggleOwnerActive: true,
      createListing: true, updateListing: true, deleteListing: true, viewListings: true, publishListing: true,
      createCategory: true, updateCategory: true, deleteCategory: true, viewCategories: true,
      viewMessages: true, sendMessages: true, deleteMessages: true,
      createBuyerRequirement: true, updateBuyerRequirement: true, deleteBuyerRequirement: true, viewBuyerRequirements: true,
      uploadFiles: true, viewAnalytics: true, exportData: true,
      manageRoles: true, systemSettings: true, viewLogs: true,
    },
  },
  {
    name: 'Employee',
    description: 'Day-to-day access: read most things, create and edit their own work.',
    isSystem: true,
    permissions: {
      viewUsers: false,
      createClient: true, updateClient: true, viewClients: true,
      createOwner: true, updateOwner: true, viewOwners: true,
      createListing: true, updateListing: true, viewListings: true,
      viewCategories: true,
      viewMessages: true, sendMessages: true,
      createBuyerRequirement: true, updateBuyerRequirement: true, viewBuyerRequirements: true,
      uploadFiles: true, viewAnalytics: true,
    },
  },
  {
    name: 'Viewer',
    description: 'Read-only. For accountants, auditors and anyone who should not edit.',
    isSystem: false,
    permissions: {
      viewClients: true, viewOwners: true, viewListings: true,
      viewCategories: true, viewBuyerRequirements: true, viewAnalytics: true,
    },
  },
];

/** A starter category so the property form is usable on day one. */
const STARTER_CATEGORIES = [
  {
    name: 'Residential Plots',
    slug: 'residential-plots',
    fields: [
      { key: 'plotSize', label: 'Plot size', type: 'text', order: 1, placeholder: '30x50' },
      { key: 'sqYard', label: 'Sq yard', type: 'number', order: 2, unit: 'sq yd' },
      { key: 'rateSqYard', label: 'Rate per sq yard', type: 'number', order: 3, unit: '₹' },
      { key: 'facing', label: 'Facing', type: 'select', order: 4,
        options: ['East', 'West', 'North', 'South', 'North-East', 'North-West', 'South-East', 'South-West'] },
      { key: 'cornerPlot', label: 'Corner plot', type: 'boolean', order: 5 },
    ],
  },
];

/**
 * Plan limits live in `plans.js`, which is the single source for what a plan
 * includes — its limits, its label and its price. Re-exported here because this
 * module was where they used to live and callers still import them from it.
 *
 * `0` means unlimited. A workspace's stored `limits` still wins, so an operator
 * can grant a bespoke allowance without inventing a plan for one customer.
 */
export { limitsForPlan };

/** @deprecated Read `PLANS` from `plans.js` instead — it carries prices too. */
export const PLAN_LIMITS = Object.fromEntries(
  Object.entries(PLANS).map(([name, spec]) => [name, { ...spec.limits }])
);

export function normalizeSlug(input) {
  return String(input || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export async function validateSlug(slug) {
  if (!slug) throw new ValidationError('A workspace address is required.', 'slug');
  if (!SLUG_PATTERN.test(slug)) {
    throw new ValidationError(
      'The workspace address must be 3-40 characters of lowercase letters, digits and hyphens, starting and ending with a letter or digit.',
      'slug'
    );
  }
  if (RESERVED_SLUGS.has(slug)) {
    throw new ValidationError(`"${slug}" is reserved by the platform. Choose another address.`, 'slug');
  }
  const existing = await runWithoutTenantScope('checking a workspace address is free', () =>
    Tenant.findOne({ slug }).select('_id')
  );
  if (existing) throw new ConflictError(`The address "${slug}" is already taken.`);
}

/**
 * Create a workspace, ready to sign in to.
 *
 * @param {object}  input
 * @param {string}  input.name           the agency's name
 * @param {string}  input.slug           subdomain identity
 * @param {string}  input.adminEmail     who receives the first admin account
 * @param {string} [input.adminName]
 * @param {string} [input.adminPassword] omit to create the account without one,
 *                 so the admin must set it through password reset — which is
 *                 the right default, since a password chosen by the vendor and
 *                 emailed around is a password everyone keeps using
 * @param {string} [input.plan]
 * @param {number} [input.trialDays]
 * @param {object} [input.branding]
 * @param {object} [input.locale]
 * @param {object} [input.features]      screen id -> false, to switch things off
 * @param {boolean}[input.seedSampleData] add a starter category
 * @returns {Promise<{tenant: object, adminUser: object, created: object}>}
 */
export async function provisionTenant(input = {}) {
  let inviteToken = null;
  const slug = normalizeSlug(input.slug || input.name);
  const name = String(input.name || '').trim();
  const adminEmail = String(input.adminEmail || '').trim().toLowerCase();

  if (!name) throw new ValidationError('The workspace needs a name.', 'name');
  if (!adminEmail) throw new ValidationError('An admin email address is required.', 'adminEmail');
  await validateSlug(slug);

  // Everything created, in the order it was created — unwound in reverse if a
  // later step fails.
  const created = { tenantId: null, roleIds: [], categoryIds: [], userIds: [] };

  try {
    // ── 1. the tenant itself ────────────────────────────────────────────────
    const trialDays = Number.isFinite(input.trialDays) ? input.trialDays : 14;
    const plan = input.plan || 'trial';

    const tenant = await runWithoutTenantScope('creating a new workspace', () =>
      Tenant.create({
        name,
        slug,
        status: plan === 'trial' ? 'trial' : 'active',
        plan,
        trialEndsAt: plan === 'trial' ? new Date(Date.now() + trialDays * 86400000) : null,
        limits: { ...limitsForPlan(plan), ...(input.limits || {}) },
        branding: { productName: name, ...(input.branding || {}) },
        locale: input.locale || {},
        features: new Map(Object.entries(input.features || {})),
        billingEmail: adminEmail,
      })
    );
    created.tenantId = tenant._id;

    // Everything below belongs to the new workspace, so it runs in its context
    // and is scoped by the plugin like any other write.
    const tenantId = String(tenant._id);

    // ── 2. roles ────────────────────────────────────────────────────────────
    // Deep-cloned: these templates are module-level constants reused by every
    // provision, and handing the same objects to Mongoose twice is how the
    // second workspace ends up carrying the first one's ids.
    const roles = await runWithTenant({ tenantId }, () =>
      Role.insertMany(structuredClone(STARTER_ROLES))
    );
    created.roleIds = roles.map((r) => r._id);
    const superAdminRole = roles.find((r) => r.name === 'Super Admin');

    // ── 3. the first admin ──────────────────────────────────────────────────
    // A workspace with no way in is not provisioned, it is just a row.
    const adminUser = await runWithTenant({ tenantId }, async () => {
      const user = new User({
        username: input.adminName || adminEmail.split('@')[0],
        email: adminEmail,
        role: 'admin',
        status: 'active',
        assignedRole: superAdminRole?._id,
      });
      // The model's pre-save hook hashes this; assigning a hash here would
      // double-hash it and lock the account out.
      if (input.adminPassword) user.password = input.adminPassword;
      // No password means an invitation, minted here so the workspace is never
      // left with an account nobody can get into. Without this the admin's only
      // route in was password reset — which needs them to already know their
      // subdomain, which is the one thing a new customer does not know.
      else inviteToken = attachInvite(user);
      await user.save({ validateBeforeSave: true });
      return user;
    });
    created.userIds = [adminUser._id];

    // ── 4. a starter category ───────────────────────────────────────────────
    if (input.seedSampleData !== false) {
      const categories = await runWithTenant({ tenantId }, () =>
        Category.insertMany(structuredClone(STARTER_CATEGORIES))
      );
      created.categoryIds = categories.map((c) => c._id);
    }

    invalidateTenantCache(tenant);
    logger.info('Workspace provisioned', {
      tenantId,
      slug,
      plan,
      adminEmail,
      roles: created.roleIds.length,
      categories: created.categoryIds.length,
    });

    // Delivery is attempted but never allowed to fail the provision: the
    // workspace exists and the token is stored, so a mail outage costs the
    // operator a copy-paste, not a rollback.
    let invite = null;
    if (inviteToken) {
      invite = await sendInviteEmail({
        to: adminEmail,
        token: inviteToken,
        tenant,
        inviterName: input.invitedByName,
        role: 'admin',
        recipientName: input.adminName || '',
        expiresAt: adminUser.inviteExpiresAt,
      }).catch((err) => {
        logger.warn('Invite email threw during provisioning', { adminEmail, error: err.message });
        return { sent: false, url: inviteUrl(inviteToken, tenant) };
      });
    }

    return {
      tenant,
      adminUser,
      created,
      needsPasswordSetup: !input.adminPassword,
      // The raw link, returned once so the operator can pass it on if the
      // email did not arrive. Never logged.
      invite: invite ? { sent: Boolean(invite.sent), url: invite.url } : null,
    };
  } catch (err) {
    await rollback(created, err);
    throw err;
  }
}

/**
 * Undo a partial provision.
 *
 * Deletes rather than soft-deletes: this workspace never existed as far as
 * anyone outside is concerned, and leaving a soft-deleted shell behind would
 * hold its slug hostage — the operator's obvious next move is to fix the input
 * and retry with the same address.
 */
async function rollback(created, cause) {
  if (!created.tenantId) return;

  logger.error('Workspace provisioning failed — rolling back', {
    tenantId: String(created.tenantId),
    reason: cause?.message,
  });

  const tenantId = String(created.tenantId);
  try {
    await runWithTenant({ tenantId }, async () => {
      if (created.userIds.length) await User.deleteMany({ _id: { $in: created.userIds } });
      if (created.categoryIds.length) await Category.deleteMany({ _id: { $in: created.categoryIds } });
      if (created.roleIds.length) await Role.deleteMany({ _id: { $in: created.roleIds } });
    });
    await runWithoutTenantScope('rolling back a failed workspace provision', () =>
      Tenant.deleteOne({ _id: created.tenantId })
    );
    invalidateTenantCache();
  } catch (cleanupErr) {
    // Surfaced loudly: a half-provisioned workspace holds a slug and needs a
    // human. Swallowing this would leave it invisible.
    logger.error('Rollback of a failed provision did not complete', {
      tenantId,
      reason: cleanupErr.message,
      originalError: cause?.message,
    });
  }
}

/**
 * Counts for one workspace, for the platform console.
 * Runs inside the tenant so the plugin scopes it, rather than trusting a
 * hand-written filter.
 */
export async function getTenantUsage(tenant) {
  const tenantId = String(tenant._id);
  return runWithTenant({ tenantId }, async () => {
    const [users, listings, categories] = await Promise.all([
      User.countDocuments({ isDeleted: { $ne: true } }),
      Listing.countDocuments({ isDeleted: { $ne: true } }),
      Category.countDocuments({ isDeleted: { $ne: true } }),
    ]);
    return { users, listings, categories };
  });
}

export { STARTER_ROLES, STARTER_CATEGORIES, RESERVED_SLUGS };

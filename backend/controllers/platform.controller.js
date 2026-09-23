/**
 * Platform operations — the vendor's own console for running workspaces.
 *
 * Every handler here is cross-tenant by nature, which is exactly the code that
 * must be most careful. Two habits keep it honest:
 *   • reads of the global Tenant collection say why they are unscoped
 *   • anything that touches an agency's own data goes through
 *     `runWithTenant`, so the plugin scopes it rather than a hand-written filter
 *
 * Guarded by `requirePlatformAdmin` — never by `role: 'admin'`, which is an
 * admin of one agency.
 */

import Tenant from '../models/tenant.model.js';
import User from '../models/user.model.js';
import {
  asyncHandler,
  sendSuccessResponse,
  ValidationError,
  NotFoundError,
} from '../utils/error.js';
import { logger } from '../utils/logger.js';
import { runWithoutTenantScope, runWithTenant } from '../tenancy/tenantContext.js';
import { invalidateTenantCache } from '../tenancy/resolveTenant.js';
import { reissueSession } from './auth.controller.js';
import { attachInvite, sendInviteEmail } from '../tenancy/invites.js';
import {
  provisionTenant,
  getTenantUsage,
  normalizeSlug,
  validateSlug,
  limitsForPlan,
} from '../tenancy/provisionTenant.js';

const UNSCOPED = 'platform console: administering every workspace';

// ─── POST /api/platform/tenants ───────────────────────────────────────────────

/**
 * Onboard an agency.
 *
 * @body name, slug, adminEmail, adminName, adminPassword?, plan, trialDays,
 *       branding, locale, features, seedSampleData
 */
export const createTenant = asyncHandler(async (req, res) => {
  const result = await provisionTenant({
    name: req.body.name,
    slug: req.body.slug,
    adminEmail: req.body.adminEmail,
    adminName: req.body.adminName,
    adminPassword: req.body.adminPassword,
    plan: req.body.plan,
    trialDays: req.body.trialDays,
    branding: req.body.branding,
    locale: req.body.locale,
    features: req.body.features,
    seedSampleData: req.body.seedSampleData,
    invitedByName: req.platformAdmin?.name,
  });

  logger.info('Workspace provisioned via platform API', {
    slug: result.tenant.slug,
    by: req.platformAdmin?.email,
  });

  sendSuccessResponse(
    res,
    {
      tenant: result.tenant.toPublicConfig(),
      admin: {
        id: String(result.adminUser._id),
        email: result.adminUser.email,
        username: result.adminUser.username,
      },
      // When no password was supplied the admin is invited instead, which is
      // the default and the better one — a password chosen by the vendor and
      // emailed around is a password everybody keeps using.
      needsPasswordSetup: result.needsPasswordSetup,
      // Whether the invitation actually went out, and the link itself so the
      // operator can pass it on when mail is down. Returned once, never logged.
      invite: result.invite,
      signInUrl: `/sign-in?workspace=${result.tenant.slug}`,
    },
    `Workspace "${result.tenant.name}" is ready`,
    201
  );
});

// ─── GET /api/platform/tenants ────────────────────────────────────────────────

export const listTenants = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const skip = Math.max(parseInt(req.query.skip, 10) || 0, 0);

  const filter = { isDeleted: { $ne: true } };
  if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;
  if (req.query.q) {
    const term = String(req.query.q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { name: { $regex: term, $options: 'i' } },
      { slug: { $regex: term, $options: 'i' } },
      { billingEmail: { $regex: term, $options: 'i' } },
    ];
  }

  const [tenants, total] = await runWithoutTenantScope(UNSCOPED, () =>
    Promise.all([
      Tenant.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Tenant.countDocuments(filter),
    ])
  );

  // Usage counts are per workspace, so each one runs inside its own context.
  // Sequential rather than parallel: this is an operator screen, not a hot
  // path, and a fan-out of countDocuments across every tenant is how a console
  // quietly becomes the most expensive query in the system.
  const rows = [];
  for (const tenant of tenants) {
    const usage = await getTenantUsage(tenant);
    rows.push({
      id: String(tenant._id),
      name: tenant.name,
      slug: tenant.slug,
      customDomain: tenant.customDomain || null,
      status: tenant.status,
      plan: tenant.plan,
      trialEndsAt: tenant.trialEndsAt,
      billingEmail: tenant.billingEmail,
      createdAt: tenant.createdAt,
      usage,
      limits: tenant.limits,
    });
  }

  sendSuccessResponse(res, { tenants: rows, total, limit, skip }, 'Workspaces');
});

// ─── GET /api/platform/tenants/:id ────────────────────────────────────────────

export const getTenant = asyncHandler(async (req, res) => {
  const tenant = await runWithoutTenantScope(UNSCOPED, () => Tenant.findById(req.params.id));
  if (!tenant || tenant.isDeleted) throw new NotFoundError('Workspace not found.');

  const usage = await getTenantUsage(tenant);
  const admins = await runWithTenant({ tenantId: String(tenant._id) }, () =>
    User.find({ role: 'admin', isDeleted: { $ne: true } })
      .select('username email status lastLogin')
      .limit(10)
      .lean()
  );

  sendSuccessResponse(
    res,
    { tenant: tenant.toObject(), usage, admins },
    'Workspace'
  );
});

// ─── PATCH /api/platform/tenants/:id ──────────────────────────────────────────

/** Fields only a platform operator can change. */
const PLATFORM_EDITABLE = [
  'name', 'plan', 'status', 'trialEndsAt', 'limits', 'features',
  'customDomain', 'billingEmail', 'internalNotes',
];

export const updateTenant = asyncHandler(async (req, res) => {
  const tenant = await runWithoutTenantScope(UNSCOPED, () => Tenant.findById(req.params.id));
  if (!tenant || tenant.isDeleted) throw new NotFoundError('Workspace not found.');

  const attempted = Object.keys(req.body || {});
  const unknown = attempted.filter((k) => !PLATFORM_EDITABLE.includes(k));
  if (unknown.length) {
    throw new ValidationError(
      `${unknown.join(', ')} cannot be changed here. Branding and locale belong to the workspace's own admin.`,
      unknown[0]
    );
  }

  // The slug is the workspace's address and is baked into every signed session
  // token; changing it would strand everyone currently signed in. Renaming a
  // workspace changes `name`, never `slug`.
  if (req.body.customDomain !== undefined) {
    const domain = String(req.body.customDomain || '').trim().toLowerCase();
    if (domain) {
      const clash = await runWithoutTenantScope(UNSCOPED, () =>
        Tenant.findOne({ customDomain: domain, _id: { $ne: tenant._id } }).select('_id slug')
      );
      if (clash) throw new ValidationError(`${domain} already points at "${clash.slug}".`, 'customDomain');
    }
    tenant.customDomain = domain;
  }

  // A plan change restates the allowances that come with it — otherwise an
  // upgrade would be a price change with no more capacity, which is the one
  // thing the customer is actually buying. An explicit `limits` in the same
  // request still wins, so a bespoke allowance survives.
  const planChanged = req.body.plan !== undefined && req.body.plan !== tenant.plan;

  ['name', 'plan', 'status', 'trialEndsAt', 'billingEmail', 'internalNotes'].forEach((key) => {
    if (req.body[key] !== undefined) tenant[key] = req.body[key];
  });

  if (planChanged) tenant.set('limits', limitsForPlan(tenant.plan));
  if (req.body.limits) tenant.set('limits', { ...tenant.limits.toObject(), ...req.body.limits });
  if (req.body.features) {
    Object.entries(req.body.features).forEach(([id, on]) => {
      if (on === true) tenant.features.delete(id);
      else tenant.features.set(id, false);
    });
  }

  await tenant.save();
  invalidateTenantCache(tenant);

  logger.info('Workspace updated by platform operator', {
    slug: tenant.slug,
    fields: attempted,
    by: req.platformAdmin?.email,
  });

  sendSuccessResponse(res, tenant.toObject(), 'Workspace updated');
});

// ─── POST /api/platform/tenants/:id/suspend | /resume ─────────────────────────

/**
 * Suspending stops the workspace serving immediately — `resolveTenant` refuses
 * every request with a message their users can act on. Nothing is deleted, so
 * resuming restores the workspace exactly as it was; this is for non-payment,
 * not for offboarding.
 */
export const setTenantStatus = asyncHandler(async (req, res) => {
  const suspend = req.path.endsWith('/suspend');
  const tenant = await runWithoutTenantScope(UNSCOPED, () => Tenant.findById(req.params.id));
  if (!tenant || tenant.isDeleted) throw new NotFoundError('Workspace not found.');

  if (suspend && tenant.status === 'suspended') {
    throw new ValidationError('That workspace is already suspended.', 'status');
  }

  tenant.status = suspend ? 'suspended' : 'active';
  if (!suspend) tenant.trialEndsAt = null; // resuming ends any expired trial gate
  if (req.body?.reason) {
    tenant.internalNotes = `${new Date().toISOString().slice(0, 10)} ${suspend ? 'Suspended' : 'Resumed'}: ${req.body.reason}\n${tenant.internalNotes || ''}`.slice(0, 2000);
  }
  await tenant.save();
  invalidateTenantCache(tenant);

  logger.security?.(suspend ? 'tenant_suspended' : 'tenant_resumed', {
    slug: tenant.slug,
    by: req.platformAdmin?.email,
    reason: req.body?.reason,
  });

  sendSuccessResponse(
    res,
    { id: String(tenant._id), slug: tenant.slug, status: tenant.status },
    suspend ? `"${tenant.name}" is suspended` : `"${tenant.name}" is active again`
  );
});

// ─── GET /api/platform/tenants/check-slug?slug=… ──────────────────────────────

/** Live availability check for the provisioning form. */
export const checkSlug = asyncHandler(async (req, res) => {
  const slug = normalizeSlug(req.query.slug);
  try {
    await validateSlug(slug);
    sendSuccessResponse(res, { slug, available: true }, 'Available');
  } catch (err) {
    sendSuccessResponse(res, { slug, available: false, reason: err.message }, 'Not available');
  }
});

// ─── GET /api/platform/summary ────────────────────────────────────────────────

export const getPlatformSummary = asyncHandler(async (req, res) => {
  const byStatus = await runWithoutTenantScope(UNSCOPED, () =>
    Tenant.aggregate([
      { $match: { isDeleted: { $ne: true } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ])
  );

  const expiringTrials = await runWithoutTenantScope(UNSCOPED, () =>
    Tenant.find({
      isDeleted: { $ne: true },
      status: 'trial',
      trialEndsAt: { $gte: new Date(), $lte: new Date(Date.now() + 7 * 86400000) },
    })
      .select('name slug trialEndsAt billingEmail')
      .sort({ trialEndsAt: 1 })
      .limit(20)
  );

  sendSuccessResponse(
    res,
    {
      byStatus: Object.fromEntries(byStatus.map((r) => [r._id, r.count])),
      total: byStatus.reduce((n, r) => n + r.count, 0),
      expiringTrials,
    },
    'Platform summary'
  );
});

// ─── POST /api/platform/act-as/:id ────────────────────────────────────────────

/**
 * Enter a customer's workspace.
 *
 * The operator keeps their own identity — same user, same account, same home
 * workspace — and only the data scope moves. That separation is the whole
 * design: `tid` stays where the account lives so the session can still resolve
 * the person, and `act` carries where they are looking. Collapsing the two
 * would put the operator's identity in a workspace their account is not in,
 * and the next request would fail to find them.
 *
 * The resulting session is read-only (see `readOnlyWhileActing`). Support needs
 * to see what the customer sees; it does not need to edit their records, and an
 * operator who could would be a liability the customer cannot audit.
 */
export const startActingAs = asyncHandler(async (req, res) => {
  const targetId = req.params.id;

  const target = await runWithoutTenantScope(UNSCOPED, () =>
    Tenant.findOne({ _id: targetId, isDeleted: { $ne: true } })
  );
  if (!target) throw new NotFoundError('That workspace does not exist.');

  const homeTenantId = String(req.homeTenantId || req.tenantId);

  if (String(target._id) === homeTenantId) {
    throw new ValidationError('That is already your own workspace.', 'id');
  }

  await reissueSession(res, {
    userId: req.user.id,
    tenantId: homeTenantId,
    // `pa: true` is what makes `act` mean anything. It is set here and only
    // here, after requirePlatformAdmin has re-read the flag from the database.
    extraClaims: { act: String(target._id), pa: true },
    replacing: req.cookies?.refresh_token,
    ip: req.ip,
    userAgent: req.headers['user-agent'] || '',
  });

  // Deliberately loud. Someone from the vendor opening a customer's workspace
  // is the kind of event that should be answerable months later.
  logger.security?.('acting_as_started', {
    operator: req.platformAdmin?.email,
    userId: req.user.id,
    homeTenantId,
    targetTenantId: String(target._id),
    targetSlug: target.slug,
    ip: req.ip,
    userAgent: req.headers['user-agent'] || '',
  });

  sendSuccessResponse(
    res,
    {
      actingAs: {
        tenantId: String(target._id),
        name: target.name,
        slug: target.slug,
        status: target.status,
      },
      readOnly: true,
    },
    `Viewing ${target.name}`
  );
});

// ─── POST /api/platform/stop-acting ───────────────────────────────────────────

/** Return to the operator's own workspace. */
export const stopActingAs = asyncHandler(async (req, res) => {
  const homeTenantId = String(req.homeTenantId || req.tenantId);

  await reissueSession(res, {
    userId: req.user.id,
    tenantId: homeTenantId,
    // No `act`, no `pa` — an ordinary session again.
    replacing: req.cookies?.refresh_token,
    ip: req.ip,
    userAgent: req.headers['user-agent'] || '',
  });

  if (req.actingAs) {
    logger.security?.('acting_as_ended', {
      operator: req.platformAdmin?.email,
      userId: req.user.id,
      targetTenantId: req.actingAs.tenantId,
      ip: req.ip,
    });
  }

  sendSuccessResponse(res, { actingAs: null }, 'Back in your own workspace');
});

// ─── POST /api/platform/tenants/:id/invite ────────────────────────────────────

/**
 * Re-send the first admin's invitation.
 *
 * The case this exists for is mundane and inevitable: the email went to spam,
 * or the link sat unopened past its expiry, and a customer is now locked out of
 * a workspace they are paying for. Without this the only remedy is a database
 * edit.
 *
 * Minting a fresh token invalidates the previous one, because the old hash is
 * overwritten — so a link that leaked stops working the moment a new one is
 * issued, which is the behaviour you want from a "something went wrong, send it
 * again" button.
 */
export const resendTenantInvite = asyncHandler(async (req, res) => {
  const tenant = await runWithoutTenantScope(UNSCOPED, () =>
    Tenant.findOne({ _id: req.params.id, isDeleted: { $ne: true } })
  );
  if (!tenant) throw new NotFoundError('That workspace does not exist.');

  const tenantId = String(tenant._id);

  const admin = await runWithTenant({ tenantId }, () =>
    User.findOne({ role: 'admin', isDeleted: { $ne: true } })
      .select('+inviteTokenHash +inviteExpiresAt +previousInviteTokenHashes')
      .sort({ createdAt: 1 })
  );
  if (!admin) throw new NotFoundError('That workspace has no admin account to invite.');

  const token = attachInvite(admin, { invitedBy: req.user.id });
  await runWithTenant({ tenantId }, () => admin.save({ validateBeforeSave: false }));

  const result = await sendInviteEmail({
    to: admin.email,
    token,
    tenant,
    inviterName: req.platformAdmin?.name,
    role: 'admin',
    recipientName: admin.firstName || admin.username || '',
    expiresAt: admin.inviteExpiresAt,
  });

  logger.security?.('tenant_invite_resent', {
    operator: req.platformAdmin?.email,
    tenantId,
    slug: tenant.slug,
    to: admin.email,
    delivered: result.sent,
    ip: req.ip,
  });

  sendSuccessResponse(
    res,
    {
      to: admin.email,
      sent: Boolean(result.sent),
      // Shown to the operator so they can pass it on when mail is down. This is
      // the only response that ever carries it.
      url: result.url,
    },
    result.sent ? `Invitation sent to ${admin.email}` : 'Invitation created — email could not be sent'
  );
});

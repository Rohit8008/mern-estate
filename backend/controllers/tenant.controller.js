/**
 * Workspace (tenant) configuration.
 *
 * `GET /api/tenant/config` is the equivalent of kpi-dashboard's
 * `/metadata/clientconfig`: one document describing everything the browser
 * needs to render this agency's product — branding tokens, enabled features,
 * locale, pipeline stages. The client fetches it once per session and caches
 * it, so it must stay small and must never carry anything an agency's own users
 * shouldn't see.
 *
 * It is deliberately readable without a session: the login screen needs the
 * logo and colours before anyone has signed in.
 */

import Tenant from '../models/tenant.model.js';
import {
  asyncHandler,
  sendSuccessResponse,
  ValidationError,
  NotFoundError,
  AuthorizationError,
} from '../utils/error.js';
import { invalidateTenantCache } from '../tenancy/resolveTenant.js';
import { runWithoutTenantScope } from '../tenancy/tenantContext.js';
import { logActivity } from '../utils/activity.js';
import { encryptSecret } from '../utils/encryption.js';
import { invalidateMailTransport, verifyMailSettings, mailSource } from '../utils/mailer.js';
import { getLimitUsage } from '../tenancy/limits.js';
import {
  STAGE_CATALOGUE,
  resolveStagesForTenant,
  validateStageSelection,
} from '../tenancy/stageCatalogue.js';
import Listing from '../models/listing.model.js';
import Category from '../models/category.model.js';
import Client from '../models/client.model.js';
import User from '../models/user.model.js';
import {
  SCREEN_SECTIONS,
  isKnownScreen,
  getScreen,
  resolveScreensForTenant,
} from '../tenancy/screenCatalogue.js';

/** Fields an agency's own admin may change about their workspace. */
const TENANT_EDITABLE = ['name', 'branding', 'locale', 'workflow'];

/** Fields only the platform operator may change. */
const PLATFORM_ONLY = ['slug', 'customDomain', 'status', 'plan', 'features', 'limits', 'trialEndsAt', 'internalNotes'];

// ─── GET /api/tenant/config ───────────────────────────────────────────────────

/**
 * GET /api/tenant/lookup — "is this a workspace, and what is it called?"
 *
 * For the Workspace field on the sign-in screen (web and app): the name
 * typed arrives as the x-tenant header, resolveTenant has already answered
 * 404 if it does not exist, so reaching here means it does. Returns only what
 * the sign-in screen shows. Rate limited like sign-in, because a lookup that
 * cannot be hammered is a directory that cannot be scraped.
 */
export const lookupWorkspace = asyncHandler(async (req, res) => {
  const tenant = req.tenant;
  if (!tenant) throw new NotFoundError('No workspace matched this request.');
  if (tenant.status === 'suspended' || tenant.status === 'cancelled') {
    throw new NotFoundError('That workspace is not available.');
  }
  res.setHeader('Cache-Control', 'no-store');
  sendSuccessResponse(res, {
    slug: tenant.slug,
    name: tenant.branding?.productName || tenant.name,
    logoUrl: tenant.branding?.logoUrl || '',
  }, 'Workspace');
});

export const getTenantConfig = asyncHandler(async (req, res) => {
  const tenant = req.tenant;
  if (!tenant) throw new NotFoundError('No workspace matched this request.');

  // `no-cache` rather than `max-age`: the browser may keep this, but it must
  // revalidate before using it. The ETag still saves the payload on a repeat
  // load — the server answers 304 — so the only thing given up is a round trip.
  //
  // A freshness window is what makes this URL dangerous. It answers for
  // whichever workspace the cookie names, and that can change between two
  // requests to the same URL: a platform operator entering or leaving a
  // customer's workspace. With `max-age=60` the browser served the PREVIOUS
  // workspace's name, colours and menu for up to a minute after the switch,
  // and no header sent afterwards could take that back — a response already in
  // the cache is already wrong. Revalidating every time is the only version of
  // this that cannot go stale across a switch.
  const version = `W/"${tenant._id}-${tenant.updatedAt?.getTime() || 0}-${req.actingAs ? 'act' : 'own'}"`;
  res.setHeader('Cache-Control', 'private, no-cache');
  res.setHeader('ETag', version);
  if (req.headers['if-none-match'] === version) return res.status(304).end();

  sendSuccessResponse(
    res,
    {
      ...tenant.toPublicConfig(),
      // Bundled rather than a second request: the shell cannot draw its menu
      // without this, so splitting it would put a round trip in front of the
      // first paint of every page.
      sections: SCREEN_SECTIONS,
      screens: resolveScreensForTenant(tenant),
      // The pipeline board cannot draw its columns without this, so it travels
      // with the rest of the workspace config rather than in its own request.
      dealStages: resolveStagesForTenant(tenant),
      // Present only when a platform operator is looking in from outside this
      // workspace. The shell needs it to say so plainly and to offer the way
      // back out.
      actingAs: req.actingAs || null,
    },
    'Workspace configuration'
  );
});

// ─── PATCH /api/tenant/config ─────────────────────────────────────────────────

/**
 * An agency admin editing their own workspace. Platform-only fields are
 * rejected rather than silently dropped, so an admin who tries to lift their
 * own plan or feature flags gets told no instead of wondering why it didn't
 * take.
 */
export const updateTenantConfig = asyncHandler(async (req, res) => {
  if (req.user?.role !== 'admin') {
    throw new AuthorizationError('Only a workspace admin can change these settings.');
  }

  const attempted = Object.keys(req.body || {});
  const forbidden = attempted.filter((k) => PLATFORM_ONLY.includes(k));
  if (forbidden.length) {
    throw new AuthorizationError(
      `${forbidden.join(', ')} ${forbidden.length > 1 ? 'are' : 'is'} managed by the platform and cannot be changed here.`
    );
  }

  const unknown = attempted.filter((k) => !TENANT_EDITABLE.includes(k));
  if (unknown.length) {
    throw new ValidationError(`Unknown setting: ${unknown.join(', ')}`, unknown[0]);
  }

  const tenant = await runWithoutTenantScope(
    'loading the caller\'s own workspace record, which lives in the global tenant collection',
    () => Tenant.findById(req.tenantId)
  );
  if (!tenant) throw new NotFoundError('Workspace not found.');

  TENANT_EDITABLE.forEach((key) => {
    if (req.body[key] === undefined) return;
    // Merge rather than replace: a client sending only `branding.tokens.brand`
    // must not wipe the logo it didn't send.
    if (key === 'name') tenant.name = req.body.name;
    else tenant.set(key, { ...(tenant[key]?.toObject?.() ?? tenant[key] ?? {}), ...req.body[key] });
  });
  if (req.body.name !== undefined || req.body.branding !== undefined) {
    tenant.set('branding.customizedAt', new Date());
  }

  await tenant.save();
  invalidateTenantCache(tenant);

  logActivity({
    entityType: 'tenant',
    entityId: tenant._id,
    action: 'updated',
    message: `Workspace settings updated (${attempted.join(', ')})`,
    meta: { fields: attempted },
    createdBy: req.user.id,
  }).catch(() => {});

  sendSuccessResponse(res, tenant.toPublicConfig(), 'Workspace updated');
});

// ─── Onboarding ───────────────────────────────────────────────────────────────

/**
 * What a new workspace still has to do.
 *
 * Progress is derived from the data rather than from stored "step 3 complete"
 * flags. A checklist backed by flags drifts the moment someone does the thing
 * outside the wizard — invites a colleague from the admin screen, say — and
 * then nags about work that is already done.
 *
 * Dismissal IS stored, because "I know, stop showing me" is a preference and
 * cannot be derived from anything.
 */
export const getOnboarding = asyncHandler(async (req, res) => {
  const tenant = await runWithoutTenantScope(
    "loading the caller's own workspace record, which lives in the global tenant collection",
    () => Tenant.findById(req.tenantId)
  );
  if (!tenant) throw new NotFoundError('Workspace not found.');

  const [teamCount, categoryCount, listingCount, clientCount] = await Promise.all([
    User.countDocuments({ isDeleted: { $ne: true }, status: 'active' }),
    Category.countDocuments({ isDeleted: { $ne: true } }),
    Listing.countDocuments({ isDeleted: { $ne: true } }),
    Client.countDocuments({ isDeleted: { $ne: true } }),
  ]);

  // Done once the agency has saved its branding, or has a logo or its own
  // product name. Comparing only the name to 'Real Vista' left the step open
  // for an agency whose product IS Real Vista, however much it had set up.
  const brandedName = Boolean(
    tenant.branding?.customizedAt ||
    (tenant.branding?.productName && tenant.branding.productName !== 'Real Vista')
  );
  const hasLogo = Boolean(tenant.branding?.logoUrl);

  const steps = [
    {
      id: 'workspace',
      label: 'Set up your agency',
      description: 'Your name, logo and colours',
      done: brandedName || hasLogo,
      href: '/settings?section=branding',
    },
    {
      id: 'team',
      label: 'Invite your team',
      description: 'Add the people who will use this',
      done: teamCount > 1,
      href: '/admin',
    },
    {
      id: 'categories',
      label: 'Set up property categories',
      description: 'What kinds of property you deal in',
      done: categoryCount > 0,
      href: '/categories',
    },
    {
      id: 'properties',
      label: 'Add your first property',
      description: 'Type one in, or import a spreadsheet',
      done: listingCount > 0,
      href: '/create-listing',
    },
    {
      id: 'clients',
      label: 'Add your first client',
      description: 'Start tracking leads and deals',
      done: clientCount > 0,
      href: '/clients',
    },
  ];

  const complete = steps.filter((s) => s.done).length;

  sendSuccessResponse(
    res,
    {
      steps,
      complete,
      total: steps.length,
      dismissed: Boolean(tenant.settings?.onboardingDismissed),
      // Stop offering it once everything is done, even if never dismissed.
      show: !tenant.settings?.onboardingDismissed && complete < steps.length,
    },
    'Onboarding progress'
  );
});

export const dismissOnboarding = asyncHandler(async (req, res) => {
  if (req.user?.role !== 'admin') {
    throw new AuthorizationError('Only a workspace admin can dismiss this.');
  }

  await runWithoutTenantScope('recording an onboarding dismissal by workspace id', () =>
    Tenant.updateOne({ _id: req.tenantId }, { $set: { 'settings.onboardingDismissed': true } })
  );

  const tenant = await runWithoutTenantScope('reloading the workspace to refresh its cache', () =>
    Tenant.findById(req.tenantId)
  );
  if (tenant) invalidateTenantCache(tenant);

  sendSuccessResponse(res, { dismissed: true }, 'Dismissed');
});

// ─── Workspace mail settings ──────────────────────────────────────────────────

/**
 * The workspace's own SMTP settings.
 *
 * Mail used to come from one set of process-env credentials for the whole
 * deployment, so every agency's notifications arrived from the vendor's
 * address. A workspace that configures this sends as itself; one that does not
 * falls back to the platform transport.
 *
 * The password is never returned — `hasPassword` says whether one is stored.
 */
export const getMailSettings = asyncHandler(async (req, res) => {
  if (req.user?.role !== 'admin') {
    throw new AuthorizationError('Only a workspace admin can see these settings.');
  }

  const tenant = await runWithoutTenantScope(
    "loading the caller's own workspace record, which lives in the global tenant collection",
    () => Tenant.findById(req.tenantId)
  );
  if (!tenant) throw new NotFoundError('Workspace not found.');

  sendSuccessResponse(
    res,
    { ...tenant.toMailConfig(), effectiveSource: await mailSource(req.tenantId) },
    'Mail settings'
  );
});

export const updateMailSettings = asyncHandler(async (req, res) => {
  if (req.user?.role !== 'admin') {
    throw new AuthorizationError('Only a workspace admin can change these settings.');
  }

  const { enabled, host, port, secure, user, password, from, fromName } = req.body || {};

  const tenant = await runWithoutTenantScope(
    "loading the caller's own workspace record, which lives in the global tenant collection",
    () => Tenant.findById(req.tenantId).select('+mail.passEncrypted')
  );
  if (!tenant) throw new NotFoundError('Workspace not found.');

  const mail = tenant.mail || {};

  if (enabled !== undefined) mail.enabled = Boolean(enabled);
  if (host !== undefined) mail.host = String(host).trim();
  if (port !== undefined) mail.port = Number(port) || 587;
  if (secure !== undefined) mail.secure = Boolean(secure);
  if (user !== undefined) mail.user = String(user).trim();
  if (from !== undefined) mail.from = String(from).trim();
  if (fromName !== undefined) mail.fromName = String(fromName).trim();

  // An empty password means "leave the stored one alone" — the form cannot
  // show it back, so an admin editing the port must not have to retype it.
  if (password) mail.passEncrypted = encryptSecret(password);

  if (mail.enabled && (!mail.host || !mail.user || !mail.passEncrypted)) {
    throw new ValidationError('A host, username and password are all needed to send as this workspace.', 'host');
  }

  tenant.mail = mail;
  await tenant.save();

  // The transport is cached per workspace, so a saved change has to drop it.
  invalidateMailTransport(req.tenantId);
  invalidateTenantCache(tenant);

  logActivity({
    entityType: 'tenant',
    entityId: tenant._id,
    action: 'mail_settings_updated',
    message: 'Workspace mail settings updated',
    meta: { enabled: mail.enabled, host: mail.host },
    createdBy: req.user.id,
  }).catch(() => {});

  sendSuccessResponse(res, tenant.toMailConfig(), 'Mail settings saved');
});

/**
 * Prove the settings work.
 *
 * `verify()` opens the connection and authenticates without sending anything,
 * which is what tells "wrong password" apart from "we sent it, check spam".
 */
export const verifyMailSettingsForTenant = asyncHandler(async (req, res) => {
  if (req.user?.role !== 'admin') {
    throw new AuthorizationError('Only a workspace admin can test these settings.');
  }

  const result = await verifyMailSettings(req.tenantId);

  if (result.ok) {
    await runWithoutTenantScope('recording a successful mail verification', () =>
      Tenant.updateOne({ _id: req.tenantId }, { $set: { 'mail.verifiedAt': new Date() } })
    );
  }

  sendSuccessResponse(res, result, result.ok ? 'Connected successfully' : 'Could not connect');
});

// ─── GET /api/tenant/features ─────────────────────────────────────────────────

/**
 * The enabled feature/screen ids for this workspace. Split from `config` so the
 * client can re-check flags without re-fetching branding, and so a future
 * per-role narrowing has somewhere to live.
 */
export const getTenantFeatures = asyncHandler(async (req, res) => {
  const tenant = req.tenant;
  if (!tenant) throw new NotFoundError('No workspace matched this request.');
  sendSuccessResponse(
    res,
    { features: Object.fromEntries(tenant.features || []) },
    'Workspace features'
  );
});


// ─── GET /api/tenant/screens ──────────────────────────────────────────────────

/**
 * The full catalogue with this workspace's choices — what an admin sees on the
 * screen-picker. Unlike `/config`, it includes screens that are switched OFF,
 * which is the whole point of a picker.
 */
export const getScreenCatalogue = asyncHandler(async (req, res) => {
  if (req.user?.role !== 'admin') {
    throw new AuthorizationError('Only a workspace admin can see the screen catalogue.');
  }
  sendSuccessResponse(
    res,
    { sections: SCREEN_SECTIONS, screens: resolveScreensForTenant(req.tenant) },
    'Screen catalogue'
  );
});

// ─── PATCH /api/tenant/screens ────────────────────────────────────────────────

/**
 * Turn screens on and off, and rename them for this workspace.
 *
 * Unknown ids are rejected rather than stored. Accepting them would let a typo
 * sit in the database looking like a disabled feature, and would let the flags
 * map grow into a junk drawer nobody dares clean out.
 *
 * @body screens {Object<string, boolean>} id -> enabled
 * @body labels  {Object<string, string>}  id -> this workspace's name for it
 */
export const updateScreenSettings = asyncHandler(async (req, res) => {
  if (req.user?.role !== 'admin') {
    throw new AuthorizationError('Only a workspace admin can change which screens are used.');
  }

  const { screens = {}, labels = {} } = req.body || {};

  const unknown = [...Object.keys(screens), ...Object.keys(labels)].filter((id) => !isKnownScreen(id));
  if (unknown.length) {
    throw new ValidationError(`Unknown screen: ${unknown.join(', ')}`, unknown[0]);
  }

  const lockedCore = Object.entries(screens)
    .filter(([id, on]) => on === false && getScreen(id)?.core)
    .map(([id]) => getScreen(id).label);
  if (lockedCore.length) {
    throw new ValidationError(
      `${lockedCore.join(', ')} ${lockedCore.length > 1 ? 'are' : 'is'} part of the core product and cannot be switched off.`,
      'screens'
    );
  }

  const tenant = await runWithoutTenantScope(
    "loading the caller's own workspace record from the global tenant collection",
    () => Tenant.findById(req.tenantId)
  );
  if (!tenant) throw new NotFoundError('Workspace not found.');

  Object.entries(screens).forEach(([id, enabled]) => {
    // A screen set back to its default is deleted rather than stored as `true`,
    // so the map keeps saying only what differs from the product.
    if (enabled) tenant.features.delete(id);
    else tenant.features.set(id, false);
  });

  const navLabels = { ...(tenant.settings?.navLabels || {}) };
  Object.entries(labels).forEach(([id, label]) => {
    const trimmed = String(label || '').trim().slice(0, 40);
    if (!trimmed || trimmed === getScreen(id).label) delete navLabels[id];
    else navLabels[id] = trimmed;
  });
  tenant.settings = { ...(tenant.settings || {}), navLabels };
  tenant.markModified('settings');

  await tenant.save();
  invalidateTenantCache(tenant);

  logActivity({
    entityType: 'tenant',
    entityId: tenant._id,
    action: 'updated',
    message: 'Workspace screens updated',
    meta: { screens, labels },
    createdBy: req.user.id,
  }).catch(() => {});

  sendSuccessResponse(
    res,
    { sections: SCREEN_SECTIONS, screens: resolveScreensForTenant(tenant) },
    'Screens updated'
  );
});


// ─── GET /api/tenant/usage ────────────────────────────────────────────────────

/**
 * What this workspace is using against what its plan allows.
 *
 * Surfaced to the workspace's own admin, not just to the platform operator: a
 * limit discovered at the moment it blocks you is a bad experience even when
 * the number is right. `nearLimit` fires at 80% so there is time to act.
 */
export const getTenantUsage = asyncHandler(async (req, res) => {
  if (req.user?.role !== 'admin') {
    throw new AuthorizationError('Only a workspace admin can see plan usage.');
  }

  const [users, listings] = await Promise.all([
    User.countDocuments({ isDeleted: { $ne: true } }),
    Listing.countDocuments({ isDeleted: { $ne: true } }),
  ]);

  const usage = await getLimitUsage(req.tenant, {
    maxUsers: users,
    maxListings: listings,
  });

  sendSuccessResponse(
    res,
    { plan: req.tenant.plan, status: req.tenant.status, trialEndsAt: req.tenant.trialEndsAt, usage },
    'Plan usage'
  );
});


// ─── GET / PATCH /api/tenant/pipeline ─────────────────────────────────────────

/**
 * The stage catalogue with this workspace's selection — the pipeline editor.
 * Includes stages that are switched off, which is the point of an editor.
 */
export const getPipelineConfig = asyncHandler(async (req, res) => {
  if (req.user?.role !== 'admin') {
    throw new AuthorizationError('Only a workspace admin can change the pipeline.');
  }
  const active = resolveStagesForTenant(req.tenant);
  const activeIds = new Set(active.map((s) => s.id));

  sendSuccessResponse(
    res,
    {
      stages: active,
      available: STAGE_CATALOGUE.filter((s) => !activeIds.has(s.id)).map((s) => ({
        id: s.id,
        label: s.label,
        defaultLabel: s.label,
        color: s.color,
        legacy: Boolean(s.legacy),
        isWon: Boolean(s.isWon),
        isLost: Boolean(s.isLost),
      })),
    },
    'Pipeline'
  );
});

/**
 * Replace the pipeline. The whole ordered list is sent, not a diff — order is
 * the meaning of a pipeline, and patching individual stages would make
 * reordering an awkward sequence of moves rather than one save.
 *
 * @body stages [{ key, label, color }] in the order they should appear
 */
export const updatePipelineConfig = asyncHandler(async (req, res) => {
  if (req.user?.role !== 'admin') {
    throw new AuthorizationError('Only a workspace admin can change the pipeline.');
  }

  let normalized;
  try {
    normalized = validateStageSelection(req.body?.stages);
  } catch (err) {
    throw new ValidationError(err.message, 'stages');
  }

  const tenant = await runWithoutTenantScope(
    "loading the caller's own workspace record from the global tenant collection",
    () => Tenant.findById(req.tenantId)
  );
  if (!tenant) throw new NotFoundError('Workspace not found.');

  tenant.set('workflow.dealStages', normalized);
  await tenant.save();
  invalidateTenantCache(tenant);

  logActivity({
    entityType: 'tenant',
    entityId: tenant._id,
    action: 'updated',
    message: `Pipeline set to ${normalized.length} stages`,
    meta: { stages: normalized.map((s) => s.key) },
    createdBy: req.user.id,
  }).catch(() => {});

  sendSuccessResponse(res, { stages: resolveStagesForTenant(tenant) }, 'Pipeline updated');
});

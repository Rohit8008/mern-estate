/**
 * Sharing properties with people who have no account.
 *
 * The public catalogue is gone; this is what replaced it. An agent picks
 * properties, gets a link, and sends it. Everything else here follows from
 * treating that link as a credential.
 *
 * The one genuinely delicate part is `openShare`: it is the only unauthenticated
 * endpoint that returns property data, so it runs unscoped by necessity — the
 * token is all the caller has, and the tenant is derived from the share record
 * rather than from the request. Every field it returns is chosen explicitly.
 */

import bcryptjs from 'bcryptjs';
import PropertyShare from '../models/propertyShare.model.js';
import Listing from '../models/listing.model.js';
import {
  asyncHandler,
  sendSuccessResponse,
  ValidationError,
  NotFoundError,
  AuthorizationError,
} from '../utils/error.js';
import { logger } from '../utils/logger.js';
import { runWithTenant, runWithoutTenantScope } from '../tenancy/tenantContext.js';
import { listingScope } from '../middleware/permissions.js';

/** 30 days, unless the agent says otherwise. */
const DEFAULT_EXPIRY_DAYS = 30;
const MAX_EXPIRY_DAYS = 365;

/**
 * Exactly what a recipient sees. An allowlist, not a redaction — a new column
 * on Listing must not become visible to the public because someone added it.
 *
 * Deliberately absent: `ownerIds` and owner contacts, `assignedAgent`,
 * `userRef`, `remarks` (internal notes), `voiceNotes`, `attributes` beyond what
 * the category defines, cost and commission fields, and `tenantId`.
 */
function forRecipient(listing, { showPrice }) {
  return {
    id: String(listing._id),
    name: listing.name,
    description: listing.description,
    address: listing.address,
    areaName: listing.areaName,
    locality: listing.locality,
    city: listing.city,
    state: listing.state,
    type: listing.type,
    status: listing.status,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    areaSqFt: listing.areaSqFt,
    sqYard: listing.sqYard,
    plotSize: listing.plotSize,
    furnished: listing.furnished,
    parking: listing.parking,
    imageUrls: listing.imageUrls || [],
    location: listing.location,
    // Withheld when the agent is testing interest before a number is agreed.
    ...(showPrice
      ? { regularPrice: listing.regularPrice, discountPrice: listing.discountPrice, offer: listing.offer }
      : {}),
  };
}

// ─── POST /api/share ──────────────────────────────────────────────────────────

/**
 * Create a share link.
 *
 * The properties are re-read through the caller's own access scope, so an agent
 * cannot share a property they could not otherwise see — a share must not be a
 * way around the permissions that apply everywhere else.
 */
export const createShare = asyncHandler(async (req, res) => {
  const ids = Array.isArray(req.body?.listingIds) ? req.body.listingIds : [];
  if (!ids.length) throw new ValidationError('Choose at least one property to share.', 'listingIds');
  if (ids.length > 50) throw new ValidationError('A link can carry at most 50 properties.', 'listingIds');

  const scope = listingScope(req.user);
  const filter = { _id: { $in: ids }, isDeleted: { $ne: true } };
  const visible = await Listing.find(
    Object.keys(scope).length ? { $and: [filter, scope] } : filter
  ).select('_id');

  if (visible.length !== ids.length) {
    throw new AuthorizationError(
      'Some of those properties are not yours to share. Refresh and try again.'
    );
  }

  const days = req.body.expiryDays === null
    ? null
    : Math.min(Math.max(parseInt(req.body.expiryDays, 10) || DEFAULT_EXPIRY_DAYS, 1), MAX_EXPIRY_DAYS);

  const share = new PropertyShare({
    token: PropertyShare.generateToken(),
    label: req.body.label || '',
    listingIds: visible.map((l) => l._id),
    recipientName: req.body.recipientName || '',
    recipientPhone: req.body.recipientPhone || '',
    message: req.body.message || '',
    showPrice: req.body.showPrice !== false,
    expiresAt: days === null ? null : new Date(Date.now() + days * 86400000),
    createdBy: req.user.id,
  });

  if (req.body.passcode) {
    const passcode = String(req.body.passcode);
    if (passcode.length < 4) throw new ValidationError('A passcode needs at least 4 characters.', 'passcode');
    share.passcodeHash = await bcryptjs.hash(passcode, 10);
  }

  await share.save();

  logger.info('Property share created', {
    token: `${share.token.slice(0, 8)}…`,
    properties: share.listingIds.length,
    expiresAt: share.expiresAt,
    userId: req.user.id,
  });

  sendSuccessResponse(
    res,
    { share: publicShapeForAgent(share), path: `/s/${share.token}` },
    'Share link ready',
    201
  );
});

/** The share as its creator sees it — never the passcode hash. */
function publicShapeForAgent(share) {
  return {
    id: String(share._id),
    token: share.token,
    label: share.label,
    listingIds: share.listingIds.map(String),
    recipientName: share.recipientName,
    recipientPhone: share.recipientPhone,
    message: share.message,
    showPrice: share.showPrice,
    hasPasscode: Boolean(share.passcodeHash),
    expiresAt: share.expiresAt,
    revokedAt: share.revokedAt,
    viewCount: share.viewCount,
    lastViewedAt: share.lastViewedAt,
    createdAt: share.createdAt,
    isLive: share.isLive(),
  };
}

// ─── GET /api/share ───────────────────────────────────────────────────────────

export const listShares = asyncHandler(async (req, res) => {
  // An admin sees the workspace's links; anyone else sees their own. Knowing
  // what has been sent out is an oversight question, and hiding it from the
  // person accountable for it would be the wrong default.
  const filter = req.user.role === 'admin' ? {} : { createdBy: req.user.id };

  // passcodeHash is select:false, so without asking for it every link reported
  // hasPasscode: false. It is only read for that flag, never returned.
  const shares = await PropertyShare.find(filter).select('+passcodeHash').sort({ createdAt: -1 }).limit(200);
  const listingCounts = shares.map((s) => s.listingIds.length);

  sendSuccessResponse(
    res,
    {
      shares: shares.map(publicShapeForAgent),
      totalProperties: listingCounts.reduce((a, b) => a + b, 0),
    },
    'Share links'
  );
});

// ─── POST /api/share/:id/revoke ───────────────────────────────────────────────

export const revokeShare = asyncHandler(async (req, res) => {
  const share = await PropertyShare.findById(req.params.id);
  if (!share) throw new NotFoundError('Share link not found.');

  if (req.user.role !== 'admin' && String(share.createdBy) !== String(req.user.id)) {
    throw new AuthorizationError('You can only withdraw links you created.');
  }
  if (share.revokedAt) throw new ValidationError('That link is already withdrawn.', 'id');

  share.revokedAt = new Date();
  share.revokedBy = req.user.id;
  await share.save();

  logger.info('Property share revoked', { token: `${share.token.slice(0, 8)}…`, userId: req.user.id });
  sendSuccessResponse(res, publicShapeForAgent(share), 'Link withdrawn');
});

// ─── GET /api/share/open/:token ───────────────────────────────────────────────

/**
 * Open a shared link. The only unauthenticated route that returns property data.
 *
 * It runs unscoped because it has to: the caller has a token and nothing else,
 * so there is no session to derive a workspace from. The share record supplies
 * the tenant, and the listings are then read inside it — which means a token
 * can only ever reach the workspace that issued it.
 */
export const openShare = asyncHandler(async (req, res) => {
  const { token } = req.params;

  const share = await runWithoutTenantScope(
    'opening a share link, where the token supplies the workspace',
    () => PropertyShare.findOne({ token }).select('+passcodeHash')
  );

  // The same answer for a token that never existed and one that was withdrawn
  // long ago, so the endpoint cannot be used to enumerate valid tokens.
  if (!share) throw new NotFoundError('This link is not valid.');

  const dead = share.deadReason();
  if (dead) {
    return res.status(410).json({ success: false, statusCode: 410, message: dead, expired: true });
  }

  if (share.passcodeHash) {
    const supplied = req.get('x-share-passcode') || req.query.passcode;
    if (!supplied) {
      return res.status(401).json({
        success: false,
        statusCode: 401,
        message: 'This link needs the passcode the agent gave you.',
        passcodeRequired: true,
      });
    }
    const matches = await bcryptjs.compare(String(supplied), share.passcodeHash);
    if (!matches) {
      logger.security?.('share_passcode_failed', { token: `${token.slice(0, 8)}…`, ip: req.ip });
      return res.status(401).json({
        success: false,
        statusCode: 401,
        message: 'That passcode is not right.',
        passcodeRequired: true,
      });
    }
  }

  const tenantId = String(share.tenantId);

  const listings = await runWithTenant({ tenantId }, () =>
    Listing.find({ _id: { $in: share.listingIds }, isDeleted: { $ne: true } }).lean()
  );

  // Counted, not awaited — a slow write should not hold up the page, and a
  // failed count is not a reason to refuse someone the properties.
  PropertyShare.updateOne(
    { _id: share._id },
    { $inc: { viewCount: 1 }, $set: { lastViewedAt: new Date() } }
  )
    .setOptions({ tenantScope: false })
    .catch(() => {});

  // The workspace's own name and colours, so the page looks like the agency's
  // rather than like a generic listing site.
  const tenant = await runWithoutTenantScope('branding the shared page', async () => {
    const Tenant = (await import('../models/tenant.model.js')).default;
    return Tenant.findById(tenantId).select('name branding').lean();
  });

  sendSuccessResponse(
    res,
    {
      label: share.label,
      message: share.message,
      sharedOn: share.createdAt,
      expiresAt: share.expiresAt,
      agency: {
        name: tenant?.branding?.productName || tenant?.name || 'Property',
        logoUrl: tenant?.branding?.logoUrl || '',
        tokens: tenant?.branding?.tokens || {},
        supportEmail: tenant?.branding?.supportEmail || '',
        supportPhone: tenant?.branding?.supportPhone || '',
      },
      properties: listings.map((l) => forRecipient(l, { showPrice: share.showPrice })),
    },
    'Shared properties'
  );
});

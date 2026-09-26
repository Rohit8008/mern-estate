/**
 * Accepting an invitation.
 *
 * Both handlers here are unauthenticated by necessity, and for the same reason
 * `openShare` is: the caller holds a token and nothing else. There is no
 * session to derive a workspace from, and no host to read it off — the person
 * clicking this link has never been in the product before.
 *
 * So the token is looked up unscoped, and everything after that runs inside the
 * tenant the user record named. A token can therefore only ever reach the one
 * workspace that issued it.
 */

import User from '../models/user.model.js';
import Tenant from '../models/tenant.model.js';
import {
  asyncHandler,
  sendSuccessResponse,
  ValidationError,
  NotFoundError,
} from '../utils/error.js';
import { logger } from '../utils/logger.js';
import { runWithTenant, runWithoutTenantScope } from '../tenancy/tenantContext.js';
import { hashInviteToken } from '../tenancy/invites.js';
import { validatePassword } from '../middleware/security.js';
import { reissueSession } from './auth.controller.js';
import { LEGAL_VERSION } from '../utils/legalVersion.js';

/**
 * Find the user an invite token belongs to.
 *
 * Deliberately gives the same answer for a token that never existed, one that
 * expired, and one already used: three different messages would turn this into
 * an oracle for which invitations are outstanding.
 */
async function findInvitee(token) {
  if (!token || typeof token !== 'string') return null;

  const user = await runWithoutTenantScope(
    'accepting an invitation, where the token supplies the workspace',
    () =>
      User.findOne({ inviteTokenHash: hashInviteToken(token), isDeleted: { $ne: true } })
        .select('+inviteTokenHash +inviteExpiresAt +password')
  );

  if (!user) return null;
  if (!user.inviteExpiresAt || user.inviteExpiresAt < new Date()) return null;
  return user;
}

/**
 * Whether this is an earlier link of an invitation that has since been sent
 * again. Only someone holding a real, once-valid link can get this answer, so
 * it tells a guesser nothing; it tells the invitee to open the newer email.
 */
async function wasReplaced(token) {
  if (!token || typeof token !== 'string') return false;
  const user = await runWithoutTenantScope('recognising a superseded invitation link', () =>
    User.findOne({ previousInviteTokenHashes: hashInviteToken(token), isDeleted: { $ne: true } })
      .select('+inviteExpiresAt')
      .lean()
  );
  return Boolean(user?.inviteExpiresAt && user.inviteExpiresAt > new Date());
}

async function rejectInvite(req, res) {
  if (await wasReplaced(req.params.token)) {
    return res.status(410).json({
      success: false,
      code: 'INVITE_REPLACED',
      message: 'A newer invitation was sent to you.',
    });
  }
  throw new NotFoundError('This invitation is no longer valid. Ask for a new one.');
}

/** The workspace an invitation belongs to, for branding the page. */
async function workspaceFor(tenantId) {
  return runWithoutTenantScope('branding the invitation page', () =>
    Tenant.findById(tenantId).select('name slug branding status').lean()
  );
}

// ─── GET /api/auth/invite/:token ──────────────────────────────────────────────

/**
 * What the invitation page needs before anyone types anything: whose workspace
 * this is, and which address it was sent to. Nothing else — an invite link that
 * leaked should not become a way to read a user record.
 */
export const getInvite = asyncHandler(async (req, res) => {
  const user = await findInvitee(req.params.token);
  if (!user) return rejectInvite(req, res);

  const tenant = await workspaceFor(user.tenantId);

  sendSuccessResponse(
    res,
    {
      email: user.email,
      name: user.username,
      // Already set up once? Then this is a re-invite, and the page should say
      // "change your password" rather than "welcome".
      hasPassword: Boolean(user.password),
      workspace: {
        name: tenant?.branding?.productName || tenant?.name || 'Workspace',
        // Remembered by the page, so later sign-ins go to this workspace.
        slug: tenant?.slug || '',
        logoUrl: tenant?.branding?.logoUrl || '',
        tokens: tenant?.branding?.tokens || {},
      },
    },
    'Invitation'
  );
});

// ─── POST /api/auth/invite/:token ─────────────────────────────────────────────

/**
 * Set the password and sign in.
 *
 * Signing them in here is the point of the whole flow. The alternative —
 * "password set, now go to the login page" — drops them back at exactly the
 * problem this feature exists to solve: a sign-in form that cannot work out
 * which workspace they belong to. Their session is issued with the `tid` taken
 * from the record the token named, so it is right by construction.
 */
export const acceptInvite = asyncHandler(async (req, res) => {
  const user = await findInvitee(req.params.token);
  if (!user) return rejectInvite(req, res);

  const password = req.body?.password;
  if (!password) throw new ValidationError('Choose a password.', 'password');

  const strength = validatePassword(String(password));
  if (!strength.isValid) {
    throw new ValidationError(
      'Use at least 8 characters with an uppercase letter, a lowercase letter, a number and a symbol.',
      'password'
    );
  }

  // Accepting the Terms and Privacy Policy is part of starting an account, and
  // the record of it has to say which version was accepted and when.
  if (req.body?.acceptTerms !== true) {
    throw new ValidationError('Please accept the Terms of Service and Privacy Policy to continue.', 'acceptTerms');
  }

  const tenantId = String(user.tenantId);

  await runWithTenant({ tenantId }, async () => {
    // The model's pre-save hook hashes this.
    user.password = password;
    // Single-use: consumed the moment it works, so a forwarded link is spent.
    user.inviteTokenHash = null;
    user.previousInviteTokenHashes = [];
    user.inviteExpiresAt = null;
    user.status = 'active';
    user.legalAcceptance = { version: LEGAL_VERSION, acceptedAt: new Date() };
    await user.save();
  });

  logger.info('Invitation accepted', {
    userId: String(user._id),
    tenantId,
    ip: req.ip,
  });

  // Straight into the workspace, with the tenant claim taken from the record
  // rather than from anything the caller sent.
  await reissueSession(res, {
    userId: user._id,
    tenantId,
    ip: req.ip,
    userAgent: req.headers['user-agent'] || '',
  });

  const tenant = await workspaceFor(tenantId);

  sendSuccessResponse(
    res,
    {
      user: { id: String(user._id), email: user.email, username: user.username, role: user.role },
      workspace: { name: tenant?.branding?.productName || tenant?.name, slug: tenant?.slug },
    },
    'Welcome aboard'
  );
});

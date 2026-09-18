/**
 * Invitations — how somebody gets into a workspace for the first time.
 *
 * The problem this solves is specific to a multi-tenant product. Every other
 * way into the app needs the workspace to be known before the request is
 * authenticated: `resolveTenant` reads it from a custom domain, a subdomain, or
 * a signed token. A brand-new admin has none of those. They have an email, and
 * they do not know that "workspace" is a concept, let alone which subdomain is
 * theirs.
 *
 * So the invite token carries the workspace. It is minted against a user record
 * that already belongs to exactly one tenant, looked up unscoped (the token is
 * all the caller has), and everything after that runs inside the tenant the
 * record named. The recipient clicks a link and lands in the right agency
 * having never seen the word "tenant".
 *
 * The token is treated as a credential throughout, exactly like a share link:
 * 32 random bytes, stored only as a hash, expiring, single-use.
 */

import crypto from 'crypto';
import { config } from '../config/environment.js';
import { sendMail } from '../utils/mailer.js';
import { logger } from '../utils/logger.js';

/** Long enough that guessing is not a strategy. */
const TOKEN_BYTES = 32;

/** A week: long enough to survive a weekend and a spam folder, short enough to expire. */
export const DEFAULT_INVITE_DAYS = 7;

export function generateInviteToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url');
}

/**
 * Tokens are compared by hash, never by value.
 *
 * SHA-256 rather than bcrypt: this is a 256-bit random secret, not a password,
 * so there is no dictionary to slow down — and the lookup has to find the user
 * FROM the token, which a per-record salt would make impossible.
 */
export function hashInviteToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/**
 * Stamp a fresh invitation onto a user document. Does not save — the caller
 * decides when, so this can join a larger transaction or a provisioning step.
 *
 * @returns {string} the raw token, the only time it exists in the clear
 */
export function attachInvite(user, { days = DEFAULT_INVITE_DAYS, invitedBy = null } = {}) {
  const token = generateInviteToken();
  user.inviteTokenHash = hashInviteToken(token);
  user.inviteExpiresAt = new Date(Date.now() + days * 86400000);
  user.invitedAt = new Date();
  user.invitedBy = invitedBy;
  return token;
}

/**
 * Where the recipient should land.
 *
 * Built from the workspace's own address when it has one, so the link a
 * customer receives is on their domain rather than the vendor's — and so the
 * session it creates is resolvable by host afterwards, not just by token.
 */
export function inviteUrl(token, tenant) {
  const appDomain = config.tenancy?.appDomain;
  const base =
    tenant?.customDomain ? `https://${tenant.customDomain}`
    : tenant?.slug && appDomain ? `https://${tenant.slug}.${appDomain}`
    : process.env.FRONTEND_URL || 'http://localhost:5173';
  return `${String(base).replace(/\/+$/, '')}/invite/${token}`;
}

/**
 * Send the invitation.
 *
 * Delivery failure is reported, never thrown: an operator who provisioned a
 * workspace should not see it fail because a mail server was down, and the
 * console shows them the link to pass on by hand. The token is already stored,
 * so nothing is lost.
 */
export async function sendInviteEmail({ to, token, tenant, inviterName }) {
  const url = inviteUrl(token, tenant);
  const workspace = tenant?.branding?.productName || tenant?.name || 'your workspace';
  const from = inviterName ? `${inviterName} has invited you` : 'You have been invited';

  const text =
    `${from} to ${workspace}.\n\n` +
    `Set your password and sign in:\n${url}\n\n` +
    `This link expires in ${DEFAULT_INVITE_DAYS} days and can only be used once. ` +
    `If you were not expecting this, you can ignore it.`;

  const html =
    `<p>${from} to <b>${workspace}</b>.</p>` +
    `<p><a href="${url}">Set your password and sign in</a></p>` +
    `<p style="color:#64748b;font-size:13px">This link expires in ${DEFAULT_INVITE_DAYS} days ` +
    `and can only be used once. If you were not expecting this, you can ignore it.</p>`;

  const result = await sendMail({ to, subject: `Your ${workspace} account`, text, html });

  if (!result.sent) {
    logger.warn('Invite email not delivered', { to, workspace, reason: result.reason });
  }

  // The raw link goes back to the CALLER (a platform operator or workspace
  // admin), never into a log — it is a credential, and this is the one moment
  // it can be handed over deliberately.
  return { ...result, url };
}

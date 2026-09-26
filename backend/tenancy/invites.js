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
import { workspaceBaseUrl } from './workspaceUrl.js';

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
/** How many earlier links of one invitation stay usable. */
const MAX_PREVIOUS_LINKS = 4;

export function attachInvite(user, { days = DEFAULT_INVITE_DAYS, invitedBy = null } = {}) {
  const token = generateInviteToken();
  // A re-send remembers the links it replaces, so they can be recognised as
  // superseded (the caller selects +inviteTokenHash +inviteExpiresAt
  // +previousInviteTokenHashes). An expired invitation starts clean.
  const stillOpen = user.inviteTokenHash && user.inviteExpiresAt && user.inviteExpiresAt > new Date();
  user.previousInviteTokenHashes = stillOpen
    ? [user.inviteTokenHash, ...(user.previousInviteTokenHashes || [])].slice(0, MAX_PREVIOUS_LINKS)
    : [];
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
  return `${workspaceBaseUrl(tenant)}/invite/${token}`;
}

/**
 * Send the invitation.
 *
 * Delivery failure is reported, never thrown: an operator who provisioned a
 * workspace should not see it fail because a mail server was down, and the
 * console shows them the link to pass on by hand. The token is already stored,
 * so nothing is lost.
 */
const escapeHtml = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const ROLE_LINE = {
  admin: 'as an administrator, so you can set up the workspace and invite your team',
  employee: 'as a team member',
};

/**
 * The invitation email: who invited them, to what, what to do, and when the
 * link stops working. It used to be one line ("x has invited you to y") and
 * a bare link, which reads as spam and says nothing about the product.
 */
export function buildInviteEmail({ url, workspace, workspaceSlug = '', inviterName, role, recipientName, expiresAt, accent }) {
  const product = 'Real Vista';
  const who = inviterName ? `${inviterName} has invited you` : 'You have been invited';
  const roleLine = ROLE_LINE[role] ? ` ${ROLE_LINE[role]}` : '';
  const expires = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })
    .format(expiresAt || new Date(Date.now() + DEFAULT_INVITE_DAYS * 86400000));
  const hello = recipientName ? `Hi ${recipientName},` : 'Hello,';
  const colour = /^#[0-9a-f]{6}$/i.test(accent || '') ? accent : '#1e4f6b';

  const subject = inviterName
    ? `${inviterName} invited you to ${workspace} on ${product}`
    : `You're invited to ${workspace} on ${product}`;

  const text = [
    hello,
    '',
    `${who} to join ${workspace} on ${product}${roleLine}.`,
    '',
    `${product} is where the agency keeps its properties, leads, deals and follow-ups in one place, on the web and on Android.`,
    '',
    'Accept the invitation and choose your password:',
    url,
    '',
    `This link works once and expires on ${expires}.`,
    ...(workspaceSlug ? ['', `To sign in later, enter the workspace "${workspaceSlug}" on the sign-in screen.`] : []),
    "If you weren't expecting this invitation, you can ignore this email; no account is active until you accept.",
  ].join('\n');

  const e = escapeHtml;
  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f3f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
<div style="display:none;max-height:0;overflow:hidden">${e(who)} to join ${e(workspace)}. Accept by ${e(expires)}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f4;padding:32px 16px">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0">
      <tr><td style="padding:28px 32px 0">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="width:36px;height:36px;border-radius:10px;background:${colour};color:#fff;font-weight:700;font-size:16px;text-align:center;vertical-align:middle">${e(workspace.charAt(0).toUpperCase())}</td>
          <td style="padding-left:10px;font-weight:700;font-size:15px">${e(workspace)}</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:24px 32px 0">
        <h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:700">You're invited to ${e(workspace)}</h1>
        <p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:#334155">${e(hello)}</p>
        <p style="margin:8px 0 0;font-size:15px;line-height:1.6;color:#334155">
          ${inviterName ? `<strong>${e(inviterName)}</strong> has invited you` : 'You have been invited'} to join
          <strong>${e(workspace)}</strong> on ${product}${e(roleLine)}.
        </p>
        <p style="margin:12px 0 0;font-size:14px;line-height:1.6;color:#64748b">
          ${product} keeps the agency's properties, leads, deals and follow-ups in one place, on the web and on Android.
        </p>
      </td></tr>
      <tr><td style="padding:24px 32px 0">
        <a href="${e(url)}" style="display:inline-block;background:${colour};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 26px;border-radius:999px">Accept invitation</a>
        <p style="margin:12px 0 0;font-size:13px;color:#64748b">You'll choose your password, then go straight into the workspace.</p>
        ${workspaceSlug ? `<p style="margin:14px 0 0;padding:10px 14px;background:#f1f5f9;border-radius:10px;font-size:13px;color:#334155">To sign in later, enter the workspace <strong style="font-family:ui-monospace,Menlo,monospace">${e(workspaceSlug)}</strong> on the sign-in screen, on the web or in the Android app.</p>` : ''}
      </td></tr>
      <tr><td style="padding:24px 32px 28px">
        <p style="margin:0;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12.5px;line-height:1.6;color:#64748b">
          The button works once and expires on <strong>${e(expires)}</strong>. If it doesn't open, paste this into your browser:<br>
          <a href="${e(url)}" style="color:${colour};word-break:break-all">${e(url)}</a>
        </p>
        <p style="margin:12px 0 0;font-size:12.5px;line-height:1.6;color:#94a3b8">
          Weren't expecting this? You can ignore this email. No account is active until the invitation is accepted.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  return { subject, text, html };
}

export async function sendInviteEmail({ to, token, tenant, inviterName, role = 'admin', recipientName = '', expiresAt = null }) {
  const url = inviteUrl(token, tenant);
  const workspace = tenant?.branding?.productName || tenant?.name || 'your workspace';
  const { subject, text, html } = buildInviteEmail({
    url,
    workspace,
    // The default workspace needs nothing typed, so no hint for it.
    workspaceSlug: tenant?.slug && tenant.slug !== (config.tenancy?.defaultTenantSlug || 'default') ? tenant.slug : '',
    inviterName,
    role,
    recipientName,
    expiresAt,
    accent: tenant?.branding?.tokens?.primary || tenant?.branding?.primaryColor,
  });

  const result = await sendMail({ to, subject, text, html });

  if (!result.sent) {
    logger.warn('Invite email not delivered', { to, workspace, reason: result.reason });
  }

  // The raw link goes back to the CALLER (a platform operator or workspace
  // admin), never into a log — it is a credential, and this is the one moment
  // it can be handed over deliberately.
  return { ...result, url };
}

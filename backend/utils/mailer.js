import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { getTenantId, runWithoutTenantScope } from '../tenancy/tenantContext.js';
import { decryptSecret } from './encryption.js';

dotenv.config();

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
} = process.env;

/**
 * Outbound mail.
 *
 * A workspace that has configured its own SMTP sends as itself; everything else
 * falls back to the platform transport built from process env. Before this,
 * every agency's mail went out from the vendor's address — wrong on the
 * envelope, and a deliverability problem the moment there is a second customer.
 *
 * The SMTP password is `select: false` on the tenant and is deliberately NOT
 * carried on `req.tenant`: a credential should not ride along on an object that
 * half the codebase touches. So this module loads it itself, by id, and caches
 * the built transport — building one per message would mean a TCP handshake
 * per message.
 */

const TIMEOUTS = {
  // Without these, nodemailer waits indefinitely on an unreachable mail
  // server — and many callers are inside a request. A slow SMTP host should
  // cost the user a "could not send" message, not a hung password reset.
  connectionTimeout: 8000,
  greetingTimeout: 8000,
  socketTimeout: 10000,
};

/** How long a workspace's transport is reused before its settings are re-read. */
const CACHE_TTL_MS = 5 * 60_000;

let platformTransport = null;
if (SMTP_USER && SMTP_PASS) {
  platformTransport = nodemailer.createTransport({
    host: SMTP_HOST || 'smtp.gmail.com',
    port: SMTP_PORT ? Number(SMTP_PORT) : 587,
    secure: (SMTP_PORT ? String(SMTP_PORT) : '587') === '465',
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    ...TIMEOUTS,
  });
}

/** tenantId -> { transport, from, fromName, expiresAt } */
const tenantTransports = new Map();

/**
 * Drop a workspace's cached transport, so the next send picks up saved changes.
 * Other instances pick them up when their own entry expires.
 */
export function invalidateMailTransport(tenantId) {
  if (tenantId) tenantTransports.delete(String(tenantId));
  else tenantTransports.clear();
}

/**
 * Build (or reuse) the transport for a workspace.
 * Returns null when the workspace has not configured its own mail.
 */
async function workspaceTransport(tenantId) {
  if (!tenantId) return null;

  const id = String(tenantId);
  const cached = tenantTransports.get(id);
  if (cached && cached.expiresAt > Date.now()) return cached.transport ? cached : null;

  const { default: Tenant } = await import('../models/tenant.model.js');

  // Reading one workspace's own settings, addressed by id — the tenant plugin
  // does not scope the Tenant collection, and this runs from jobs as well as
  // requests, so it must not depend on an ambient context.
  const tenant = await runWithoutTenantScope(
    'loading a workspace mail credential by id',
    () => Tenant.findById(id).select('+mail.passEncrypted').lean().exec()
  );

  const mail = tenant?.mail;
  const usable = mail?.enabled && mail.host && mail.user && mail.passEncrypted;

  if (!usable) {
    // Cache the negative too, so a workspace on the platform transport does not
    // hit the database on every message.
    tenantTransports.set(id, { transport: null, expiresAt: Date.now() + CACHE_TTL_MS });
    return null;
  }

  let pass;
  try {
    pass = decryptSecret(mail.passEncrypted);
  } catch {
    // A password we cannot decrypt (rotated key, corrupt value) must not take
    // mail down entirely — fall back to the platform transport instead.
    console.error('[mailer] could not decrypt SMTP password for workspace', id);
    tenantTransports.set(id, { transport: null, expiresAt: Date.now() + CACHE_TTL_MS });
    return null;
  }

  const entry = {
    from: mail.from || mail.user,
    fromName: mail.fromName || '',
    expiresAt: Date.now() + CACHE_TTL_MS,
    transport: nodemailer.createTransport({
      host: mail.host,
      port: Number(mail.port) || 587,
      secure: Boolean(mail.secure),
      auth: { user: mail.user, pass },
      ...TIMEOUTS,
    }),
  };

  tenantTransports.set(id, entry);
  return entry;
}

/**
 * Whether any transport at all is available. Lets callers tell "not sent
 * because there is no SMTP here" from "not sent because it failed".
 */
export async function isMailConfigured(tenantId = getTenantId()) {
  if (platformTransport) return true;
  return Boolean(await workspaceTransport(tenantId));
}

/** Which transport this workspace's mail would use right now. For the settings screen. */
export async function mailSource(tenantId = getTenantId()) {
  if (await workspaceTransport(tenantId)) return 'workspace';
  if (platformTransport) return 'platform';
  return 'none';
}

function formatFrom(entry) {
  if (!entry) return SMTP_FROM || SMTP_USER;
  if (entry.fromName) return `"${entry.fromName.replace(/"/g, '')}" <${entry.from}>`;
  return entry.from;
}

/**
 * @param {object} opts
 * @param {string} [opts.tenantId] workspace to send as; defaults to the current
 *        request's workspace, which is what every in-request caller wants
 */
export async function sendMail({ to, subject, text, html, replyTo, tenantId = getTenantId() }) {
  // Tests must never open a socket to a real mail server: it makes the suite
  // slow, flaky and dependent on whoever's credentials are in .env.
  if (process.env.NODE_ENV === 'test') {
    return { sent: false, reason: 'suppressed_in_test' };
  }

  const entry = await workspaceTransport(tenantId);
  const transport = entry?.transport || platformTransport;

  if (!transport) {
    console.warn('[mailer] SMTP not configured. Set SMTP_USER and SMTP_PASS, or configure the workspace mail settings');
    return { sent: false, reason: 'not_configured' };
  }

  try {
    await transport.sendMail({ from: formatFrom(entry), to, subject, text, html, replyTo });
    return { sent: true, via: entry ? 'workspace' : 'platform' };
  } catch (e) {
    console.error('[mailer] sendMail error', e);
    return { sent: false, reason: 'send_failed', error: e?.message };
  }
}

/**
 * Prove the settings work before the admin relies on them.
 *
 * `verify()` opens the connection and authenticates without sending, which is
 * what distinguishes "wrong password" from "we sent it, check your spam".
 */
export async function verifyMailSettings(tenantId = getTenantId()) {
  const entry = await workspaceTransport(tenantId);
  const transport = entry?.transport || platformTransport;
  if (!transport) return { ok: false, reason: 'not_configured' };

  try {
    await transport.verify();
    return { ok: true, via: entry ? 'workspace' : 'platform' };
  } catch (e) {
    return { ok: false, reason: 'verify_failed', error: e?.message };
  }
}

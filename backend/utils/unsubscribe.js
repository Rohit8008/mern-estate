import crypto from 'crypto';
import EmailSuppression from '../models/emailSuppression.model.js';
import Client from '../models/client.model.js';
import { config } from '../config/environment.js';
import { workspaceBaseUrl, workspaceApiBaseUrl } from '../tenancy/workspaceUrl.js';

/**
 * Unsubscribe links for automated follow-up email.
 *
 * The token is signed, not stored: `<tenantId>.<clientId>.<hmac>`. It names a
 * lead, never an address, so an email address does not end up in every access
 * log that records the URL. It does not expire — an unsubscribe link in a
 * two-year-old email still has to work.
 *
 * The key is UNSUBSCRIBE_SECRET when set. Otherwise it is derived from
 * JWT_SECRET, which means rotating that secret breaks every unsubscribe link
 * already sent; set UNSUBSCRIBE_SECRET in production so the two are separate.
 */

const key = () =>
  crypto
    .createHmac('sha256', process.env.UNSUBSCRIBE_SECRET || config.jwt.secret)
    .update('real-vista:unsubscribe:v1')
    .digest();

const OBJECT_ID = /^[0-9a-f]{24}$/i;

const sign = (payload) => crypto.createHmac('sha256', key()).update(payload).digest('base64url');

export function signUnsubscribeToken({ tenantId, clientId }) {
  const payload = `${String(tenantId)}.${String(clientId)}`;
  return `${payload}.${sign(payload)}`;
}

/** { tenantId, clientId } for a genuine token, otherwise null. */
export function verifyUnsubscribeToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const [tenantId, clientId, mac] = parts;
  if (!OBJECT_ID.test(tenantId) || !OBJECT_ID.test(clientId)) return null;
  const expected = Buffer.from(sign(`${tenantId}.${clientId}`));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  return { tenantId, clientId };
}

/** The page a person lands on, and the URL a mail client POSTs to. */
export function unsubscribeUrls(tenant, token) {
  return {
    page: `${workspaceBaseUrl(tenant)}/unsubscribe/${token}`,
    oneClick: `${workspaceApiBaseUrl(tenant)}/api/unsubscribe/${token}`,
  };
}

const normalise = (email) => String(email || '').trim().toLowerCase();

/** Whether this address has asked not to receive automated email. Current workspace. */
export async function isSuppressed(email) {
  const address = normalise(email);
  if (!address) return false;
  return Boolean(await EmailSuppression.exists({ email: address }));
}

/**
 * Record an opt-out, idempotently, and mark the lead so the agency can see it.
 * The first record wins: a later agent entry does not overwrite the person's
 * own unsubscribe, which is the stronger evidence. Current workspace.
 */
export async function suppress({ email, clientId = null, source, recordedBy = null }) {
  const address = normalise(email);
  if (!address) return null;
  await EmailSuppression.updateOne(
    { email: address },
    { $setOnInsert: { email: address, source, client: clientId, recordedBy } },
    { upsert: true }
  );
  const record = await EmailSuppression.findOne({ email: address }).lean();
  // Every lead with this address, not only the one the link named.
  await Client.updateMany(
    { email: address, 'emailOptOut.at': null },
    { $set: { emailOptOut: { at: record.createdAt, source: record.source } } }
  );
  return record;
}

/** Undo an opt-out the agency itself recorded. A person's own unsubscribe cannot be undone here. */
export async function unsuppressAgentEntry(email) {
  const address = normalise(email);
  const record = await EmailSuppression.findOne({ email: address }).lean();
  if (!record) return { removed: false, reason: 'none' };
  if (record.source !== 'agent') return { removed: false, reason: 'person_unsubscribed' };
  await EmailSuppression.deleteOne({ _id: record._id });
  await Client.updateMany({ email: address }, { $set: { emailOptOut: null } });
  return { removed: true };
}

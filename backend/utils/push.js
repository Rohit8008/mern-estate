import fs from 'fs';
import jwt from 'jsonwebtoken';
import DeviceToken from '../models/deviceToken.model.js';
import { logger } from './logger.js';

/**
 * Push notifications to the Android app, through Firebase Cloud Messaging.
 *
 * Talks to the FCM HTTP v1 API directly: a service-account JWT is exchanged for
 * a short-lived access token, which authorises each send. That keeps the whole
 * feature on the `jsonwebtoken` package already installed, with no SDK.
 *
 * Off unless FIREBASE_SERVICE_ACCOUNT_PATH points at the service-account JSON.
 * Never throws: a push is a courtesy on top of the in-app notification, and
 * failing to send one must not fail the request that caused it.
 */

let account; // undefined = not loaded yet, null = not configured
let cachedToken = { value: '', expiresAt: 0 };

function loadAccount() {
  if (account !== undefined) return account;
  const file = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!file) return (account = null);
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed.private_key || !parsed.client_email || !parsed.project_id) throw new Error('missing fields');
    account = parsed;
  } catch (err) {
    logger.error('Push disabled: cannot read Firebase service account', { message: err.message });
    account = null;
  }
  return account;
}

export function isPushConfigured() {
  return !!loadAccount();
}

async function accessToken() {
  if (cachedToken.value && Date.now() < cachedToken.expiresAt - 60_000) return cachedToken.value;
  const acct = loadAccount();
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    {
      iss: acct.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    },
    acct.private_key,
    { algorithm: 'RS256' }
  );
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) throw new Error(`token exchange failed (${res.status})`);
  cachedToken = { value: body.access_token, expiresAt: Date.now() + (body.expires_in || 3600) * 1000 };
  return cachedToken.value;
}

/** FCM's "this token will never work again" answers. */
function isDeadToken(status, body) {
  const code = body?.error?.details?.find?.((d) => d.errorCode)?.errorCode || body?.error?.status;
  return status === 404 || code === 'UNREGISTERED' || code === 'INVALID_ARGUMENT';
}

async function sendOne(token, { title, body, data }) {
  const acct = loadAccount();
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${acct.project_id}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        notification: { title, body },
        data,
        android: { priority: 'HIGH', notification: { channel_id: 'realvista_default' } },
      },
    }),
  });
  if (res.ok) return { ok: true };
  const json = await res.json().catch(() => ({}));
  return { ok: false, dead: isDeadToken(res.status, json), status: res.status };
}

/**
 * @param {string[]} userIds
 * @param {{title: string, body?: string, link?: string, notificationId?: string}} message
 * @returns {Promise<number>} how many devices accepted it
 */
export async function sendPush(userIds, { title, body = '', link = '', notificationId = '' }) {
  try {
    if (!isPushConfigured() || !userIds?.length) return 0;
    const devices = await DeviceToken.find({ user: { $in: userIds } }).select('token').lean();
    if (!devices.length) return 0;

    // FCM data values must all be strings.
    const data = { link: String(link || ''), notificationId: String(notificationId || '') };
    let delivered = 0;
    const dead = [];
    for (const { token } of devices) {
      const result = await sendOne(token, { title: String(title).slice(0, 120), body: String(body).slice(0, 240), data });
      if (result.ok) delivered += 1;
      else if (result.dead) dead.push(token);
      else logger.warn('Push not delivered', { status: result.status });
    }
    if (dead.length) await DeviceToken.deleteMany({ token: { $in: dead } });
    return delivered;
  } catch (err) {
    logger.error('Push failed', { message: err.message });
    return 0;
  }
}

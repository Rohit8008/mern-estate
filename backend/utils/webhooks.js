import crypto from 'node:crypto';
import Webhook from '../models/webhook.model.js';
import WebhookDelivery from '../models/webhookDelivery.model.js';
import { logger } from './logger.js';

/**
 * Raising and delivering outbound webhooks.
 *
 * Two halves, deliberately separated:
 *
 *  - `emitEvent` runs inside the request that caused the event. It only writes
 *    rows, so a slow or dead customer endpoint can never slow down — or fail —
 *    the thing the user actually asked for.
 *  - `deliverDueWebhooks` runs on the scheduler and does the network calls.
 */

/** How long to wait before each retry. Five attempts, then give up. */
const BACKOFF_MS = [10_000, 60_000, 300_000, 1_800_000];
const MAX_ATTEMPTS = BACKOFF_MS.length + 1;

/** Consecutive failures after which an endpoint disables itself. */
const FAILURE_LIMIT = 10;

/** A delivery is not allowed to hold a worker open indefinitely. */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Whether a webhook URL is safe for this server to fetch.
 *
 * A webhook URL is admin-supplied input that the server itself then requests,
 * which makes it a server-side request forgery vector: without this an admin
 * could point a hook at 169.254.169.254 and use our own process to read cloud
 * instance metadata, or reach an internal service that is not exposed to the
 * internet at all.
 *
 * This blocks the literal private ranges. It cannot stop a public hostname that
 * resolves to a private address, so it is a guard rather than a guarantee —
 * redirects are refused at fetch time for the same reason.
 *
 * @returns {string|null} the reason it was rejected, or null when acceptable
 */
export function validateWebhookUrl(raw) {
  let url;
  try {
    url = new URL(String(raw));
  } catch {
    return 'That is not a valid URL';
  }

  if (!['http:', 'https:'].includes(url.protocol)) return 'The URL must be http or https';

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (
    host === 'localhost' ||
    host === '::1' ||
    host === '0.0.0.0' ||
    host.endsWith('.localhost') ||
    host.endsWith('.internal') ||
    host.endsWith('.local') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^0\./.test(host) ||
    /^fe80:/i.test(host) ||
    /^fc00:/i.test(host) ||
    /^fd/i.test(host)
  ) {
    return 'That address is not reachable from the internet';
  }

  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    return 'Use an https URL — a signed payload over plain http can be read in transit';
  }

  return null;
}

export function generateSecret() {
  return `whsec_${crypto.randomBytes(24).toString('hex')}`;
}

/**
 * Sign the exact bytes that are sent.
 *
 * The timestamp is inside the signed string, so a captured delivery cannot be
 * replayed later against a receiver that checks it — the same scheme Stripe
 * and GitHub use, so most receivers already know how to verify it.
 */
export function signPayload(secret, timestamp, body) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

/**
 * Queue an event for every subscribed endpoint in the current workspace.
 *
 * Never throws: a webhook is a side effect, and a controller must not fail
 * because a subscription row was malformed.
 */
export async function emitEvent(event, payload) {
  try {
    const hooks = await Webhook.find({ isActive: true }).lean();
    const subscribed = hooks.filter((h) => h.events?.includes('*') || h.events?.includes(event));
    if (!subscribed.length) return 0;

    await WebhookDelivery.insertMany(
      subscribed.map((hook) => ({
        webhook: hook._id,
        event,
        payload: { event, sentAt: new Date().toISOString(), data: payload },
      })),
      { ordered: false }
    );

    return subscribed.length;
  } catch (err) {
    logger.error('Failed to queue webhook event', { event, message: err.message });
    return 0;
  }
}

/** POST one delivery. Returns what happened; never throws. */
async function attemptDelivery(delivery, hook) {
  const body = JSON.stringify(delivery.payload);
  const timestamp = Math.floor(Date.now() / 1000);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(hook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'RealVista-Webhooks/1',
        'X-Webhook-Event': delivery.event,
        'X-Webhook-Delivery': String(delivery._id),
        'X-Webhook-Timestamp': String(timestamp),
        'X-Webhook-Signature': `sha256=${signPayload(hook.secret, timestamp, body)}`,
      },
      body,
      signal: controller.signal,
      redirect: 'error', // a redirect to somewhere else is not a delivery
    });

    // Read a little of the body for the log; a receiver returning megabytes
    // must not be able to fill the collection.
    let text = '';
    try {
      text = (await response.text()).slice(0, 2000);
    } catch { /* body is optional */ }

    return { ok: response.ok, status: response.status, body: text };
  } catch (err) {
    return {
      ok: false,
      status: null,
      error: err.name === 'AbortError' ? `timed out after ${REQUEST_TIMEOUT_MS}ms` : err.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Deliver everything that is due in the current workspace.
 *
 * Called per workspace by the scheduler, inside that workspace's tenant scope.
 */
export async function deliverDueWebhooks({ batchSize = 50 } = {}) {
  const due = await WebhookDelivery.find({ status: 'pending', nextAttemptAt: { $lte: new Date() } })
    .sort({ nextAttemptAt: 1 })
    .limit(batchSize);

  if (!due.length) return 0;

  // Cache the hooks so a batch of twenty deliveries to one endpoint is one read.
  const hookIds = [...new Set(due.map((d) => String(d.webhook)))];
  const hooks = await Webhook.find({ _id: { $in: hookIds } });
  const hookById = new Map(hooks.map((h) => [String(h._id), h]));

  let delivered = 0;

  for (const delivery of due) {
    const hook = hookById.get(String(delivery.webhook));

    // The endpoint was deleted or switched off after this was queued.
    if (!hook || !hook.isActive) {
      delivery.status = 'abandoned';
      delivery.error = hook ? 'endpoint disabled' : 'endpoint deleted';
      await delivery.save();
      continue;
    }

    const attempt = delivery.attempts + 1;
    const result = await attemptDelivery(delivery, hook);

    delivery.attempts = attempt;
    delivery.responseStatus = result.status ?? null;
    delivery.responseBody = result.body || '';
    delivery.error = result.error || '';

    if (result.ok) {
      delivery.status = 'delivered';
      delivery.deliveredAt = new Date();
      await delivery.save();

      await Webhook.updateOne(
        { _id: hook._id },
        {
          $set: {
            failureCount: 0,
            lastStatus: result.status,
            lastError: '',
            lastSuccessAt: new Date(),
            lastAttemptAt: new Date(),
          },
        }
      );

      delivered += 1;
      continue;
    }

    // Failed. Retry until the attempts run out.
    if (attempt >= MAX_ATTEMPTS) {
      delivery.status = 'failed';
    } else {
      delivery.nextAttemptAt = new Date(Date.now() + BACKOFF_MS[attempt - 1]);
    }
    await delivery.save();

    const failureCount = (hook.failureCount || 0) + 1;
    const update = {
      failureCount,
      lastStatus: result.status ?? null,
      lastError: (result.error || `HTTP ${result.status}`).slice(0, 500),
      lastAttemptAt: new Date(),
    };

    // A permanently broken endpoint should stop consuming retries.
    if (failureCount >= FAILURE_LIMIT) {
      update.isActive = false;
      update.disabledReason = `Disabled automatically after ${FAILURE_LIMIT} consecutive failures`;
      logger.warn('Webhook disabled after repeated failures', { webhook: String(hook._id), url: hook.url });
    }

    await Webhook.updateOne({ _id: hook._id }, { $set: update });
  }

  return delivered;
}

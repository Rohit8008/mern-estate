import Webhook, { WEBHOOK_EVENTS, WEBHOOK_EVENT_NAMES } from '../models/webhook.model.js';
import WebhookDelivery from '../models/webhookDelivery.model.js';
import { generateSecret, validateWebhookUrl } from '../utils/webhooks.js';
import { errorHandler } from '../utils/error.js';
import { logFromRequest } from '../utils/activity.js';

/**
 * Managing a workspace's outbound webhooks.
 */

function cleanEvents(events) {
  if (!Array.isArray(events) || !events.length) return null;
  if (events.includes('*')) return ['*'];
  const valid = events.filter((e) => WEBHOOK_EVENT_NAMES.includes(e));
  return valid.length ? valid : null;
}

export const listWebhooks = async (req, res, next) => {
  try {
    const hooks = await Webhook.find({}).sort({ createdAt: -1 }).lean();

    // Recent delivery counts per hook, so the screen can show health without
    // the admin having to open each one.
    const stats = await WebhookDelivery.aggregate([
      { $group: { _id: { webhook: '$webhook', status: '$status' }, n: { $sum: 1 } } },
    ]);

    const byHook = new Map();
    for (const row of stats) {
      const key = String(row._id.webhook);
      const entry = byHook.get(key) || { delivered: 0, pending: 0, failed: 0, abandoned: 0 };
      entry[row._id.status] = row.n;
      byHook.set(key, entry);
    }

    res.json({
      success: true,
      data: {
        webhooks: hooks.map((h) => ({ ...h, deliveries: byHook.get(String(h._id)) || null })),
        events: WEBHOOK_EVENTS,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const createWebhook = async (req, res, next) => {
  try {
    const { name, url, events } = req.body || {};
    if (!name || !String(name).trim()) return next(errorHandler(400, 'Give the endpoint a name'));

    const urlError = validateWebhookUrl(url);
    if (urlError) return next(errorHandler(400, urlError));

    const cleaned = cleanEvents(events);
    if (!cleaned) return next(errorHandler(400, 'Choose at least one event'));

    const hook = await Webhook.create({
      name: String(name).trim(),
      url: String(url).trim(),
      events: cleaned,
      secret: generateSecret(),
      createdBy: req.user.id,
    });

    logFromRequest(req, {
      entityType: 'user',
      entityId: req.user.id,
      action: 'webhook.created',
      message: `Created webhook "${hook.name}"`,
      meta: { url: hook.url, events: hook.events },
    });

    res.status(201).json({ success: true, data: hook });
  } catch (err) {
    next(err);
  }
};

export const updateWebhook = async (req, res, next) => {
  try {
    const { name, url, events, isActive } = req.body || {};
    const update = {};

    if (name && String(name).trim()) update.name = String(name).trim();

    if (url) {
      const urlError = validateWebhookUrl(url);
      if (urlError) return next(errorHandler(400, urlError));
      update.url = String(url).trim();
    }

    if (events) {
      const cleaned = cleanEvents(events);
      if (!cleaned) return next(errorHandler(400, 'Choose at least one event'));
      update.events = cleaned;
    }

    if (isActive !== undefined) {
      update.isActive = Boolean(isActive);
      // Switching a hook back on is how an admin clears an automatic disable,
      // so the failure count has to go with it or it disables again at once.
      if (update.isActive) {
        update.failureCount = 0;
        update.disabledReason = '';
      }
    }

    if (!Object.keys(update).length) return next(errorHandler(400, 'Nothing to update'));

    const hook = await Webhook.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
    if (!hook) return next(errorHandler(404, 'Webhook not found'));

    res.json({ success: true, data: hook });
  } catch (err) {
    next(err);
  }
};

/** Roll the signing secret. The old one stops verifying immediately. */
export const rotateSecret = async (req, res, next) => {
  try {
    const hook = await Webhook.findByIdAndUpdate(
      req.params.id,
      { $set: { secret: generateSecret() } },
      { new: true }
    );
    if (!hook) return next(errorHandler(404, 'Webhook not found'));

    logFromRequest(req, {
      entityType: 'user',
      entityId: req.user.id,
      action: 'webhook.secret_rotated',
      message: `Rotated the signing secret for "${hook.name}"`,
    });

    res.json({ success: true, data: { secret: hook.secret } });
  } catch (err) {
    next(err);
  }
};

export const deleteWebhook = async (req, res, next) => {
  try {
    const hook = await Webhook.findById(req.params.id);
    if (!hook) return next(errorHandler(404, 'Webhook not found'));

    await WebhookDelivery.deleteMany({ webhook: hook._id });
    await hook.deleteOne();

    logFromRequest(req, {
      entityType: 'user',
      entityId: req.user.id,
      action: 'webhook.deleted',
      message: `Deleted webhook "${hook.name}"`,
    });

    res.json({ success: true, message: 'Webhook deleted' });
  } catch (err) {
    next(err);
  }
};

/** The delivery log for one endpoint. */
export const listDeliveries = async (req, res, next) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));

    const deliveries = await WebhookDelivery.find({ webhook: req.params.id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({ success: true, data: { deliveries } });
  } catch (err) {
    next(err);
  }
};

/**
 * Send a test event, so an admin can prove the endpoint works before relying
 * on it. Queued like any other delivery rather than sent inline, so it exercises
 * the real path including signing and retries.
 */
export const sendTestEvent = async (req, res, next) => {
  try {
    const hook = await Webhook.findById(req.params.id);
    if (!hook) return next(errorHandler(404, 'Webhook not found'));

    const delivery = await WebhookDelivery.create({
      webhook: hook._id,
      event: 'webhook.test',
      payload: {
        event: 'webhook.test',
        sentAt: new Date().toISOString(),
        data: { message: 'This is a test delivery from your CRM.', webhookId: String(hook._id) },
      },
    });

    res.json({ success: true, data: { deliveryId: String(delivery._id) } });
  } catch (err) {
    next(err);
  }
};

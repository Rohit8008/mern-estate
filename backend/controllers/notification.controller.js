import Notification from '../models/notification.model.js';
import User from '../models/user.model.js';
import { errorHandler } from '../utils/error.js';
import {
  NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_KEYS,
  defaultNotificationPreferences,
  isNotificationType,
} from '../utils/notificationTypes.js';
import { inHomeTenant } from '../tenancy/tenantContext.js';

/**
 * The notification feed.
 *
 * Every query here is about the CALLER, so each one is pinned to the caller's
 * home workspace with inHomeTenant — otherwise a platform operator viewing a
 * customer's workspace would read the feed in that workspace, find nothing, and
 * the bell would silently show zero rather than their own notifications.
 */

export const listNotifications = async (req, res, next) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const unreadOnly = req.query.unread === 'true';

    const filter = { user: req.user.id };
    if (unreadOnly) filter.readAt = null;

    const { items, total, unread } = await inHomeTenant(req, async () => {
      const [items, total, unread] = await Promise.all([
        Notification.find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit).lean(),
        Notification.countDocuments(filter),
        Notification.countDocuments({ user: req.user.id, readAt: null }),
      ]);
      return { items, total, unread };
    });

    res.json({ success: true, data: { items, total, unread, limit, offset } });
  } catch (err) {
    next(err);
  }
};

/** The number on the bell. Kept separate so it can be polled cheaply. */
export const unreadCount = async (req, res, next) => {
  try {
    const unread = await inHomeTenant(req, () =>
      Notification.countDocuments({ user: req.user.id, readAt: null })
    );
    res.json({ success: true, data: { unread } });
  } catch (err) {
    next(err);
  }
};

export const markRead = async (req, res, next) => {
  try {
    const result = await inHomeTenant(req, () =>
      Notification.updateOne(
        { _id: req.params.id, user: req.user.id, readAt: null },
        { $set: { readAt: new Date() } }
      )
    );

    if (!result.matchedCount) return next(errorHandler(404, 'Notification not found'));
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

export const markAllRead = async (req, res, next) => {
  try {
    const result = await inHomeTenant(req, () =>
      Notification.updateMany(
        { user: req.user.id, readAt: null },
        { $set: { readAt: new Date() } }
      )
    );
    res.json({ success: true, data: { updated: result.modifiedCount } });
  } catch (err) {
    next(err);
  }
};

/**
 * The catalogue plus this user's choices, so the Settings screen can render
 * every type without a second hard-coded list.
 */
export const getPreferences = async (req, res, next) => {
  try {
    const user = await inHomeTenant(req, () =>
      User.findById(req.user.id).select('preferences').lean()
    );
    if (!user) return next(errorHandler(404, 'User not found'));

    const stored = user.preferences?.notifications || {};
    const notifications = defaultNotificationPreferences();

    for (const key of NOTIFICATION_TYPE_KEYS) {
      if (stored[key]) {
        notifications[key] = {
          inApp: stored[key].inApp !== false,
          email: stored[key].email === true,
        };
      }
    }

    res.json({
      success: true,
      data: {
        catalogue: NOTIFICATION_TYPES,
        notifications,
        privacy: {
          showEmail: user.preferences?.privacy?.showEmail ?? false,
          showPhone: user.preferences?.privacy?.showPhone ?? false,
          showOnlineStatus: user.preferences?.privacy?.showOnlineStatus ?? true,
          allowMessages: user.preferences?.privacy?.allowMessages ?? true,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

export const updatePreferences = async (req, res, next) => {
  try {
    const { notifications, privacy } = req.body || {};
    const update = {};

    if (notifications && typeof notifications === 'object') {
      // Only known types, only the two booleans — the body is user input and
      // this writes into a Map that would otherwise accept anything.
      const clean = {};
      for (const [key, value] of Object.entries(notifications)) {
        if (!isNotificationType(key)) continue;
        clean[key] = { inApp: value?.inApp !== false, email: value?.email === true };
      }
      update['preferences.notifications'] = clean;
    }

    if (privacy && typeof privacy === 'object') {
      for (const key of ['showEmail', 'showPhone', 'showOnlineStatus', 'allowMessages']) {
        if (key in privacy) update[`preferences.privacy.${key}`] = Boolean(privacy[key]);
      }
    }

    if (!Object.keys(update).length) {
      return next(errorHandler(400, 'Nothing to update'));
    }

    await inHomeTenant(req, () => User.updateOne({ _id: req.user.id }, { $set: update }));
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

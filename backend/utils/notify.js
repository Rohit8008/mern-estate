import Notification from '../models/notification.model.js';
import User from '../models/user.model.js';
import { emitToUser } from '../socket.js';
import { sendMail } from './mailer.js';
import { resolveDelivery, isNotificationType } from './notificationTypes.js';
import { resolveTemplate } from './emailTemplates.js';
import { logger } from './logger.js';

/**
 * Raising a notification.
 *
 * One entry point for every event the product tells someone about, so the
 * decision of "in-app, email, both or neither" is made in one place against the
 * recipient's saved preferences — rather than each controller hand-rolling a
 * sendMail call, which is how the app ended up emailing a single global
 * NOTIFY_TO address instead of the person the task was assigned to.
 *
 * Never throws. A notification is a side effect of the user's actual request;
 * failing to tell someone must not fail the thing that happened.
 */

/**
 * Turn an in-app path into something clickable from an email client.
 *
 * Notifications store an app-relative path because that is what the bell needs;
 * an email has no origin to resolve it against, so a bare "/clients/123" in a
 * mail is a dead link.
 */
function absoluteLink(path) {
  const base = String(process.env.FRONTEND_URL || '').replace(/\/$/, '');
  if (!base) return '';
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

/** Recipients are de-duplicated and the actor is dropped: don't notify yourself. */
function recipientIds(to, actorId) {
  const ids = (Array.isArray(to) ? to : [to])
    .filter(Boolean)
    .map(String);

  const unique = [...new Set(ids)];
  return actorId ? unique.filter((id) => id !== String(actorId)) : unique;
}

/**
 * @param {object} opts
 * @param {string|string[]} opts.to         recipient user id(s)
 * @param {string} opts.type                a key from notificationTypes.js
 * @param {string} opts.title               one line, shown in the bell
 * @param {string} [opts.body]              supporting detail
 * @param {string} [opts.link]              in-app path to open on click
 * @param {{type: string, id: any}} [opts.entity]
 * @param {string} [opts.actorId]           who caused it; never notified
 * @param {{subject?: string, html?: string, text?: string}} [opts.email]
 *        overrides for the email body; defaults to title/body
 * @returns {Promise<{created: number, emailed: number}>}
 */
export async function notify({
  to,
  type,
  title,
  body = '',
  link = '',
  entity = null,
  actorId = null,
  email = null,
}) {
  try {
    if (!isNotificationType(type)) {
      logger.warn('Unknown notification type ignored', { type });
      return { created: 0, emailed: 0 };
    }

    const ids = recipientIds(to, actorId);
    if (!ids.length) return { created: 0, emailed: 0 };

    const users = await User.find({ _id: { $in: ids }, isDeleted: { $ne: true }, status: 'active' })
      .select('email username preferences')
      .lean();

    let created = 0;
    let emailed = 0;

    for (const user of users) {
      const prefs = user.preferences?.notifications || {};
      const delivery = resolveDelivery(prefs, type);

      let doc = null;
      if (delivery.inApp) {
        doc = await Notification.create({
          user: user._id,
          type,
          title,
          body,
          link,
          entity: entity ? { type: entity.type, id: entity.id } : undefined,
          createdBy: actorId || null,
        });
        created += 1;

        // Push straight to any open tab so the bell updates without a poll.
        emitToUser(user._id, 'notification:new', {
          _id: String(doc._id),
          type,
          title,
          body,
          link,
          createdAt: doc.createdAt,
        });
      }

      if (delivery.email && user.email) {
        // A workspace that has written its own wording for this event gets it;
        // everyone else gets the built-in copy. Resolved per recipient because
        // the greeting is part of the template.
        const custom = await resolveTemplate(type, {
          recipientName: user.username || '',
          title,
          body,
          link: link ? absoluteLink(link) : '',
        });

        const result = await sendMail({
          to: user.email,
          subject: custom?.subject || email?.subject || title,
          text: email?.text || `${title}\n\n${body}`.trim(),
          html: custom?.html || email?.html,
        });

        if (result?.sent) {
          emailed += 1;
          if (doc) await Notification.updateOne({ _id: doc._id }, { $set: { emailedAt: new Date() } });
        }
      }
    }

    return { created, emailed };
  } catch (err) {
    logger.error('Failed to raise notification', { type, message: err.message });
    return { created: 0, emailed: 0 };
  }
}

/**
 * Everyone who administers this workspace.
 *
 * Used for events that belong to the agency rather than to one person — a plan
 * limit reached, a trial ending.
 */
export async function workspaceAdminIds() {
  const admins = await User.find({ role: 'admin', status: 'active', isDeleted: { $ne: true } })
    .select('_id')
    .lean();
  return admins.map((a) => String(a._id));
}

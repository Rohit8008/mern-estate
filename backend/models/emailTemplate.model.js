import mongoose from 'mongoose';
import { NOTIFICATION_TYPE_KEYS } from '../utils/notificationTypes.js';

/**
 * A workspace's own wording for the emails the product sends.
 *
 * Every outbound email was a hand-built HTML string inside whichever controller
 * happened to send it, so an agency could not change a word of what went out
 * under their name — and the same copy went to a boutique brokerage and a
 * 200-agent firm.
 *
 * A template is optional: where a workspace has not written one, the built-in
 * wording is used. That keeps this a customisation rather than a setup step.
 */

/**
 * The templates a workspace may override.
 *
 * Notification types, plus the transactional mails that are not notifications
 * (an invitation is sent to someone who does not have an account yet, so it
 * cannot be governed by their preferences).
 */
export const TEMPLATE_KEYS = Object.freeze([
  ...NOTIFICATION_TYPE_KEYS,
  'user.invited',
  'user.welcome',
  'report.shared',
]);

/**
 * The values a template may interpolate, and what they mean.
 *
 * A closed list on purpose: a template is edited by a workspace admin and then
 * rendered by the server, so anything reachable from it is effectively public
 * to them. Naming the fields means a template can never reach into a document
 * it was not meant to see.
 */
export const TEMPLATE_VARIABLES = Object.freeze({
  recipientName: 'The name of the person receiving the email',
  workspaceName: 'Your agency name',
  title: 'The headline of the notification',
  body: 'The supporting detail',
  link: 'A full URL back into the CRM',
  actorName: 'The person whose action caused this',
  date: "Today's date",
});

const emailTemplateSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, enum: TEMPLATE_KEYS, index: true },
    subject: { type: String, required: true, trim: true, maxlength: 200 },

    /** The body, as HTML. Sanitised on save, not on render. */
    html: { type: String, required: true, maxlength: 100_000 },

    isActive: { type: Boolean, default: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// One override per key per workspace.
emailTemplateSchema.index({ tenantId: 1, key: 1 }, { unique: true });

const EmailTemplate = mongoose.model('EmailTemplate', emailTemplateSchema);
export default EmailTemplate;

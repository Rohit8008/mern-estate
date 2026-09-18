import mongoose from 'mongoose';
import { NOTIFICATION_TYPE_KEYS } from '../utils/notificationTypes.js';

/**
 * A notification that outlives the page.
 *
 * The bell used to be backed by an in-memory array of toasts that expired after
 * seven seconds and vanished on refresh — so "you were assigned a lead" was
 * lost if you happened to be on another tab. These are rows: they survive a
 * reload, they carry an unread state, and they can be counted.
 */
const notificationSchema = new mongoose.Schema(
  {
    // Who it is for. Indexed with readAt because the two hot queries are
    // "my unread count" and "my recent notifications".
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: NOTIFICATION_TYPE_KEYS, required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, default: '', trim: true, maxlength: 1000 },

    /** Where clicking it should go, as an in-app path. */
    link: { type: String, default: '', trim: true, maxlength: 500 },

    /** What it is about, so a record's notifications can be found later. */
    entity: {
      type: { type: String, default: '', trim: true, maxlength: 40 },
      id: { type: mongoose.Schema.Types.ObjectId, default: null },
    },

    readAt: { type: Date, default: null },
    /** Set when the email side of this notification actually went out. */
    emailedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ tenantId: 1, user: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ tenantId: 1, user: 1, createdAt: -1 });

// Notifications are disposable history: keep 90 days, then let Mongo reap them
// so the collection cannot grow without bound in a busy workspace.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;

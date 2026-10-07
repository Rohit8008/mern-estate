import mongoose from 'mongoose';

/**
 * A phone that has said it can receive push notifications.
 *
 * One row per (user, FCM token). A token belongs to one installed app, so
 * signing in as someone else on the same phone moves it rather than leaving the
 * previous user's notifications arriving on it.
 */
const deviceTokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    token: { type: String, required: true, trim: true, maxlength: 4096 },
    platform: { type: String, enum: ['android', 'ios'], default: 'android' },
    appVersion: { type: String, default: '', trim: true, maxlength: 40 },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

deviceTokenSchema.index({ tenantId: 1, token: 1 }, { unique: true });
// A token not refreshed for 90 days belongs to a phone that no longer opens the app.
deviceTokenSchema.index({ lastSeenAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

const DeviceToken = mongoose.model('DeviceToken', deviceTokenSchema);
export default DeviceToken;

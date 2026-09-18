import mongoose from 'mongoose';

const activityLogSchema = new mongoose.Schema(
  {
    entityType: {
      type: String,
      enum: ['client', 'task', 'listing', 'deal', 'transaction', 'document', 'owner', 'user'],
      required: true,
      index: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    action: { type: String, required: true, trim: true, maxlength: 120, index: true },
    message: { type: String, default: '', trim: true, maxlength: 500 },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Before/after for the fields that actually changed, so the trail answers
    // "what was it before?" rather than only "someone updated this".
    changes: { type: mongoose.Schema.Types.Mixed, default: null },
    ip: { type: String, default: '', trim: true, maxlength: 64 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

activityLogSchema.index({ tenantId: 1, createdAt: -1 });
activityLogSchema.index({ tenantId: 1, entityType: 1, entityId: 1, createdAt: -1 });
// Supports the admin trail's filters: by actor, and by action within a period.
activityLogSchema.index({ tenantId: 1, createdBy: 1, createdAt: -1 });
activityLogSchema.index({ tenantId: 1, action: 1, createdAt: -1 });

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);
export default ActivityLog;

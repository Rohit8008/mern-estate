import mongoose from 'mongoose';

const activityLogSchema = new mongoose.Schema(
  {
    entityType: {
      type: String,
      enum: ['client', 'task'],
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
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

activityLogSchema.index({ createdAt: -1 });

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);
export default ActivityLog;

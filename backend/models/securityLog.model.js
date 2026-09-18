import mongoose from 'mongoose';

const securityLogSchema = new mongoose.Schema(
  {
    email: { type: String, default: '', index: true },
    method: {
      type: String,
      enum: ['password', 'google', 'signup', 'registration', 'refresh_token', 'logout', 'other'],
      default: 'other',
    },
    status: { type: String, enum: ['blocked', 'invalid', 'success'], default: 'blocked' },
    reason: { type: String, default: '', maxlength: 500 },
    ip: { type: String, default: '', index: true, maxlength: 45 },
    userAgent: { type: String, default: '', maxlength: 500 },
    path: { type: String, default: '' },
  },
  { timestamps: true }
);

const SecurityLog = mongoose.model('SecurityLog', securityLogSchema);

export default SecurityLog;



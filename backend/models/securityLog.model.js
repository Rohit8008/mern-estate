import mongoose from 'mongoose';

const securityLogSchema = new mongoose.Schema(
  {
    email: { type: String, default: '' },
    method: {
      type: String,
      enum: ['password', 'google', 'signup', 'registration', 'refresh_token', 'logout', 'other'],
      default: 'other',
    },
    status: { type: String, enum: ['blocked', 'invalid', 'success'], default: 'blocked' },
    reason: { type: String, default: '' },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    path: { type: String, default: '' },
  },
  { timestamps: true }
);

const SecurityLog = mongoose.model('SecurityLog', securityLogSchema);

export default SecurityLog;



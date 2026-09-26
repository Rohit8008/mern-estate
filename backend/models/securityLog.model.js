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

// Retention. These rows hold emails (including ones typed into a failed
// sign-in), IPs and user agents, and were kept forever. 180 days is the floor
// CERT-In's 28 April 2022 directions set for ICT logs, and no longer than that
// is needed to investigate an incident — the DPDP Act asks that personal data
// not outlive its purpose. Changing this figure is a compliance decision.
export const SECURITY_LOG_RETENTION_SECONDS = 180 * 24 * 60 * 60;
securityLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: SECURITY_LOG_RETENTION_SECONDS });

const SecurityLog = mongoose.model('SecurityLog', securityLogSchema);

export default SecurityLog;



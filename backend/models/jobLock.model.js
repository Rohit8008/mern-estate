import mongoose from 'mongoose';

/**
 * A lease on a scheduled job, so only one process runs it.
 *
 * The app is deployed under PM2 cluster mode and on Render, where more than one
 * instance is normal. Without this, every instance would fire every job: each
 * reminder email would go out N times and each sweep would race the others.
 *
 * A lease rather than a flag, because a process can die mid-job. `lockedUntil`
 * expires on its own, so a crash costs one cycle rather than wedging the job
 * forever.
 *
 * Not tenant-scoped: the scheduler is infrastructure, and a job that sweeps
 * every workspace cannot belong to one of them.
 */
const jobLockSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, index: true },
    lockedUntil: { type: Date, required: true },
    owner: { type: String, default: '' },
    lastRunAt: { type: Date, default: null },
    lastResult: { type: String, default: '', maxlength: 500 },
  },
  { timestamps: true, tenantScoped: false }
);

const JobLock = mongoose.model('JobLock', jobLockSchema);
export default JobLock;

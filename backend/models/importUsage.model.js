import mongoose from 'mongoose';

/**
 * How many rows a workspace has imported in a calendar month — the meter
 * behind the plan's `maxImportRowsPerMonth`, which was defined in every plan
 * and enforced by nothing.
 *
 * A counter rather than a count over the records themselves: an imported lead
 * looks like any other lead once it exists, and deleting it must not hand the
 * allowance back. The activity log does say "Imported N leads", but it is
 * written fire-and-forget and is an audit trail, not a meter; a limit that can
 * be lost when a log write fails is not a limit.
 *
 * One row per workspace per month (`month` is "YYYY-MM" in the workspace's own
 * timezone), so the allowance resets on the 1st where the agency is, not in
 * UTC. Old months are never read again and are small enough to keep.
 */
const importUsageSchema = new mongoose.Schema(
  {
    month: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
    rows: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

// Unique per workspace and month — the tenant plugin adds tenantId, and the
// reservation in tenancy/limits.js relies on this index to refuse a second
// upsert that would otherwise create a duplicate counter.
importUsageSchema.index({ tenantId: 1, month: 1 }, { unique: true });

const ImportUsage = mongoose.model('ImportUsage', importUsageSchema);

export default ImportUsage;

import mongoose from 'mongoose';

// Lightweight analytics log. TTL index auto-deletes entries after 90 days.
const searchLogSchema = new mongoose.Schema(
  {
    userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    query:        { type: String, required: true, index: true },
    parsedFilters:{ type: mongoose.Schema.Types.Mixed, default: {} },
    entities:     { type: [String], default: [] },
    resultCounts: { type: mongoose.Schema.Types.Mixed, default: {} }, // { listings: 5, clients: 2 }
    clickedResult:{ entity: String, id: mongoose.Schema.Types.ObjectId },
    responseTimeMs: { type: Number },
    ip:           { type: String },
  },
  { timestamps: true }
);

// Auto-purge after 90 days
searchLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7_776_000 });

export default mongoose.model('SearchLog', searchLogSchema);

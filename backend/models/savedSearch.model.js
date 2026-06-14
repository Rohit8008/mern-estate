import mongoose from 'mongoose';

const savedSearchSchema = new mongoose.Schema(
  {
    userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name:        { type: String, required: true, trim: true, maxlength: 100 },
    query:       { type: String, required: true, trim: true },
    parsedFilters: { type: mongoose.Schema.Types.Mixed, default: {} },
    entities:    { type: [String], default: [] },
    isPinned:    { type: Boolean, default: false },
    lastRanAt:   { type: Date, default: null },
    runCount:    { type: Number, default: 0 },
    isDeleted:   { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

savedSearchSchema.index({ userId: 1, isDeleted: 1, isPinned: -1, lastRanAt: -1 });

export default mongoose.model('SavedSearch', savedSearchSchema);

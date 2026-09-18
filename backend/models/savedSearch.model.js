import mongoose from 'mongoose';

const savedSearchSchema = new mongoose.Schema(
  {
    userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name:        { type: String, required: true, trim: true, maxlength: 100 },
    query:       { type: String, required: true, trim: true, maxlength: 500 },
    parsedFilters: { type: mongoose.Schema.Types.Mixed, default: {} },
    entities:    { type: [String], default: [] },
    isPinned:    { type: Boolean, default: false },
    lastRanAt:   { type: Date, default: null },
    runCount:    { type: Number, default: 0, min: 0 },
    isDeleted:   { type: Boolean, default: false, index: true },
    deletedAt:   { type: Date, default: null },
    deletedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

savedSearchSchema.index({ tenantId: 1, userId: 1, isDeleted: 1, isPinned: -1, lastRanAt: -1 });

export default mongoose.model('SavedSearch', savedSearchSchema);

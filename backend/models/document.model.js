import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    filename: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    url: { type: String, required: true },
    storage: { type: String, enum: ['local', 's3'], default: 'local' },
    tags: { type: [String], default: [] },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Polymorphic relation: either client or listing
    related: {
      kind: { type: String, enum: ['client', 'listing'], required: true, index: true },
      clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null, index: true },
      listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', default: null, index: true },
    },
  },
  { timestamps: true }
);

documentSchema.index({ title: 'text', tags: 1, 'related.kind': 1 });

const Document = mongoose.model('Document', documentSchema);
export default Document;

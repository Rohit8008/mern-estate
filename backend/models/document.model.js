import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    filename: { type: String, required: true, maxlength: 255 },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    url: { type: String, required: true },
    storage: { type: String, enum: ['local', 's3'], default: 'local' },
    tags: [{ type: String, maxlength: 50 }],

    /**
     * What this document is, for a category: 'rera', 'layout', 'approval',
     * 'brochure', 'image', 'other'. See utils/documentTypes.js.
     *
     * A type rather than a tag, because the answer to "is this project RERA
     * registered?" should be a query, not a person opening attachments one at a
     * time. Free-form for client and listing documents, which have no
     * equivalent taxonomy yet.
     */
    docType: { type: String, default: 'other', maxlength: 40, index: true },

    /**
     * Whether this may be shown to someone who is not signed in.
     *
     * Defaults to false and is never set implicitly — an approval letter naming
     * individuals, or a brochure with stale pricing, must not become public
     * because a default said so. The upload form suggests a value per type; the
     * admin decides.
     */
    isPublic: { type: Boolean, default: false, index: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    /*
     * Polymorphic relation.
     *
     * `deal` and `transaction` were missing, so a signed agreement or a payment
     * receipt had nowhere to live — the paperwork that matters most at the end
     * of a deal could only be filed against the client in general.
     *
     * A deal is a sub-document of Client, so `dealId` is the sub-document id and
     * `clientId` carries its parent: that way a deal's documents can be found
     * without scanning every client.
     */
    related: {
      kind: {
        type: String,
        enum: ['client', 'listing', 'category', 'deal', 'transaction'],
        required: true,
        index: true,
      },
      clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null, index: true },
      listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', default: null, index: true },
      categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
      dealId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
      transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null, index: true },
    },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

documentSchema.index({ tenantId: 1, 'related.kind': 1, 'related.clientId': 1 });
documentSchema.index({ tenantId: 1, 'related.kind': 1, 'related.listingId': 1 });
documentSchema.index({ tenantId: 1, 'related.kind': 1, 'related.categoryId': 1 });
documentSchema.index({ tenantId: 1, 'related.kind': 1, 'related.dealId': 1 });
documentSchema.index({ tenantId: 1, 'related.kind': 1, 'related.transactionId': 1 });
// The public category page asks for exactly this shape.
documentSchema.index({ tenantId: 1, 'related.categoryId': 1, isPublic: 1, isDeleted: 1 });

const Document = mongoose.model('Document', documentSchema);
export default Document;

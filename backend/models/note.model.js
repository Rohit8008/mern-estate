import mongoose from 'mongoose';

/**
 * A quick personal capture — a text jot and/or a voice note — that an agent
 * takes on the go (someone mentions a property, a lead, a follow-up) to act on
 * later. Not attached to any record; a note can be turned into a property, and
 * `createdListing` records that so the note shows as acted-on.
 *
 * Private to its author: scoped by `userRef` on every read, inside the usual
 * tenant scope the global plugin adds.
 */
const noteSchema = new mongoose.Schema(
  {
    userRef: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    text: { type: String, default: '', maxlength: 5000 },
    audioUrl: { type: String, default: '' },
    audioDuration: { type: Number, default: 0 },
    // Set when a property was created from this note, so it reads as handled.
    createdListing: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', default: null },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

noteSchema.index({ tenantId: 1, userRef: 1, createdAt: -1 });

const Note = mongoose.model('Note', noteSchema);
export default Note;

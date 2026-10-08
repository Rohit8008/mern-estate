import Note from '../models/note.model.js';
import { errorHandler } from '../utils/error.js';

/** Quick-capture notes belong to their author — never another user's. */
const mine = (req) => ({ userRef: req.user.id, isDeleted: { $ne: true } });

// ─── GET /api/notes ───────────────────────────────────────────────────────────
export const getNotes = async (req, res, next) => {
  try {
    const notes = await Note.find(mine(req))
      .populate('createdListing', 'name _id')
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();
    res.status(200).json(notes);
  } catch (error) {
    next(error);
  }
};

// ─── POST /api/notes ──────────────────────────────────────────────────────────
export const createNote = async (req, res, next) => {
  try {
    const text = String(req.body.text || '').trim();
    const audioUrl = String(req.body.audioUrl || '').trim();
    // A note is a text jot, a voice note, or both — but not empty.
    if (!text && !audioUrl) {
      return next(errorHandler(400, 'Add a note or record a voice note first.'));
    }
    const note = await Note.create({
      userRef: req.user.id,
      text,
      audioUrl,
      audioDuration: Number(req.body.audioDuration) || 0,
    });
    res.status(201).json(note.toObject());
  } catch (error) {
    next(error);
  }
};

// ─── PATCH /api/notes/:id ─────────────────────────────────────────────────────
// Link the property that was created from this note (marks it handled).
export const linkNoteListing = async (req, res, next) => {
  try {
    const note = await Note.findOneAndUpdate(
      { _id: req.params.id, ...mine(req) },
      { $set: { createdListing: req.body.listingId || null } },
      { new: true }
    );
    if (!note) return next(errorHandler(404, 'Note not found.'));
    res.status(200).json(note.toObject());
  } catch (error) {
    next(error);
  }
};

// ─── DELETE /api/notes/:id ────────────────────────────────────────────────────
export const deleteNote = async (req, res, next) => {
  try {
    const note = await Note.findOneAndUpdate(
      { _id: req.params.id, ...mine(req) },
      { $set: { isDeleted: true, deletedAt: new Date() } },
      { new: true }
    );
    if (!note) return next(errorHandler(404, 'Note not found.'));
    res.status(200).json({ deleted: true, id: req.params.id });
  } catch (error) {
    next(error);
  }
};

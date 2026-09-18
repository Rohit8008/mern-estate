import mongoose from 'mongoose';

/**
 * A workspace's labels.
 *
 * Tags existed only as `client.tags: [String]` — free text, render-only, with
 * no input in any form and no way to rename or recolour one. Two people typing
 * "Hot Lead" and "hot lead" produced two labels that could never be reconciled.
 *
 * This is the taxonomy: a named, coloured row per workspace, referenced by id.
 * Renaming one renames it everywhere, because nothing stores the text.
 */

/**
 * The palette. Literal Tailwind class strings rather than a hex value, because
 * the UI composes them into class names — and an interpolated class name is
 * never emitted by Tailwind's scanner.
 */
export const TAG_COLORS = Object.freeze({
  slate:   { bg: 'bg-slate-100',   text: 'text-slate-700',   ring: 'ring-slate-200' },
  red:     { bg: 'bg-red-100',     text: 'text-red-700',     ring: 'ring-red-200' },
  amber:   { bg: 'bg-amber-100',   text: 'text-amber-700',   ring: 'ring-amber-200' },
  emerald: { bg: 'bg-emerald-100', text: 'text-emerald-700', ring: 'ring-emerald-200' },
  sky:     { bg: 'bg-sky-100',     text: 'text-sky-700',     ring: 'ring-sky-200' },
  indigo:  { bg: 'bg-indigo-100',  text: 'text-indigo-700',  ring: 'ring-indigo-200' },
  violet:  { bg: 'bg-violet-100',  text: 'text-violet-700',  ring: 'ring-violet-200' },
  pink:    { bg: 'bg-pink-100',    text: 'text-pink-700',    ring: 'ring-pink-200' },
  teal:    { bg: 'bg-teal-100',    text: 'text-teal-700',    ring: 'ring-teal-200' },
});

export const TAG_COLOR_NAMES = Object.freeze(Object.keys(TAG_COLORS));

const tagSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 40 },

    /**
     * Lowercased name, for the uniqueness rule. "Hot Lead" and "hot lead" are
     * the same tag; without this they would be two.
     */
    slug: { type: String, required: true, lowercase: true, trim: true, maxlength: 40, index: true },

    color: { type: String, enum: TAG_COLOR_NAMES, default: 'slate' },
    description: { type: String, default: '', maxlength: 200 },

    /**
     * Denormalised count of what carries this tag, so the manage screen can
     * show usage without an aggregate per row. Recomputed on attach/detach.
     */
    usageCount: { type: Number, default: 0 },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// Unique per workspace, not globally — two agencies may both have "Investor".
// Never a bare `unique: true`: uniqueness in this product is {tenantId, field}.
tagSchema.index({ tenantId: 1, slug: 1 }, { unique: true });

tagSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    _id: String(this._id),
    name: this.name,
    slug: this.slug,
    color: this.color,
    description: this.description,
    usageCount: this.usageCount,
  };
};

const Tag = mongoose.model('Tag', tagSchema);
export default Tag;

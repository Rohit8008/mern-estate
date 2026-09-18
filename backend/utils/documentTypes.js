/**
 * What a document attached to a category actually is.
 *
 * A colony has paperwork that buyers ask for by name — the RERA registration,
 * the sanctioned layout, the authority's approval letter — and photographs that
 * sell it. Storing all of that as untyped files under a `map` tag meant nobody
 * could ask "is this project RERA registered?" without opening attachments one
 * at a time.
 *
 * Each type carries the two things that differ between them: what file it may
 * be, and whether it belongs in front of the public.
 */

export const CATEGORY_DOC_TYPES = [
  {
    id: 'rera',
    label: 'RERA certificate',
    description: 'The project\'s RERA registration certificate.',
    accepts: 'document',
    // RERA registration exists to be disclosed — a buyer is entitled to check
    // it — but publishing is still the admin's decision, not a default. See
    // DEFAULT_PUBLIC below.
    suggestPublic: true,
    single: true,
  },
  {
    id: 'layout',
    label: 'Layout plan',
    description: 'The sanctioned layout or plot map for the colony.',
    accepts: 'both',
    suggestPublic: true,
    single: true,
  },
  {
    id: 'approval',
    label: 'Approval letter',
    description: 'Sanction or approval from the local authority.',
    accepts: 'document',
    suggestPublic: false,
  },
  {
    id: 'brochure',
    label: 'Brochure',
    description: 'The sales brochure you send to buyers.',
    accepts: 'document',
    suggestPublic: true,
  },
  {
    id: 'image',
    label: 'Photograph',
    description: 'Photos of the colony — entrance, roads, amenities, site progress.',
    accepts: 'image',
    suggestPublic: true,
  },
  {
    id: 'other',
    label: 'Other document',
    description: 'Anything else worth keeping against this colony.',
    accepts: 'both',
    suggestPublic: false,
  },
];

const BY_ID = new Map(CATEGORY_DOC_TYPES.map((t) => [t.id, t]));

export const CATEGORY_DOC_TYPE_IDS = CATEGORY_DOC_TYPES.map((t) => t.id);

export function getCategoryDocType(id) {
  return BY_ID.get(id) || null;
}

/**
 * Nothing is public unless someone says so.
 *
 * `suggestPublic` drives what the upload form pre-ticks; it is never applied
 * server-side. Publishing a document is a decision with consequences an admin
 * should make deliberately — an approval letter naming individuals, or a
 * brochure with stale pricing, is not something to expose because a default
 * said so.
 */
export const DEFAULT_PUBLIC = false;

/** Image mime types, for the types that only accept pictures. */
export const CATEGORY_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/**
 * Is this file allowed for this document type?
 * @returns {string|null} the reason it is not, or null when it is fine
 */
export function checkFileForType(typeId, detectedMime) {
  const type = getCategoryDocType(typeId);
  if (!type) return `"${typeId}" is not a document type.`;

  const isImage = CATEGORY_IMAGE_MIMES.has(detectedMime);

  if (type.accepts === 'image' && !isImage) {
    return `${type.label} must be a photo — JPG, PNG or WebP.`;
  }
  if (type.accepts === 'document' && isImage) {
    return `${type.label} should be a PDF or an Office document, not a photo. Use "Other document" if you only have a picture of it.`;
  }
  return null;
}

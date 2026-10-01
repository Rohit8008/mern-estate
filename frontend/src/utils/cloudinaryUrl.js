// Cloudinary delivery transformations for list thumbnails: format/quality
// negotiation (f_auto,q_auto) and a width cap, so a 4000px upload is not sent
// to a 400px card. Anything that is not a plain Cloudinary image URL is
// returned untouched, and a URL that already carries transformations is left
// alone, which also makes the function idempotent.

const UPLOAD_RE = /^(https?:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.*)$/i;
// "w_300", "f_auto,q_auto", "c_limit,w_400" ...
const KEYS = 'a|ar|b|bo|c|co|d|dl|dn|dpr|e|f|fl|g|h|l|o|p|pg|q|r|t|u|w|x|y|z';
const TRANSFORM_SEGMENT_RE = new RegExp(`^(?:${KEYS})_[^/,]+(?:,(?:${KEYS})_[^/,]+)*$`, 'i');

export function cloudinaryUrl(url, { w } = {}) {
  if (typeof url !== 'string' || !url) return url;
  const width = Math.round(Number(w));
  if (!Number.isFinite(width) || width <= 0) return url;
  const match = UPLOAD_RE.exec(url);
  if (!match) return url;
  const [, prefix, rest] = match;
  const first = rest.split('/')[0];
  if (TRANSFORM_SEGMENT_RE.test(first)) return url; // already transformed
  return `${prefix}f_auto,q_auto,c_limit,w_${width}/${rest}`;
}

/** "url1 400w, url2 800w" — or undefined when the URL is not Cloudinary. */
export function cloudinarySrcSet(url, widths) {
  const sets = widths.map((w) => [cloudinaryUrl(url, { w }), w]);
  if (sets.every(([u]) => u === url)) return undefined;
  return sets.map(([u, w]) => `${u} ${w}w`).join(', ');
}

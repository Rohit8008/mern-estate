/**
 * What a listing status is called, everywhere it is shown.
 *
 * The board called "available" "New properties" while the pill and the form
 * said "Available", and the cards printed the raw code ("under_negotiation").
 * One list, used by every view; an unknown status from workspace config is
 * shown humanised rather than as a code.
 */
export const LISTING_STATUS_LABELS = {
  available: 'Available',
  under_negotiation: 'Under negotiation',
  sold: 'Sold',
  rented: 'Rented',
};

export function listingStatusLabel(status) {
  const key = status || 'available';
  if (LISTING_STATUS_LABELS[key]) return LISTING_STATUS_LABELS[key];
  const words = String(key).replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

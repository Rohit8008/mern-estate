/**
 * Which page numbers to show: always the first and last, a window around the
 * current page, and `null` where a run is elided. Seven slots at most, so the
 * bar never changes width as you page through.
 */
export function pageRange(page, pageCount) {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, null, pageCount];
  if (page >= pageCount - 3) return [1, null, pageCount - 4, pageCount - 3, pageCount - 2, pageCount - 1, pageCount];
  return [1, null, page - 1, page, page + 1, null, pageCount];
}

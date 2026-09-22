/**
 * A calendar date (YYYY-MM-DD) in the viewer's own timezone.
 *
 * `new Date().toISOString().slice(0, 10)` is the UTC date, which in India is
 * still yesterday until 05:30 — so "the last 30 days" ended a day early and a
 * new transaction defaulted to yesterday. Use this wherever the code means
 * "today" (or N days ago) for a date input or a filename.
 *
 * Dates already stored as date-only values (saved from a date input, so held at
 * UTC midnight) are the opposite case: slice those in UTC, not with this.
 */
export function localDateString(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** The local calendar date `days` days before today. */
export function localDateDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return localDateString(d);
}

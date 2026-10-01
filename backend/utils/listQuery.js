/**
 * Paging and sorting for list endpoints, read from the query string.
 *
 * Every list controller parsed `page` and `limit` by hand with `Number(...)`,
 * which meant `?limit=1000000` returned the whole collection and `?page=abc`
 * produced a NaN skip that Mongo rejected as a 500. This is the one place that
 * turns untrusted query values into safe numbers.
 */

// High enough for the existing callers that load a whole range at once —
// Calendar asks for 500 tasks, the mobile app and Reports for 200 clients — and
// low enough that no request returns an entire collection.
const MAX_LIMIT = 500;

function toPositiveInt(value, fallback) {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function parsePaging(query = {}, { defaultLimit = 20, maxLimit = MAX_LIMIT } = {}) {
  const page = toPositiveInt(query.page, 1);
  const limit = Math.min(toPositiveInt(query.limit, defaultLimit), maxLimit);
  return { page, limit, skip: (page - 1) * limit };
}

/**
 * `?sort=field:asc|desc` → a Mongo sort object.
 *
 * `allowed` maps the public sort key to the stored path, and is an ALLOWLIST:
 * sorting by an unindexed or private field is a cheap way to make the database
 * scan a whole collection, or to learn the order of a value the caller cannot
 * read. Anything not listed falls back to the endpoint's default order.
 *
 * `_id` is always the last key, so rows with equal values keep a stable order
 * across pages — without it, a row can appear on two pages or on none.
 */
export function parseSort(raw, allowed, fallback) {
  const [key, dirRaw] = String(raw || '').split(':');
  const path = Object.prototype.hasOwnProperty.call(allowed, key) ? allowed[key] : null;
  const base = path ? { [path]: dirRaw === 'desc' ? -1 : 1 } : { ...fallback };
  if (!('_id' in base)) base._id = Object.values(base)[0] === -1 ? -1 : 1;
  return base;
}

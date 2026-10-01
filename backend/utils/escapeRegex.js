/**
 * Turning someone's search text into a regular expression, safely.
 *
 * Several controllers passed `req.query.q` straight into `new RegExp()` or a
 * `$regex`. That made a stray "(" a 500, let "a.*" match everything, and let
 * "(a+)+$" pin a database thread on catastrophic backtracking. The text is a
 * literal to find, never a pattern, so every metacharacter is escaped.
 *
 * `String()` first: Express parses `?q[$ne]=x` into an object, and an object
 * must not reach a query as anything but its string form.
 */

export function escapeRegex(value) {
  return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A case-insensitive "contains" match for literal text. */
export function containsInsensitive(value) {
  return new RegExp(escapeRegex(value), 'i');
}

/** A case-insensitive whole-value match — "the same name, ignoring case". */
export function equalsInsensitive(value) {
  return new RegExp(`^${escapeRegex(value)}$`, 'i');
}

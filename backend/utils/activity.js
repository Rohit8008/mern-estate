import ActivityLog from '../models/activityLog.model.js';

/**
 * The workspace audit trail.
 *
 * Writes are deliberately non-throwing: an audit write must never be the reason
 * a user's edit fails. Failures are surfaced on the logger instead.
 */

/** Values worth storing verbatim in a before/after pair. */
function summarise(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.length > 20 ? `${value.length} items` : value.map(summarise);
  if (typeof value === 'object') {
    if (value._id) return String(value._id);
    return undefined; // don't dump whole sub-documents into the trail
  }
  if (typeof value === 'string' && value.length > 200) return `${value.slice(0, 200)}…`;
  return value;
}

/**
 * Build a `changes` object holding only the fields that actually differ.
 *
 * Returns null when nothing changed, so a no-op save does not create a
 * misleading "updated" entry.
 */
export function diffFields(before = {}, after = {}, fields) {
  const keys = fields || [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])];
  const changes = {};

  for (const key of keys) {
    const from = summarise(before?.[key]);
    const to = summarise(after?.[key]);
    if (from === undefined && to === undefined) continue;
    if (JSON.stringify(from) === JSON.stringify(to)) continue;
    changes[key] = { from: from ?? null, to: to ?? null };
  }

  return Object.keys(changes).length ? changes : null;
}

/** Best-effort client IP, trusting the proxy headers the app already sets up. */
export function requestIp(req) {
  if (!req) return '';
  return String(req.ip || req.headers?.['x-forwarded-for'] || '').split(',')[0].trim().slice(0, 64);
}

export async function logActivity({
  entityType,
  entityId,
  action,
  message = '',
  meta = {},
  changes = null,
  ip = '',
  createdBy,
}) {
  if (!entityType || !entityId || !action || !createdBy) return null;
  return ActivityLog.create({
    entityType,
    entityId,
    action,
    message,
    meta,
    changes,
    ip,
    createdBy,
  });
}

/**
 * Log from inside a request without having to thread `req.user.id` and the IP
 * through every call site, and without letting a failed write break the write
 * the user actually asked for.
 */
export function logFromRequest(req, entry) {
  const createdBy = entry.createdBy || req?.user?.id;
  if (!createdBy) return Promise.resolve(null);

  return logActivity({ ...entry, createdBy, ip: entry.ip ?? requestIp(req) }).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[activity] failed to record', entry.entityType, entry.action, err?.message);
    return null;
  });
}

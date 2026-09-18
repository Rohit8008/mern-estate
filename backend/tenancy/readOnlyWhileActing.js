/**
 * A platform operator inside a customer's workspace can look, not touch.
 *
 * Tenant switching exists so the vendor can answer "what does the customer
 * actually see?" — a support question. It is not a way to do the customer's
 * work for them, and the difference matters commercially as much as
 * technically: an agency's records are the agency's, and the audit trail on
 * every one of them should name a person at that agency.
 *
 * So the session is read-only while acting. This is enforced here, once, at the
 * edge, rather than in each controller — a controller added next month gets the
 * protection without anyone remembering to ask for it.
 *
 * The alternative (allow writes, log loudly) was rejected: an operator who can
 * silently edit customer data is a liability the customer cannot audit, and
 * "we logged it" is not something they can verify.
 */

import { AuthorizationError } from '../utils/error.js';
import { logger } from '../utils/logger.js';

/** Methods that cannot change anything. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * The few writes that are about the SESSION rather than about the customer's
 * data. Blocking these would trap the operator inside the workspace they are
 * visiting, with no way back out.
 */
const ALWAYS_ALLOWED = [
  'POST /api/platform/stop-acting',
  'POST /api/platform/act-as',   // switching straight to another workspace
  'POST /api/auth/signout',
  'POST /api/auth/signout-all',
  'POST /api/auth/refresh',
];

/**
 * The exempt list is matched by prefix, because `act-as` carries an id. That
 * makes the shape of the path load-bearing, so anything that could mean two
 * things is refused outright rather than interpreted: a `.` or `..` segment, an
 * empty segment, or an encoded slash. Express does not resolve `..` and a proxy
 * in front normalises before we ever see the request, so this is not a live
 * hole — but "not currently reachable" is a weak thing to rest a write
 * boundary on, and rejecting the ambiguity costs nothing.
 */
function isAllowed(req) {
  let path = (req.originalUrl || req.url || '').split('?')[0];

  try {
    path = decodeURIComponent(path);
  } catch (_) {
    return false; // malformed encoding — refuse rather than guess
  }

  const segments = path.split('/').slice(1);
  if (segments.some((seg, i) => seg === '.' || seg === '..' || (seg === '' && i < segments.length - 1))) {
    return false;
  }

  path = path.replace(/\/+$/, '') || '/';

  return ALWAYS_ALLOWED.some((entry) => {
    const [method, prefix] = entry.split(' ');
    return req.method === method && (path === prefix || path.startsWith(`${prefix}/`));
  });
}

export function readOnlyWhileActing(req, res, next) {
  if (!req.actingAs) return next();
  if (SAFE_METHODS.has(req.method)) return next();
  if (isAllowed(req)) return next();

  logger.security?.('acting_write_blocked', {
    userId: req.user?.id,
    actingTenantId: req.actingAs.tenantId,
    homeTenantId: req.actingAs.homeTenantId,
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
  });

  const err = new AuthorizationError(
    `You are viewing ${req.actingAs.name} as a platform operator. This view is read-only — ` +
      'leave the workspace to make changes in your own.'
  );
  err.actingReadOnly = true;
  return next(err);
}

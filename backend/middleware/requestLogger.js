import { logger, sanitizeUrl } from '../utils/logger.js';
import { getLogContext } from '../utils/logContext.js';

// Requests slower than this land in backend_logs as a warning, so a slow
// endpoint shows up in alerting without anyone reading access_logs.
const SLOW_MS = Number(process.env.SLOW_REQUEST_MS) || 2000;

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Session plumbing and log ingest are not "changes to the workspace"; auditing
// them would bury the entries people actually look for.
const NOT_AUDITED = [/^\/api\/auth\/(refresh|signout|csrf)/, /^\/api\/observability\//, /^\/api\/platform\/stop-acting/];

/** The matched route pattern (`/api/clients/:id`), which groups in a dashboard. */
function routePattern(req) {
  return req.route?.path ? `${req.baseUrl || ''}${req.route.path}` : null;
}

/**
 * One access line per request, plus:
 *  - backend_logs warn/error for 4xx/5xx and slow requests;
 *  - an audit_logs entry for every successful change a signed-in person
 *    makes. Doing it here, once, means a controller added later is audited
 *    without remembering to be — until now only one controller wrote audit
 *    entries at all.
 */
export const requestLogger = (req, res, next) => {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const duration = Number(process.hrtime.bigint() - start) / 1e6;
    const userId = req.user?.id ?? null;
    // Auth resolves after this middleware runs; record the user on the log
    // context so the lines below carry it too.
    const ctx = getLogContext();
    if (ctx && userId) ctx.userId = String(userId);

    const url = sanitizeUrl(req.originalUrl);
    const route = routePattern(req);
    const data = {
      method:         req.method,
      url,
      route,
      status:         res.statusCode,
      duration_ms:    Math.round(duration * 10) / 10,
      ip:             req.ip,
      user_agent:     req.get('User-Agent'),
      client:         req.get('X-Client') || null,
      user_id:        userId,
      acting:         req.user?.act ? true : undefined,
      content_length: parseInt(res.get('Content-Length') || '0', 10) || 0,
    };
    logger.access(data);

    if (res.statusCode >= 500) logger.error('Request failed', data);
    else if (res.statusCode >= 400 && res.statusCode !== 401 && res.statusCode !== 404) logger.warn('Request rejected', data);
    else if (duration >= SLOW_MS) logger.warn('Slow request', data);

    if (
      MUTATING.has(req.method) && userId && res.statusCode < 400 &&
      !NOT_AUDITED.some((re) => re.test(req.originalUrl))
    ) {
      logger.audit(`${req.method} ${route || url.split('?')[0]}`, {
        user_id:   String(userId),
        role:      req.user?.role,
        entity_id: req.params?.id || req.params?.clientId || null,
        status:    res.statusCode,
        ip:        req.ip,
      });
    }
  });

  next();
};

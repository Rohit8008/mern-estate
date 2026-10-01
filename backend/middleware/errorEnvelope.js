import { ERROR_CODES } from '../utils/error.js';

const CODE_BY_STATUS = {
  400: ERROR_CODES.BAD_REQUEST,
  401: ERROR_CODES.UNAUTHENTICATED,
  402: ERROR_CODES.PLAN_LIMIT,
  403: ERROR_CODES.FORBIDDEN,
  404: ERROR_CODES.NOT_FOUND,
  409: ERROR_CODES.CONFLICT,
  413: ERROR_CODES.BAD_REQUEST,
  429: ERROR_CODES.RATE_LIMITED,
};

/**
 * Give every failure response a `code` and the `requestId`, wherever it was
 * written.
 *
 * Most errors go through globalErrorHandler, but about a hundred call sites
 * answer `res.status(4xx).json({ success: false, message })` themselves —
 * upload limits, the rate limiter, route guards. Rewriting each one would be a
 * hundred chances to change a message a client depends on; this adds the two
 * fields to all of them in one place and changes nothing else. A body that
 * already names its code keeps it.
 */
export function errorEnvelope(req, res, next) {
  const json = res.json.bind(res);
  res.json = (body) => {
    if (
      res.statusCode >= 400 &&
      body && typeof body === 'object' && !Array.isArray(body) &&
      body.success === false
    ) {
      const extra = {};
      if (!body.code) extra.code = CODE_BY_STATUS[res.statusCode] || (res.statusCode >= 500 ? ERROR_CODES.INTERNAL : ERROR_CODES.BAD_REQUEST);
      if (!body.requestId && req.id) extra.requestId = req.id;
      if (Object.keys(extra).length) return json({ ...body, ...extra });
    }
    return json(body);
  };
  next();
}

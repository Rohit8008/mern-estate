/**
 * CSRF defence: double-submit token.
 *
 * Authentication here is cookie-only, and in production the session cookies are
 * issued with `sameSite: 'none'` so the app can be served from a different
 * origin than the API. That setting is an instruction to the browser to attach
 * those cookies to CROSS-SITE requests, which is precisely the condition that
 * makes a CSRF token mandatory rather than optional.
 *
 * CORS does not cover this. A cross-origin form POST with
 * `application/x-www-form-urlencoded` is a CORS "simple request": no preflight
 * is sent, the browser attaches the cookies anyway, and `express.urlencoded`
 * parses the body. The attacker never needs to read the response — they only
 * need the write to happen.
 *
 * The token is a random value in a READABLE cookie. Script on our own origin can
 * read it and echo it in a header; script on another origin cannot read our
 * cookies, and cannot set a custom header without triggering a preflight that
 * CORS then refuses. It is deliberately NOT a secret: it is a proof of
 * same-origin, not an identity.
 */

import crypto from 'crypto';
import { config } from '../config/environment.js';
import { PUBLIC_ROUTES } from '../security/publicRoutes.js';

export const CSRF_COOKIE = 'csrf_token';
export const CSRF_HEADER = 'x-csrf-token';

/** Methods that do not change state. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Readable by script on purpose — that is the whole mechanism. It carries no
 * authority by itself: presenting it proves the caller could read our cookies,
 * which an attacker's origin cannot do.
 */
export const csrfCookieOptions = {
  httpOnly: false,
  sameSite: config.server.isProduction ? 'none' : 'lax',
  secure: config.server.isProduction,
  maxAge: 30 * 24 * 60 * 60 * 1000,
  path: '/',
};

export function issueCsrfToken(res) {
  const token = crypto.randomBytes(32).toString('base64url');
  res.cookie(CSRF_COOKIE, token, csrfCookieOptions);
  return token;
}

export function clearCsrfToken(res) {
  const opts = { ...csrfCookieOptions };
  delete opts.maxAge;
  res.clearCookie(CSRF_COOKIE, opts);
}

/**
 * Writes that legitimately arrive without a session, derived from the SAME
 * allowlist `tests/routeAccess.test.js` enforces rather than restated here.
 * A route with no ambient credential cannot be cross-site forged into doing
 * anything the caller could not already do directly.
 */
const PUBLIC_WRITE_MATCHERS = PUBLIC_ROUTES
  .filter((r) => !SAFE_METHODS.has(String(r.method).toUpperCase()))
  .map((r) => ({
    method: String(r.method).toUpperCase(),
    re: new RegExp(`^${String(r.path).replace(/\/+$/, '').replace(/:[^/]+/g, '[^/]+')}/?$`),
  }));

function isPublicWrite(method, pathname) {
  return PUBLIC_WRITE_MATCHERS.some((m) => m.method === method && m.re.test(pathname));
}

/** Constant-time compare, so the check leaks nothing about the token. */
function sameToken(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length || !a.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function requireCsrfToken(req, res, next) {
  const method = String(req.method).toUpperCase();
  if (SAFE_METHODS.has(method)) return next();

  const pathname = String(req.originalUrl || req.url).split('?')[0].replace(/\/+$/, '') || '/';
  if (isPublicWrite(method, pathname)) return next();

  // No session cookie means no ambient credential to abuse, so there is nothing
  // to forge. Let it through and let the route's own auth guard answer 401 —
  // otherwise every signed-out write reports a confusing CSRF error.
  if (!req.cookies?.access_token && !req.cookies?.refresh_token) return next();

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.get(CSRF_HEADER);

  if (!cookieToken) {
    // A session predating this check. Fail closed, but say what to do: one
    // sign-in mints the cookie.
    return res.status(403).json({
      success: false,
      code: 'CSRF_COOKIE_MISSING',
      message: 'Your session predates a security update. Please sign in again.',
    });
  }

  if (!sameToken(cookieToken, headerToken)) {
    return res.status(403).json({
      success: false,
      code: 'CSRF_TOKEN_INVALID',
      message: 'This request could not be verified. Please refresh the page and try again.',
    });
  }

  return next();
}

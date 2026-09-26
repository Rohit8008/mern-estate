/**
 * Every endpoint that may be reached without signing in.
 *
 * ── Why an allowlist rather than a policy table ──────────────────────────────
 * Access control here is spread across three levels — `verifyToken` on a route,
 * `router.use(verifyToken)` on a whole router, and app-level middleware — so
 * there is no single place to read "is this endpoint public?". A 189-row table
 * restating what each route already does would go stale within a week and prove
 * nothing.
 *
 * What actually goes wrong is narrower and worth guarding: someone adds a route
 * and forgets the guard, and it is public without anyone deciding that. So this
 * file lists only the endpoints that are public ON PURPOSE, each with a reason,
 * and `tests/routeAccess.test.js` walks the live Express router and fails if any
 * mounted route is neither guarded nor listed here.
 *
 * Adding an entry is therefore a deliberate act with a note attached, which is
 * the property that matters. This is the idea behind channelkart's
 * FeatureEndpoint registry, sized for this codebase.
 */

/**
 * @typedef {object} PublicRoute
 * @property {string} method  HTTP verb, or '*'
 * @property {string} path    the mounted path, Express params included
 * @property {string} why     why it is safe for this to be public
 * @property {boolean} [devOnly]  mounted only when NODE_ENV=development, so the
 *           staleness check does not expect to find it in other environments
 */

/** @type {PublicRoute[]} */
export const PUBLIC_ROUTES = [
  // ── Infrastructure ─────────────────────────────────────────────────────────
  { method: 'GET', path: '/api/health/health', why: 'Load-balancer probe; no request context to authenticate.' },
  { method: 'GET', path: '/api/health/ready', why: 'Readiness probe for the orchestrator.' },
  { method: 'GET', path: '/api/health/live', why: 'Liveness probe for the orchestrator.' },
  { method: 'GET', path: '/api/health/startup', why: 'Startup probe for the orchestrator.' },
  {
    method: 'GET',
    path: '/api/health/detailed',
    why: 'Dependency status for on-call. Reports up/down only — no data, no configuration values.',
  },
  { method: 'GET', path: '/api/health/metrics', why: 'Scrape endpoint for the metrics collector.' },

  // ── Signing in ─────────────────────────────────────────────────────────────
  { method: 'POST', path: '/api/auth/signin', why: 'The sign-in endpoint itself. Rate limited.' },
  { method: 'POST', path: '/api/auth/signup', why: 'Self-registration. Rate limited.' },
  { method: 'POST', path: '/api/auth/refresh', why: 'Exchanges a refresh cookie; the cookie is the credential.' },
  { method: 'GET', path: '/api/auth/csrf', why: 'Echoes the caller its own CSRF cookie value. Carries no authority and reveals nothing a same-origin script could not already read; cross-origin callers cannot read the response.' },
  { method: 'POST', path: '/api/user/password/request-otp', why: 'Password reset starts from a signed-out state. Rate limited.' },
  { method: 'POST', path: '/api/user/password/reset', why: 'Completes a reset with an emailed OTP, which is the credential.' },
  {
    method: 'GET',
    path: '/api/auth/invite/:token',
    why: 'An invited user has no session and cannot know their workspace — the token supplies it. Returns only the workspace name/logo and the address it was sent to; unknown, expired and used tokens all answer the same way. Rate limited.',
  },
  {
    method: 'POST',
    path: '/api/auth/invite/:token',
    why: 'Completes account setup. The 32-byte token IS the credential, stored hashed, single-use and expiring. Rate limited.',
  },
  {
    method: 'GET',
    path: '/api/auth/clear-rate-limit',
    devOnly: true,
    why: 'Only mounted when NODE_ENV=development — see routes/auth.route.js. Never exists in production, which the route-access test confirms by not finding it.',
  },

  // ── Workspace identity, needed before sign-in ──────────────────────────────
  {
    method: 'GET',
    path: '/api/tenant/config',
    why: 'The sign-in screen needs this workspace\'s name, logo and colours before anyone has signed in. Serves toPublicConfig() only — never limits, billing or internal notes.',
  },
  {
    method: 'GET',
    path: '/api/tenant/lookup',
    why: 'The sign-in Workspace field confirms the name typed exists and shows what it is called. Returns slug, name and logo only; rate limited like sign-in.',
  },
  { method: 'GET', path: '/api/tenant/features', why: 'Which modules this workspace has, for rendering the signed-out shell.' },

  // ── Sharing, which replaced the public catalogue ───────────────────────────
  //
  // Anonymous browsing of the property book was removed: an agency's stock,
  // pricing and addresses are its own, and a visitor who could page through all
  // of it had more than the business meant to give. What went out the door on
  // purpose now goes through a link an agent creates per property.
  {
    method: 'GET',
    path: '/api/share/open/:token',
    why: 'A share link an agent sent to a buyer. The 32-byte token IS the credential; links expire, can be revoked and can carry a passcode. The response is an explicit allowlist of fields — never owner contacts, internal notes, assignment or commission. Rate limited.',
  },

  // ── Inbound from visitors ──────────────────────────────────────────────────
  { method: 'POST', path: '/api/contact/', why: 'The public contact form. Rate limited.' },
  {
    method: 'GET',
    path: '/api/unsubscribe/:token',
    why: 'The unsubscribe link in an automated email, opened by a lead with no account. The signed token names one lead and is the whole credential; the response is the agency name and a masked address only. Rate limited.',
  },
  {
    method: 'POST',
    path: '/api/unsubscribe/:token',
    why: 'Records the unsubscribe — from the page, or from a mail client\'s one-click button (RFC 8058), which sends no cookies or CSRF header. It can only stop email to the address on the lead the signed token names. Rate limited.',
  },
  { method: 'POST', path: '/api/observability/logs', why: 'Client-side error reports, which are most valuable exactly when a user cannot sign in. Rate limited.' },

  // ── Miscellaneous ──────────────────────────────────────────────────────────
  { method: 'GET', path: '/api/user/test', why: 'A liveness stub returning a fixed string. Holds no data.' },

  // The SPA fallback and static assets, not an API surface.
  { method: 'GET', path: '*', why: 'Serves the single-page app shell for any unmatched path.' },
];

/** Middleware names that count as authenticating a request. */
export const AUTH_GUARDS = new Set([
  'verifyToken',
  'tryVerifyToken',
  'requireAdmin',
  'requirePermission',
  'requirePlatformAdmin',
  'canCreateListing',
]);

const key = (method, path) => `${String(method).toUpperCase()} ${path}`;

const INDEX = new Map(PUBLIC_ROUTES.map((r) => [key(r.method, r.path), r]));

/** The declaration for a route, or null when it is not declared public. */
export function publicRouteFor(method, path) {
  return INDEX.get(key(method, path)) || INDEX.get(key('*', path)) || null;
}

export function isDeclaredPublic(method, path) {
  return publicRouteFor(method, path) !== null;
}

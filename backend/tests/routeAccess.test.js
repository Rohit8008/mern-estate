/**
 * Every mounted route is either guarded or deliberately public.
 *
 * The failure this catches: someone adds an endpoint, forgets the guard, and it
 * is reachable without signing in — with nobody having decided that. Access
 * control here lives at three levels (a guard on the route, `router.use()` on a
 * whole router, app-level middleware), so no one file answers "is this public?"
 * and a missing guard looks exactly like a route that is public on purpose.
 *
 * This walks the live Express router — the real thing the server serves, not a
 * list someone maintained — and requires each route to be one or the other.
 * Making an endpoint public becomes a deliberate edit to publicRoutes.js with a
 * stated reason.
 */

import mongoose from 'mongoose';
import { registerTenancy } from '../tenancy/tenantPlugin.js';
import { PUBLIC_ROUTES, AUTH_GUARDS, isDeclaredPublic } from '../security/publicRoutes.js';

let routes;

beforeAll(async () => {
  // Tenancy must be registered before app.js pulls in the models.
  registerTenancy(mongoose);
  const { createApp } = await import('../app.js');
  routes = collectRoutes(createApp());
});

/**
 * Walk the router tree, carrying router-level middleware down to the routes it
 * protects. Reading only `layer.route.stack` would miss `router.use(verifyToken)`
 * and report a whole guarded router as unprotected.
 */
function collectRoutes(app) {
  const found = [];

  const walk = (stack, prefix = '', inherited = []) => {
    const carried = [...inherited];
    for (const layer of stack) {
      if (layer.route) {
        const own = layer.route.stack.map((s) => s.name).filter((n) => AUTH_GUARDS.has(n));
        Object.keys(layer.route.methods)
          .filter((m) => m !== '_all')
          .forEach((m) =>
            found.push({
              method: m.toUpperCase(),
              path: prefix + layer.route.path,
              guards: [...new Set([...carried, ...own])],
            })
          );
      } else if (layer.name === 'router' && layer.handle?.stack) {
        const src = layer.regexp?.source || '';
        const seg = src
          .replace('^\\/', '/')
          .replace('\\/?(?=\\/|$)', '')
          .replace(/\\\//g, '/')
          .replace(/\$$/, '');
        walk(layer.handle.stack, prefix + (seg === '/(?:/)?' || seg === '(?:/)?' ? '' : seg), carried);
      } else if (AUTH_GUARDS.has(layer.name)) {
        carried.push(layer.name);
      }
    }
  };

  walk(app._router.stack);
  return found;
}

describe('route access', () => {
  it('mounts a substantial API', () => {
    // A sanity check on the walker itself: if it silently stopped finding
    // routes, every assertion below would pass while checking nothing.
    expect(routes.length).toBeGreaterThan(100);
  });

  it('leaves no route both unguarded and undeclared', () => {
    const escaped = routes
      .filter((r) => r.guards.length === 0)
      .filter((r) => !isDeclaredPublic(r.method, r.path));

    if (escaped.length) {
      const list = escaped.map((r) => `  ${r.method} ${r.path}`).join('\n');
      throw new Error(
        `${escaped.length} route(s) are reachable without signing in and are not declared public:\n\n${list}\n\n` +
          'Either add an auth guard, or — if it is meant to be public — add it to ' +
          'security/publicRoutes.js with a note saying why that is safe.'
      );
    }
  });

  it('keeps the public list free of entries that no longer exist', () => {
    // A stale entry is a standing permission to be public that nothing checks —
    // and it silently re-authorises a path if that path ever comes back.
    const mounted = new Set(routes.map((r) => `${r.method} ${r.path}`));
    const stale = PUBLIC_ROUTES.filter(
      (r) => r.method !== '*' && !r.devOnly && !mounted.has(`${r.method} ${r.path}`)
    );
    expect(stale.map((r) => `${r.method} ${r.path}`)).toEqual([]);
  });

  it('does not mount development-only routes under test', () => {
    // NODE_ENV is 'test' here, so anything flagged devOnly must be absent —
    // which is the same condition that keeps it out of production.
    const mounted = new Set(routes.map((r) => `${r.method} ${r.path}`));
    PUBLIC_ROUTES.filter((r) => r.devOnly).forEach((r) => {
      expect(mounted.has(`${r.method} ${r.path}`)).toBe(false);
    });
  });

  it('gives every public route a stated reason', () => {
    const unexplained = PUBLIC_ROUTES.filter((r) => !r.why || r.why.trim().length < 20);
    expect(unexplained.map((r) => `${r.method} ${r.path}`)).toEqual([]);
  });

  it('keeps every write to the platform console behind the platform guard', () => {
    // `role: 'admin'` is an admin of ONE agency. If a platform route ever
    // relied on that, every customer's own admin could administer every
    // workspace.
    const platform = routes.filter((r) => r.path.startsWith('/api/platform'));
    expect(platform.length).toBeGreaterThan(0);
    platform.forEach((r) => {
      expect(r.guards).toContain('requirePlatformAdmin');
    });
  });

  it('requires a session for anything that writes', () => {
    const publicWrites = routes
      .filter((r) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method))
      .filter((r) => r.guards.length === 0);

    // The few that are legitimately public — sign-in, password reset, the
    // contact form — are declared, and each carries its own rate limit.
    publicWrites.forEach((r) => {
      expect(isDeclaredPublic(r.method, r.path)).toBe(true);
    });
  });
});

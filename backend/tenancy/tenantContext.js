/**
 * Request-scoped tenant context.
 *
 * Every query in the application is scoped to a tenant by `tenantPlugin`, which
 * reads the current tenant from here rather than from a parameter threaded
 * through every call site. Node's AsyncLocalStorage is what makes that safe:
 * the value is bound to the async execution chain of one request, so two
 * concurrent requests for two different agencies cannot see each other's
 * context — which a module-level variable absolutely would not guarantee.
 *
 * This is the Node counterpart of the ThreadLocal security context that
 * channelkart's `SecurityContextUtils` uses to route each request to its LOB.
 *
 * The rule for the rest of the codebase: never read `tenantId` off `req` to
 * build a query filter by hand. Let the plugin do it. Reach for
 * `runWithoutTenantScope` only in the few places that are deliberately
 * cross-tenant, and say why in a comment.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

/** @typedef {{ tenantId: string, tenant?: object, userId?: string, role?: string, bypass?: boolean }} TenantStore */

const storage = new AsyncLocalStorage();

/**
 * Run `fn` with the given tenant bound to the async context.
 * Everything awaited inside — including work started and not awaited — sees it.
 */
export function runWithTenant(store, fn) {
  if (!store?.tenantId && !store?.bypass) {
    throw new Error('runWithTenant requires a tenantId (or an explicit bypass)');
  }
  return storage.run({ ...store }, () => settleInScope(fn()));
}

/**
 * A Mongoose Query is lazy: `Model.find()` builds an object and only touches
 * the database when something awaits it. So a query CREATED inside this scope
 * but AWAITED outside it — the natural shape of
 * `await runWithTenant(store, () => Model.find())` — would execute with no
 * context at all, and the plugin would refuse it (or, worse under a bypass, run
 * it unscoped).
 *
 * Starting the thenable here forces execution to begin while the context is
 * still bound, so callers can write the natural thing and be right.
 */
function settleInScope(result) {
  if (result && typeof result.then === 'function') {
    return Promise.resolve(result);
  }
  return result;
}

/**
 * Run `fn` with tenant scoping switched off.
 *
 * For work that is legitimately cross-tenant: the platform admin console,
 * scheduled jobs that sweep every tenant, migrations, and the login lookup that
 * has to find a user before it knows which tenant they belong to. Anything else
 * using this is a bug waiting to leak one agency's data into another's screen.
 *
 * @param {string} reason recorded on the context, so an audit can answer "which
 *        code paths run unscoped?" without grepping for the function name
 */
export function runWithoutTenantScope(reason, fn) {
  if (!reason || typeof reason !== 'string') {
    throw new Error('runWithoutTenantScope requires a reason string');
  }
  return storage.run({ bypass: true, bypassReason: reason }, () => settleInScope(fn()));
}

/** The active context, or undefined outside a request (a REPL, a boot script). */
export function getTenantStore() {
  return storage.getStore();
}

/** The active tenant id, or null when unscoped or outside a request. */
export function getTenantId() {
  const store = storage.getStore();
  if (!store || store.bypass) return null;
  return store.tenantId || null;
}

/** The full tenant document for the active request, when one was loaded. */
export function getTenant() {
  const store = storage.getStore();
  if (!store || store.bypass) return null;
  return store.tenant || null;
}

/** True when the current execution is deliberately running unscoped. */
export function isTenantScopeBypassed() {
  return storage.getStore()?.bypass === true;
}

/**
 * True when there is no context at all — a boot script, a test, a queue worker
 * that hasn't opted in. The plugin treats this differently from a bypass: see
 * `strictTenancy` in tenantPlugin.js.
 */
export function hasTenantContext() {
  return storage.getStore() !== undefined;
}

/**
 * Attach extra values (userId, role) to the active context without replacing it.
 * Used by auth middleware after the tenant is already resolved.
 */
export function amendTenantStore(patch) {
  const store = storage.getStore();
  if (!store) return;
  Object.assign(store, patch);
}

/**
 * Run a lookup about the CALLER inside the workspace their account lives in.
 *
 * Almost every read in this product should be scoped to the workspace being
 * viewed — that is the whole point of the plugin. Reads about the person doing
 * the viewing are the exception: a platform operator inside a customer's
 * workspace is still themselves, and their user record, their roles and their
 * permissions all live at home. Scoping those to the workspace on screen finds
 * nothing, and "nothing" reads as "signed out".
 *
 * `req.homeTenantId` is set by resolveTenant before any impersonation is
 * applied. When nobody is acting it equals `req.tenantId`, so this is a no-op
 * on the ordinary path.
 */
export function inHomeTenant(req, fn) {
  const tenantId = String(req?.homeTenantId || req?.tenantId || '');
  if (!tenantId) return fn();
  return runWithTenant({ tenantId }, fn);
}

/**
 * Run `fn` once inside every workspace.
 *
 * Scheduled jobs are the reason this exists. A job has no request and therefore
 * no tenant, and a query with no tenant context throws by design — so a sweep
 * has to enter each workspace explicitly rather than querying across all of
 * them. Reading the tenant list is the one genuinely cross-tenant step, so it
 * is the only part that runs unscoped.
 *
 * One workspace failing does not stop the others: the job would otherwise be
 * hostage to whichever agency has the worst data.
 *
 * @param {Function} fn called as fn(tenant); its return value is collected
 * @param {object} [opts]
 * @param {boolean} [opts.serviceableOnly=true] skip suspended/cancelled/expired
 * @returns {Promise<{results: Array, failures: Array}>}
 */
export async function forEachTenant(fn, { serviceableOnly = true } = {}) {
  const { default: Tenant } = await import('../models/tenant.model.js');

  const tenants = await runWithoutTenantScope(
    'scheduled job enumerating every workspace',
    () => Tenant.find({}).exec()
  );

  const results = [];
  const failures = [];

  for (const tenant of tenants) {
    if (serviceableOnly && typeof tenant.isServiceable === 'function' && !tenant.isServiceable()) {
      continue;
    }

    try {
      const value = await runWithTenant(
        { tenantId: String(tenant._id), tenant },
        () => fn(tenant)
      );
      results.push({ tenantId: String(tenant._id), slug: tenant.slug, value });
    } catch (error) {
      failures.push({ tenantId: String(tenant._id), slug: tenant.slug, error: error.message });
    }
  }

  return { results, failures };
}

/**
 * Tenant resolution: decide which agency a request belongs to, then run the
 * rest of the request inside that tenant's context.
 *
 * Resolution order, most authoritative first:
 *   1. the `tid` claim on a signed JWT       — cannot be forged
 *   2. a custom domain           (crm.acme.in)
 *   3. a subdomain of the app     (acme.realvista.app)
 *   4. the `x-tenant` header      — API clients and local development
 *   5. the default tenant         — single-tenant deployments and the
 *                                   migration window before every user's token
 *                                   carries a tenant
 *
 * If a token names one tenant and the host names another, the request is
 * refused: a valid session for one agency must not operate on another agency's
 * domain, and silently preferring one over the other is how that becomes
 * possible.
 */

import jwt from 'jsonwebtoken';
import Tenant from '../models/tenant.model.js';
import { config } from '../config/environment.js';
import { MemoryCache } from '../utils/cache.js';
import { logger } from '../utils/logger.js';
import { runWithTenant, runWithoutTenantScope } from './tenantContext.js';
import { TenantScopeError } from './tenantPlugin.js';

/**
 * Tenant records change rarely and are read on every single request, so they
 * are cached briefly in process. The TTL is short enough that suspending an
 * agency takes effect within a minute without a deploy or a restart.
 */
const TENANT_CACHE_TTL_MS = 60_000;
// A cache of its own, not the shared one from getCache(): that singleton's LRU is
// sized for search results and would evict tenants on a busy list request.
const tenantCache = new MemoryCache({ ttlMs: TENANT_CACHE_TTL_MS, maxSize: 500 });

/** Hosts that are the platform itself rather than any tenant's subdomain. */
const RESERVED_SUBDOMAINS = new Set([
  'www', 'app', 'api', 'admin', 'auth', 'static', 'cdn', 'assets', 'localhost',
]);

export function invalidateTenantCache(tenant) {
  if (!tenant) return tenantCache.clearByPrefix('tenant:');
  tenantCache.del(`tenant:id:${tenant._id}`);
  tenantCache.del(`tenant:slug:${tenant.slug}`);
  if (tenant.customDomain) tenantCache.del(`tenant:domain:${tenant.customDomain}`);
  return undefined;
}

/**
 * Load a tenant, cached. Runs unscoped by definition — the tenant collection is
 * global, and this is the lookup that decides the scope for everything else.
 */
async function loadTenant(key, query) {
  const cacheKey = `tenant:${key}`;
  const cached = tenantCache.get(cacheKey);
  if (cached !== null) return cached;

  const tenant = await runWithoutTenantScope(
    'resolving which tenant a request belongs to',
    () => Tenant.findOne({ ...query, isDeleted: { $ne: true } })
  );

  // Negative results are cached too, so a flood of requests for a nonexistent
  // subdomain doesn't turn into a flood of queries.
  tenantCache.set(cacheKey, tenant || false);
  return tenant || false;
}

export const findTenantById = (id) => loadTenant(`id:${id}`, { _id: id });
export const findTenantBySlug = (slug) => loadTenant(`slug:${slug}`, { slug });
export const findTenantByDomain = (domain) => loadTenant(`domain:${domain}`, { customDomain: domain });

/** The fallback tenant for deployments that haven't split into many yet. */
export async function getDefaultTenant() {
  const slug = config.tenancy?.defaultTenantSlug || 'default';
  return findTenantBySlug(slug);
}

/**
 * Read the tenant claims from the access token without enforcing auth.
 *
 * Three claims matter here and they mean different things:
 *   `tid` — the workspace the USER belongs to. Where their account lives.
 *   `act` — the workspace a platform operator is currently looking at.
 *   `pa`  — signed proof that the token was minted for a platform operator.
 *
 * `act` is honoured only alongside `pa`, and `pa` is only ever set by
 * `startActingAs`, which re-reads the flag from the database first. A user who
 * somehow got `act` onto a token without `pa` is simply scoped to their own
 * workspace, which is where they started.
 */
function claimsFromToken(req) {
  const token = req.cookies?.access_token;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwt.secret, {
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    });
    if (!payload?.tid) return null;
    return {
      tid: String(payload.tid),
      act: payload.pa === true && payload.act ? String(payload.act) : null,
    };
  } catch (_) {
    // An expired or bad token resolves no tenant; verifyToken will reject the
    // request on its own terms further down the chain.
    return null;
  }
}

/** Split the Host header into a candidate subdomain and the bare host. */
function hostParts(req) {
  const raw = String(req.headers['x-forwarded-host'] || req.headers.host || '');
  const host = raw.split(',')[0].trim().split(':')[0].toLowerCase();
  if (!host) return { host: '', subdomain: null };

  const appDomain = (config.tenancy?.appDomain || '').toLowerCase();
  if (appDomain && host.endsWith(`.${appDomain}`)) {
    const sub = host.slice(0, -(appDomain.length + 1));
    // Only a single label counts: a.b.realvista.app is not tenant "a.b".
    if (sub && !sub.includes('.') && !RESERVED_SUBDOMAINS.has(sub)) {
      return { host, subdomain: sub };
    }
  }
  return { host, subdomain: null };
}

/**
 * Express middleware. Resolves the tenant and runs the remainder of the request
 * inside its context, so every query downstream is scoped without any handler
 * having to remember.
 */
export function resolveTenant({ required = true } = {}) {
  return async function tenantResolver(req, res, next) {
    try {
      const { host, subdomain } = hostParts(req);

      const claims = claimsFromToken(req);
      const fromToken = claims?.tid || null;
      const fromDomain = host ? await findTenantByDomain(host) : false;
      const fromSubdomain = subdomain ? await findTenantBySlug(subdomain) : false;

      const headerSlug = req.headers['x-tenant'];
      const fromHeader = headerSlug ? await findTenantBySlug(String(headerSlug).toLowerCase()) : false;

      const fromHost = fromDomain || fromSubdomain || false;

      // A session must not be usable on another agency's host.
      if (fromToken && fromHost && String(fromHost._id) !== String(fromToken)) {
        logger.security?.('tenant_host_mismatch', {
          tokenTenant: fromToken,
          hostTenant: String(fromHost._id),
          host,
          ip: req.ip,
        });
        return next(new TenantScopeError('This session does not belong to this workspace.'));
      }

      let tenant =
        (fromToken ? await findTenantById(fromToken) : false) ||
        fromHost ||
        fromHeader ||
        (await getDefaultTenant());

      if (!tenant) {
        if (!required) return next();
        return next(new TenantScopeError('No workspace matched this request.'));
      }

      if (!tenant.isServiceable()) {
        const reason =
          tenant.status === 'suspended' ? 'This workspace is suspended. Contact support.'
          : tenant.status === 'cancelled' ? 'This workspace has been closed.'
          : 'This trial has ended. Contact support to continue.';
        const err = new TenantScopeError(reason);
        err.statusCode = 403;
        return next(err);
      }

      // The operator's own workspace, before any impersonation is applied. It
      // stays on the request because identity — the user record, their roles,
      // their refresh tokens — continues to live here.
      req.homeTenant = tenant;
      req.homeTenantId = String(tenant._id);

      if (claims?.act && claims.act !== String(tenant._id)) {
        const target = await findTenantById(claims.act);
        if (!target) {
          // The workspace was deleted while the operator was inside it. Falling
          // back to their own is the safe direction to fail.
          logger.warn('Acting-as target no longer exists; falling back to home workspace', {
            act: claims.act,
          });
        } else {
          // Deliberately NOT gated on isServiceable(): a suspended or expired
          // workspace is precisely the one support needs to be able to open.
          // Nothing can be changed from here anyway — see readOnlyWhileActing.
          tenant = target;
          req.actingAs = {
            tenantId: String(target._id),
            name: target.name,
            slug: target.slug,
            status: target.status,
            homeTenantId: req.homeTenantId,
          };
        }
      }

      req.tenant = tenant;
      req.tenantId = String(tenant._id);

      // Everything from here runs inside the tenant's context — the workspace
      // being viewed, which is the acting target when there is one.
      return runWithTenant({ tenantId: String(tenant._id), tenant }, () => next());
    } catch (err) {
      return next(err);
    }
  };
}

/**
 * Wrap non-request work (scripts, cron jobs, queue consumers) in a tenant
 * context. Without this a job's queries throw, which is the intended
 * behaviour — a background job that forgets its tenant is a data leak.
 */
export async function withTenantBySlug(slug, fn) {
  const tenant = await findTenantBySlug(slug);
  if (!tenant) throw new TenantScopeError(`No tenant with slug "${slug}"`);
  return runWithTenant({ tenantId: String(tenant._id), tenant }, fn);
}

/** Run `fn` once per active tenant — the shape most cron jobs need. */
export async function forEachTenant(reason, fn) {
  const tenants = await runWithoutTenantScope(reason, () =>
    Tenant.find({ isDeleted: { $ne: true }, status: { $in: ['trial', 'active'] } })
  );
  const results = [];
  for (const tenant of tenants) {
    results.push(
      await runWithTenant({ tenantId: String(tenant._id), tenant }, () => fn(tenant))
    );
  }
  return results;
}

import {
  getTenantId,
  hasTenantContext,
  isTenantScopeBypassed,
} from '../tenancy/tenantContext.js';

const DEFAULT_MAX_SIZE = 1000;
const DEFAULT_SWEEP_MS = 60_000;

export class MemoryCache {
  constructor({ ttlMs = 300000, maxSize = DEFAULT_MAX_SIZE, sweepMs = DEFAULT_SWEEP_MS } = {}) {
    this.ttlMs = ttlMs;
    this.maxSize = maxSize;
    this.store = new Map();
    this._sweeper = null;
    if (sweepMs > 0) this._startSweeper(sweepMs);
  }

  /**
   * Expired entries used to sit in memory until the same key was read again;
   * with many distinct query keys that is an unbounded-until-LRU leak. The
   * timer is unref()'d so it never keeps a process (or a test run) alive.
   */
  _startSweeper(sweepMs) {
    this._sweeper = setInterval(() => this.sweep(), sweepMs);
    this._sweeper.unref?.();
  }

  /** Drop every expired entry. Returns how many were removed. */
  sweep() {
    let removed = 0;
    for (const [key, entry] of this.store) {
      if (!this._isFresh(entry)) {
        this.store.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  stopSweeper() {
    if (this._sweeper) clearInterval(this._sweeper);
    this._sweeper = null;
  }

  _isFresh(entry) {
    if (!entry) return false;
    return Date.now() - entry.timestamp < (entry.ttlMs ?? this.ttlMs);
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (!this._isFresh(entry)) {
      this.store.delete(key);
      return null;
    }

    // simple LRU: refresh key order
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key, value, { ttlMs } = {}) {
    if (this.store.size >= this.maxSize) {
      const firstKey = this.store.keys().next().value;
      if (firstKey !== undefined) this.store.delete(firstKey);
    }

    this.store.set(key, { value, timestamp: Date.now(), ttlMs });
  }

  del(key) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }

  /**
   * Delete every key starting with `prefix`. With `suffix`, only keys that also
   * end with it — which is how one workspace's entries are cleared without
   * touching another's (tenant scope is a `::t=<id>` suffix).
   */
  clearByPrefix(prefix, { suffix } = {}) {
    if (!prefix) return;
    for (const key of this.store.keys()) {
      const k = String(key);
      if (k.startsWith(prefix) && (!suffix || k.endsWith(suffix))) this.store.delete(key);
    }
  }
}

let sharedCache = null;

export function getCache({ ttlMs, maxSize } = {}) {
  if (!sharedCache) {
    sharedCache = new MemoryCache({ ttlMs, maxSize });
  }
  return sharedCache;
}

/**
 * A cache whose keys are automatically scoped to the current workspace.
 *
 * In a shared database, an unscoped response cache is a data leak that the
 * database-level scoping cannot catch: the query runs correctly for tenant A,
 * the result is stored under a key like `category:list`, and tenant B's request
 * is served A's data without a query ever running. That is exactly what
 * happened to `/api/listing/search` and `/api/category/list` before this
 * existed.
 *
 * Scoping is applied here rather than at each call site so a new cached
 * endpoint is safe by default instead of by remembering. The tenant goes in a
 * SUFFIX, so a
 * workspace's `clearByPrefix('listing:')` drops only that workspace's keys.
 *
 * Genuinely global data — geocoding results, exchange rates, anything from an
 * external API that does not depend on who asked — should use `getCache()`
 * directly. That is a deliberate choice each time, not a default.
 */
/** The id the current scope resolves to: a tenant id, 'unscoped' or 'none'. */
function scopeId() {
  if (!hasTenantContext()) return 'none';
  if (isTenantScopeBypassed()) return 'unscoped';
  return getTenantId() || 'none';
}

const tenantSuffix = () => `::t=${scopeId()}`;

/** Suffix to restrict invalidation to the caller's workspace, or undefined for all. */
function currentTenantSuffix() {
  const id = scopeId();
  return id === 'none' || id === 'unscoped' ? undefined : `::t=${id}`;
}

export function getTenantScopedCache(options = {}) {
  const base = getCache(options);

  const scoped = (key) => `${key}${tenantSuffix()}`;

  return {
    get: (key) => base.get(scoped(key)),
    set: (key, value, opts) => base.set(scoped(key), value, opts),
    del: (key) => base.del(scoped(key)),
    // Inside a workspace, clears only THAT workspace's keys. With no tenant
    // context (a platform job) or an explicit bypass it clears the prefix for
    // everyone, which is the safe superset.
    clearByPrefix: (prefix) => base.clearByPrefix(prefix, { suffix: currentTenantSuffix() }),
    clear: () => base.clear(),
  };
}


/* ── Cross-instance invalidation ────────────────────────────────────────────
 *
 * The cache above is per-process, which is correct for reads — a local Map is
 * far faster than a network round trip, and the TTL bounds how stale an entry
 * can get.
 *
 * What is NOT correct per-process is invalidation. When an agent edits a
 * category on instance A, only A's cache is cleared; B keeps serving the old
 * value until its TTL expires. On a two-instance deployment that shows up as an
 * edit that "sometimes doesn't save" — the write succeeded, but half the
 * requests are answered from a stale cache.
 *
 * So the cache stays local and the *invalidation* is shared: a clear publishes
 * to Redis, and every instance drops the same keys. With no REDIS_URL this is
 * a no-op and behaviour is exactly as before.
 */

const INVALIDATION_CHANNEL = 'cache:invalidate';

/** Set once a subscriber is listening, so we only subscribe a single time. */
let subscriber = null;

/** Our own publisher id, so an instance ignores the message it just sent. */
const INSTANCE_ID = `${process.pid}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * Start listening for other instances' invalidations.
 * Safe to call more than once; safe to call with no Redis.
 */
export async function startCacheInvalidationListener() {
  if (subscriber) return subscriber;

  const { getRedis } = await import('./redis.js');
  const redis = getRedis();
  if (!redis) return null;

  // A connection in subscriber mode cannot issue normal commands, so this has
  // to be its own client rather than the shared one.
  subscriber = redis.duplicate();

  subscriber.on('error', () => { /* logged by the shared client */ });

  await subscriber.subscribe(INVALIDATION_CHANNEL);
  subscriber.on('message', (_channel, raw) => {
    try {
      const { from, prefix, key, all, suffix } = JSON.parse(raw);
      if (from === INSTANCE_ID) return; // we already cleared it locally

      const cache = getCache();
      if (all) cache.clear();
      else if (prefix) cache.clearByPrefix(prefix, { suffix });
      else if (key) cache.del(key);
    } catch { /* a malformed message must not take the listener down */ }
  });

  return subscriber;
}

export async function stopCacheInvalidationListener() {
  if (!subscriber) return;
  try {
    await subscriber.quit();
  } catch { /* shutting down anyway */ }
  subscriber = null;
}

/**
 * Clear locally and tell every other instance to do the same.
 *
 * Call this instead of `cache.clearByPrefix(...)` wherever a write invalidates
 * a cached read.
 */
export function invalidateEverywhere({ prefix, key, all = false } = {}) {
  const cache = getCache();
  // Inside a workspace request only that workspace's entries are dropped, here
  // and on every other instance (the suffix travels in the payload).
  const suffix = prefix ? currentTenantSuffix() : undefined;
  if (all) cache.clear();
  else if (prefix) cache.clearByPrefix(prefix, { suffix });
  else if (key) cache.del(key);

  // Fire-and-forget: a failed publish costs one stale window elsewhere, and
  // must never fail the write that triggered it.
  import('./redis.js')
    .then(({ getRedis }) => {
      const redis = getRedis();
      if (!redis) return;
      return redis.publish(
        INVALIDATION_CHANNEL,
        JSON.stringify({ from: INSTANCE_ID, prefix, key, all, suffix })
      );
    })
    .catch(() => {});
}

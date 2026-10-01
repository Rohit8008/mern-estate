/**
 * Tenant-scoped response caching.
 *
 * This is a regression guard for a leak that shipped and was caught in
 * testing: `/api/listing/search` and `/api/category/list` cached their
 * responses under keys like `category:list`, with no tenant in them. The
 * database query was correctly scoped every time — but the second workspace to
 * ask was served the first one's cached payload without a query running at all.
 *
 * Query scoping cannot catch this. A cache sits in front of the database, so it
 * needs its own boundary.
 */

import { getTenantScopedCache, getCache, invalidateEverywhere, MemoryCache } from '../utils/cache.js';
import { runWithTenant, runWithoutTenantScope } from '../tenancy/tenantContext.js';

const A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbbbbbbbbbb';

const asA = (fn) => runWithTenant({ tenantId: A }, fn);
const asB = (fn) => runWithTenant({ tenantId: B }, fn);

let cache;

beforeEach(() => {
  cache = getTenantScopedCache({ ttlMs: 60_000, maxSize: 100 });
  cache.clear();
});

describe('getTenantScopedCache', () => {
  it('does not serve one workspace the other\'s cached value', () => {
    asA(() => cache.set('category:list', ['acme-plots']));
    expect(asB(() => cache.get('category:list'))).toBeNull();
  });

  it('returns each workspace its own value under the same key', () => {
    asA(() => cache.set('category:list', ['acme']));
    asB(() => cache.set('category:list', ['bluestar']));
    expect(asA(() => cache.get('category:list'))).toEqual(['acme']);
    expect(asB(() => cache.get('category:list'))).toEqual(['bluestar']);
  });

  it('keeps an unscoped write out of every workspace\'s reach', () => {
    // A platform-wide job must not warm a cache that tenant requests then read.
    runWithoutTenantScope('a platform report', () => cache.set('listing:popular:10', ['everything']));
    expect(asA(() => cache.get('listing:popular:10'))).toBeNull();
  });

  it('keeps values written with no context at all separate too', () => {
    cache.set('listing:popular:10', ['from a boot script']);
    expect(asA(() => cache.get('listing:popular:10'))).toBeNull();
  });

  it('deletes only the calling workspace\'s entry', () => {
    asA(() => cache.set('k', 1));
    asB(() => cache.set('k', 2));
    asA(() => cache.del('k'));
    expect(asA(() => cache.get('k'))).toBeNull();
    expect(asB(() => cache.get('k'))).toBe(2);
  });

  it('clears only the calling workspace on a prefix invalidation', () => {
    // Workspace A saving a listing used to wipe workspace B's search cache too,
    // so one busy agency kept every other agency's cache permanently cold.
    asA(() => cache.set('listing:search:x', 1));
    asB(() => cache.set('listing:search:x', 2));
    asA(() => cache.clearByPrefix('listing:'));
    expect(asA(() => cache.get('listing:search:x'))).toBeNull();
    expect(asB(() => cache.get('listing:search:x'))).toBe(2);
  });

  it('still clears every workspace when there is no workspace context', () => {
    // A platform job has no tenant; clearing more than needed is the safe side.
    asA(() => cache.set('listing:search:x', 1));
    asB(() => cache.set('listing:search:x', 2));
    cache.clearByPrefix('listing:');
    expect(asA(() => cache.get('listing:search:x'))).toBeNull();
    expect(asB(() => cache.get('listing:search:x'))).toBeNull();
  });

  it('invalidateEverywhere drops only the current workspace\'s keys', () => {
    asA(() => cache.set('listing:search:y', 1));
    asB(() => cache.set('listing:search:y', 2));
    asA(() => invalidateEverywhere({ prefix: 'listing:' }));
    expect(asA(() => cache.get('listing:search:y'))).toBeNull();
    expect(asB(() => cache.get('listing:search:y'))).toBe(2);
  });

  it('does not let a tenant id that is a prefix of another match it', () => {
    const base = getCache();
    base.set('listing:z::t=abc', 'short');
    base.set('listing:z::t=abcdef', 'long');
    base.clearByPrefix('listing:', { suffix: '::t=abc' });
    expect(base.get('listing:z::t=abc')).toBeNull();
    expect(base.get('listing:z::t=abcdef')).toBe('long');
  });

  it('leaves the unscoped cache alone, for genuinely global data', () => {
    // Geocoding a lat/lng gives the same answer whoever asks, and caching it
    // once for everyone is the point.
    const global = getCache({ ttlMs: 60_000, maxSize: 100 });
    global.set('reverse:28.4:77.0', 'Gurugram');
    expect(asA(() => global.get('reverse:28.4:77.0'))).toBe('Gurugram');
    expect(asB(() => global.get('reverse:28.4:77.0'))).toBe('Gurugram');
  });
});

describe('MemoryCache housekeeping', () => {
  it('defaults to room for 1000 entries', () => {
    const c = new MemoryCache({ sweepMs: 0 });
    expect(c.maxSize).toBe(1000);
  });

  it('sweeps expired entries without waiting for them to be read', async () => {
    const c = new MemoryCache({ ttlMs: 5, sweepMs: 0 });
    c.set('a', 1);
    c.set('b', 2, { ttlMs: 60_000 });
    await new Promise((r) => setTimeout(r, 15));
    expect(c.store.size).toBe(2);
    expect(c.sweep()).toBe(1);
    expect(c.store.has('a')).toBe(false);
    expect(c.get('b')).toBe(2);
  });

  it('runs the sweep on a timer that does not keep the process alive', () => {
    const c = new MemoryCache({ sweepMs: 1000 });
    expect(c._sweeper).toBeTruthy();
    expect(c._sweeper.hasRef()).toBe(false);
    c.stopSweeper();
    expect(c._sweeper).toBeNull();
  });
});

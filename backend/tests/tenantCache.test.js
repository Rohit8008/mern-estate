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

import { getTenantScopedCache, getCache } from '../utils/cache.js';
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

  it('still supports prefix invalidation across workspaces', () => {
    // Writing a listing clears the search cache. Clearing more than strictly
    // necessary costs a little performance; clearing less would serve stale
    // results, so the prefix deliberately spans tenants.
    asA(() => cache.set('listing:search:x', 1));
    asB(() => cache.set('listing:search:x', 2));
    cache.clearByPrefix('listing:');
    expect(asA(() => cache.get('listing:search:x'))).toBeNull();
    expect(asB(() => cache.get('listing:search:x'))).toBeNull();
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

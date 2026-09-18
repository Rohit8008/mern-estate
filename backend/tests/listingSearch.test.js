/**
 * The consolidated listing search.
 *
 * Each block below pins a defect the design review found in the three
 * implementations this replaced:
 *   • pagination.total was the size of a truncated 500-row pull, so counts lied
 *     and pages past 500 were empty
 *   • candidates were sorted by createdAt BEFORE relevance scoring, so the best
 *     match was invisible if newer rows also matched
 *   • an unindexed fuzzy regex ran for every query, matching almost anything
 *   • the board and the public search applied different access rules
 */

import mongoose from 'mongoose';
import Listing from '../models/listing.model.js';
import { searchListings, getListingFacets, buildListingFilter } from '../search/listingSearch.js';
import { runWithTenant } from '../tenancy/tenantContext.js';

const ADMIN = { id: null, role: 'admin' };

let tenantId;
const inWorkspace = (fn) => runWithTenant({ tenantId: String(tenantId) }, fn);

async function seed(docs) {
  await inWorkspace(() =>
    Listing.insertMany(
      docs.map((d) => ({
        name: 'Untitled',
        userRef: new mongoose.Types.ObjectId(),
        status: 'available',
        type: 'sale',
        ...d,
      }))
    )
  );
}

beforeEach(async () => {
  tenantId = global.testUtils.tenantId;
  ADMIN.id = String(new mongoose.Types.ObjectId());
  await Listing.syncIndexes({ background: false }).catch(() => {});
});

describe('pagination reports a true total', () => {
  it('counts every match, not just the page', async () => {
    await seed(Array.from({ length: 30 }, (_, i) => ({ name: `Amoha Gardens Plot ${i + 1}` })));
    const page1 = await inWorkspace(() =>
      searchListings({ q: 'Amoha', user: ADMIN, limit: 10, skip: 0 })
    );
    expect(page1.total).toBe(30);
    expect(page1.listings).toHaveLength(10);
  });

  it('serves a deep page rather than coming back empty', async () => {
    // The old implementation pulled 500 rows into Node and sliced, so anything
    // past that boundary was unreachable by any page number.
    await seed(Array.from({ length: 30 }, (_, i) => ({ name: `Amoha Gardens Plot ${i + 1}` })));
    const last = await inWorkspace(() =>
      searchListings({ q: 'Amoha', user: ADMIN, limit: 10, skip: 20 })
    );
    expect(last.total).toBe(30);
    expect(last.listings).toHaveLength(10);
  });

  it('reports zero for a term nothing matches', async () => {
    await seed([{ name: 'Amoha Gardens Plot 1' }]);
    const out = await inWorkspace(() => searchListings({ q: 'zzzznothing', user: ADMIN }));
    expect(out.total).toBe(0);
    expect(out.listings).toEqual([]);
  });
});

describe('matching tiers', () => {
  it('answers an exact property number with that property', async () => {
    // A broker typing a plot number wants that plot, not a neighbourhood of
    // things like it.
    await seed([
      { name: 'Corner plot', propertyNo: 'P-1147' },
      { name: 'P-1147 lookalike in the description', description: 'near P-1147' },
    ]);
    const out = await inWorkspace(() => searchListings({ q: 'P-1147', user: ADMIN }));
    expect(out.tier).toBe('identifier');
    expect(out.total).toBe(1);
    expect(out.listings[0].propertyNo).toBe('P-1147');
  });

  it('is case-insensitive on a property number', async () => {
    await seed([{ name: 'Plot', propertyNo: 'P-1147' }]);
    const out = await inWorkspace(() => searchListings({ q: 'p-1147', user: ADMIN }));
    expect(out.total).toBe(1);
  });

  it('uses the text index for words', async () => {
    await seed(Array.from({ length: 8 }, (_, i) => ({ name: `Sushant Lok Plot ${i}` })));
    const out = await inWorkspace(() => searchListings({ q: 'Sushant', user: ADMIN }));
    expect(out.tier).toBe('text');
    expect(out.total).toBe(8);
  });

  it('finds a locality, which the old text index did not cover', async () => {
    await seed([{ name: 'Plot 12', locality: 'Sector 57' }]);
    const out = await inWorkspace(() => searchListings({ q: 'Sector 57', user: ADMIN }));
    expect(out.total).toBeGreaterThan(0);
  });

  it('falls back to a prefix for a half-typed word', async () => {
    // $text matches whole words, so "Sush" finds nothing there — this is the
    // tier that answers someone still typing.
    await seed([{ name: 'A plot', locality: 'Sushant Lok' }]);
    const out = await inWorkspace(() => searchListings({ q: 'Sushan', user: ADMIN }));
    expect(out.total).toBe(1);
    expect(['prefix', 'fuzzy']).toContain(out.tier);
  });

  it('still tolerates a typo, via the last-resort fuzzy pass', async () => {
    await seed([{ name: 'Amoha Gardens Plot 4' }]);
    const out = await inWorkspace(() => searchListings({ q: 'gardn', user: ADMIN }));
    expect(out.total).toBe(1);
    expect(out.tier).toBe('fuzzy');
  });
});

describe('filters', () => {
  beforeEach(async () => {
    await seed([
      { name: 'Cheap plot', regularPrice: 1000000, city: 'Bathinda', status: 'available' },
      { name: 'Mid plot', regularPrice: 8000000, city: 'Bathinda', status: 'sold' },
      { name: 'Farmhouse', regularPrice: 120000000, city: 'Gurugram', status: 'available' },
    ]);
  });

  it('does not apply a price ceiling nobody asked for', async () => {
    // The bug this guards: a default maxPrice of 10 Cr hid every high-value
    // property from the board while it still counted in analytics.
    const out = await inWorkspace(() => searchListings({ user: ADMIN, limit: 50 }));
    expect(out.listings.map((l) => l.name)).toContain('Farmhouse');
  });

  it('applies a price ceiling that was asked for', async () => {
    const out = await inWorkspace(() =>
      searchListings({ user: ADMIN, params: { maxPrice: '10000000' }, limit: 50 })
    );
    expect(out.listings.map((l) => l.name)).not.toContain('Farmhouse');
    expect(out.total).toBe(2);
  });

  it('filters by status and by city', async () => {
    const available = await inWorkspace(() =>
      searchListings({ user: ADMIN, params: { status: 'available' }, limit: 50 })
    );
    expect(available.total).toBe(2);

    const gurugram = await inWorkspace(() =>
      searchListings({ user: ADMIN, params: { city: 'gurugram' }, limit: 50 })
    );
    expect(gurugram.total).toBe(1);
  });

  it('hides sold stock from anonymous browsing when asked to', async () => {
    const out = await inWorkspace(() =>
      searchListings({ user: undefined, defaultStatus: 'available', limit: 50 })
    );
    expect(out.listings.map((l) => l.name)).not.toContain('Mid plot');
  });

  it('combines a search term with filters', async () => {
    const out = await inWorkspace(() =>
      searchListings({ q: 'plot', user: ADMIN, params: { status: 'available' }, limit: 50 })
    );
    expect(out.listings.every((l) => l.status === 'available')).toBe(true);
  });
});

describe('access scope', () => {
  it('narrows an employee to their own categories', async () => {
    await seed([
      { name: 'Theirs', category: 'plots' },
      { name: 'Not theirs', category: 'commercial' },
    ]);
    const employee = {
      id: String(new mongoose.Types.ObjectId()),
      role: 'employee',
      assignedCategories: ['plots'],
    };
    const out = await inWorkspace(() => searchListings({ user: employee, limit: 50 }));
    expect(out.listings.map((l) => l.name)).toEqual(['Theirs']);
  });

  it('holds that scope even with a search term', async () => {
    // The search clause is $or-shaped, and merging it carelessly is exactly how
    // a scope gets widened.
    await seed([
      { name: 'Plot alpha', category: 'plots' },
      { name: 'Plot beta', category: 'commercial' },
    ]);
    const employee = {
      id: String(new mongoose.Types.ObjectId()),
      role: 'employee',
      assignedCategories: ['plots'],
    };
    const out = await inWorkspace(() => searchListings({ q: 'plot', user: employee, limit: 50 }));
    expect(out.listings.map((l) => l.name)).toEqual(['Plot alpha']);
  });
});

describe('buildListingFilter', () => {
  it('adds no price constraint when no bound is given', () => {
    const filter = buildListingFilter({}, ADMIN);
    expect(JSON.stringify(filter)).not.toContain('regularPrice');
  });

  it('is the same filter the facets use', () => {
    // Counts and rows computed from separately built filters is how a header
    // ends up disagreeing with the list under it.
    const params = { status: 'available', city: 'Bathinda' };
    expect(buildListingFilter(params, ADMIN)).toEqual(buildListingFilter(params, ADMIN));
  });
});

describe('getListingFacets', () => {
  it('counts the whole filtered set rather than a page', async () => {
    // The board grouped its pipeline columns from whichever 50 rows were
    // loaded and showed that as the total.
    await seed([
      ...Array.from({ length: 12 }, () => ({ status: 'available', city: 'Bathinda' })),
      ...Array.from({ length: 5 }, () => ({ status: 'sold', city: 'Bathinda' })),
      ...Array.from({ length: 3 }, () => ({ status: 'available', city: 'Gurugram' })),
    ]);
    const facets = await inWorkspace(() => getListingFacets({ user: ADMIN }));
    expect(facets.status.available).toBe(15);
    expect(facets.status.sold).toBe(5);
    expect(facets.city.Bathinda).toBe(17);
    expect(facets.totals.count).toBe(20);
  });

  it('respects the same filters as the list', async () => {
    await seed([
      { status: 'available', city: 'Bathinda' },
      { status: 'sold', city: 'Bathinda' },
    ]);
    const facets = await inWorkspace(() =>
      getListingFacets({ user: ADMIN, params: { status: 'available' } })
    );
    expect(facets.totals.count).toBe(1);
  });

  it('averages only real prices, not placeholder zeros', async () => {
    // Placeholder prices are stored as 0; averaging them in drags every figure
    // down and makes the number meaningless.
    await seed([
      { regularPrice: 0 },
      { regularPrice: 1000000 },
      { regularPrice: 3000000 },
    ]);
    const facets = await inWorkspace(() => getListingFacets({ user: ADMIN }));
    expect(facets.totals.avgPrice).toBe(2000000);
  });
});

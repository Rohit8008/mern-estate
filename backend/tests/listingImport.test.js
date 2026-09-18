/**
 * Bulk import.
 *
 * Import is the one path that can take a workspace from well inside its plan to
 * far past it in a single request, so the plan check has to happen BEFORE
 * anything is written — a per-row check after the fact is too late, and half an
 * imported file is exactly what the preview/commit split exists to prevent.
 *
 * None of the four handlers in listingImport.controller.js was called by any
 * test before this file; only the pure mapping util was covered.
 */

import mongoose from 'mongoose';
import Category from '../models/category.model.js';
import Listing from '../models/listing.model.js';
import { commitImport } from '../controllers/listingImport.controller.js';
import { runWithTenant } from '../tenancy/tenantContext.js';

let tenantId;
let adminId;

beforeEach(() => {
  tenantId = global.testUtils.tenantId;
  adminId = new mongoose.Types.ObjectId();
});

/** A workspace whose plan allows `maxListings`. */
const workspace = (maxListings) => ({
  _id: tenantId,
  slug: 'acme',
  plan: 'starter',
  limits: { maxListings },
});

const inWorkspace = (tenant, fn) =>
  runWithTenant({ tenantId: String(tenantId), tenant }, fn);

/**
 * commitImport is wrapped in asyncHandler, which swallows its own promise — so
 * awaiting the handler directly would resolve before the work finished and
 * before any error surfaced. Resolve on res.json, reject on next(err).
 */
function call(handler, { tenant, body }) {
  const req = {
    user: { id: String(adminId), role: 'admin' },
    body,
    params: {},
    query: {},
    tenantId: String(tenantId),
    ip: '127.0.0.1',
    originalUrl: '/api/listing-import/commit',
  };
  return inWorkspace(
    tenant,
    () =>
      new Promise((resolve, reject) => {
        const res = {
          status(code) { this.__status = code; return this; },
          json(payload) { resolve({ ...payload, __status: this.__status || 200 }); return this; },
        };
        Promise.resolve(handler(req, res, (err) => (err ? reject(err) : resolve(undefined)))).catch(reject);
      })
  );
}

const seedCategory = () =>
  inWorkspace(workspace(1000), () => Category.create({ name: 'Plots', slug: 'plots', fields: [] }));

/** Two columns: name, city. */
const MAPPING = [
  { column: 0, target: 'core', key: 'name' },
  { column: 1, target: 'core', key: 'city' },
];

const rows = (n) => Array.from({ length: n }, (_, i) => [`Plot ${i + 1}`, 'Bathinda']);

const countListings = () => inWorkspace(workspace(1000), () => Listing.countDocuments({}));

describe('commitImport and the plan limit', () => {
  beforeEach(seedCategory);

  it('refuses a chunk that would breach the plan with 402', async () => {
    const err = await call(commitImport, {
      tenant: workspace(2),
      body: { category: 'plots', rows: rows(5), mapping: MAPPING },
    }).catch((e) => e);

    expect(err.statusCode).toBe(402);
    expect(err.message).toMatch(/properties/i);
  });

  it('writes nothing at all when it refuses', async () => {
    // The whole point of checking before the write: a partial import is worse
    // than a refused one, because nobody knows which half landed.
    await call(commitImport, {
      tenant: workspace(2),
      body: { category: 'plots', rows: rows(5), mapping: MAPPING },
    }).catch(() => {});

    expect(await countListings()).toBe(0);
  });

  it('counts the whole chunk, not one row at a time', async () => {
    // 0 existing + 5 is past a cap of 4, even though 0 + 1 would be fine.
    const err = await call(commitImport, {
      tenant: workspace(4),
      body: { category: 'plots', rows: rows(5), mapping: MAPPING },
    }).catch((e) => e);

    expect(err.statusCode).toBe(402);
  });

  it('imports the chunk that fits', async () => {
    const res = await call(commitImport, {
      tenant: workspace(10),
      body: { category: 'plots', rows: rows(5), mapping: MAPPING },
    });

    expect(res.__status).toBeLessThan(400);
    expect(await countListings()).toBe(5);
  });

  it('takes existing listings into account, not just the chunk', async () => {
    await call(commitImport, {
      tenant: workspace(10),
      body: { category: 'plots', rows: rows(8), mapping: MAPPING },
    });
    expect(await countListings()).toBe(8);

    // 8 existing + 5 more is past 10, even though 5 alone would fit.
    const err = await call(commitImport, {
      tenant: workspace(10),
      body: { category: 'plots', rows: rows(5).map((r, i) => [`Extra ${i}`, 'Bathinda']), mapping: MAPPING },
    }).catch((e) => e);

    expect(err.statusCode).toBe(402);
    expect(await countListings()).toBe(8);
  });

  it('enforces nothing when the plan is unlimited', async () => {
    const res = await call(commitImport, {
      tenant: workspace(0), // 0 means unlimited
      body: { category: 'plots', rows: rows(20), mapping: MAPPING },
    });

    expect(res.__status).toBeLessThan(400);
    expect(await countListings()).toBe(20);
  });
});

describe('commitImport input handling', () => {
  beforeEach(seedCategory);

  it('refuses a category that does not exist', async () => {
    const err = await call(commitImport, {
      tenant: workspace(1000),
      body: { category: 'not-a-category', rows: rows(1), mapping: MAPPING },
    }).catch((e) => e);

    expect(err.statusCode).toBe(404);
  });

  it('refuses an empty file', async () => {
    const err = await call(commitImport, {
      tenant: workspace(1000),
      body: { category: 'plots', rows: [], mapping: MAPPING },
    }).catch((e) => e);

    expect(err.statusCode).toBe(400);
    expect(err.message).toMatch(/no rows/i);
  });

  it('refuses a chunk with no column mapping', async () => {
    const err = await call(commitImport, {
      tenant: workspace(1000),
      body: { category: 'plots', rows: rows(1) },
    }).catch((e) => e);

    expect(err.statusCode).toBe(400);
    expect(err.message).toMatch(/mapping/i);
  });

  it('rejects the whole chunk when skipInvalid is off and a row is bad', async () => {
    const withBlank = [...rows(2), ['', 'Bathinda']]; // no name
    const err = await call(commitImport, {
      tenant: workspace(1000),
      body: { category: 'plots', rows: withBlank, mapping: MAPPING, skipInvalid: false },
    }).catch((e) => e);

    expect(err.statusCode).toBe(400);
    expect(await countListings()).toBe(0);
  });

  it('imports the clean rows and reports the bad one when skipInvalid is on', async () => {
    const withBlank = [...rows(2), ['', 'Bathinda']];
    const res = await call(commitImport, {
      tenant: workspace(1000),
      body: { category: 'plots', rows: withBlank, mapping: MAPPING, skipInvalid: true },
    });

    expect(res.__status).toBeLessThan(400);
    expect(await countListings()).toBe(2);
  });
});

/**
 * Destructive category actions answer 409 with a COUNT.
 *
 * The rule, from CLAUDE.md: deleting a category that listings still use, or
 * removing a field that holds values, refuses rather than proceeding — and the
 * refusal carries the number, because "this will break 400 properties" is a
 * different decision from "this will break none". `?force=true` is how an admin
 * says they meant it.
 *
 * Nothing in the suite asserted a 409 before this file: `grep -rn 409 tests/`
 * came back empty, and categoryFields.test.js covers only the pure validator.
 * A regression that quietly deleted a category with live listings would have
 * shipped green.
 */

import mongoose from 'mongoose';
import Category from '../models/category.model.js';
import Listing from '../models/listing.model.js';
import { deleteCategory, updateCategoryFields } from '../controllers/category.controller.js';
import { runWithTenant } from '../tenancy/tenantContext.js';

let tenantId;
let adminId;

const inWorkspace = (fn) => runWithTenant({ tenantId: String(tenantId) }, fn);

beforeEach(() => {
  tenantId = global.testUtils.tenantId;
  adminId = new mongoose.Types.ObjectId();
});

const admin = () => ({ id: String(adminId), role: 'admin' });

/** Call a controller and resolve with its JSON body, or reject with next(err). */
function call(handler, { user = admin(), body = {}, params = {}, query = {} } = {}) {
  const req = { user, body, params, query, tenantId: String(tenantId), ip: '127.0.0.1', originalUrl: '/api/category' };
  return inWorkspace(
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

const seedCategory = (fields = []) =>
  inWorkspace(() => Category.create({ name: 'Plots', slug: 'plots', fields }));

const seedListings = (n, extra = {}) =>
  inWorkspace(() =>
    Listing.insertMany(
      Array.from({ length: n }, (_, i) => ({
        name: `Plot ${i + 1}`,
        category: 'plots',
        userRef: adminId,
        ...extra,
      }))
    )
  );

describe('deleting a category that is in use', () => {
  it('refuses with 409 and says how many properties are affected', async () => {
    const category = await seedCategory();
    await seedListings(3);

    const err = await call(deleteCategory, { params: { id: String(category._id) } }).catch((e) => e);

    expect(err.statusCode).toBe(409);
    expect(err.details).toEqual({ listingCount: 3, categorySlug: 'plots' });
    expect(err.message).toMatch(/3 properties are still in "Plots"/);
  });

  it('leaves the category alone when it refuses', async () => {
    // A refusal that had already half-applied would be worse than no check.
    const category = await seedCategory();
    await seedListings(2);

    await call(deleteCategory, { params: { id: String(category._id) } }).catch(() => {});

    const still = await inWorkspace(() => Category.findById(category._id));
    expect(still.isDeleted).toBeFalsy();
  });

  it('gets the grammar right for a single property', async () => {
    // The count is the point of the message; "1 properties are" undermines it.
    const category = await seedCategory();
    await seedListings(1);

    const err = await call(deleteCategory, { params: { id: String(category._id) } }).catch((e) => e);

    expect(err.message).toMatch(/1 property is still in/);
    expect(err.details.listingCount).toBe(1);
  });

  it('goes ahead with ?force=true', async () => {
    const category = await seedCategory();
    await seedListings(3);

    await call(deleteCategory, { params: { id: String(category._id) }, query: { force: 'true' } });

    const gone = await inWorkspace(() => Category.findById(category._id));
    expect(gone.isDeleted).toBe(true);
  });

  it('deletes without complaint when nothing uses it', async () => {
    const category = await seedCategory();

    await call(deleteCategory, { params: { id: String(category._id) } });

    const gone = await inWorkspace(() => Category.findById(category._id));
    expect(gone.isDeleted).toBe(true);
  });
});

describe('removing a category field that holds values', () => {
  const FIELDS = [
    { key: 'facing', label: 'Facing', type: 'text' },
    { key: 'cornerPlot', label: 'Corner plot', type: 'boolean' },
  ];

  it('refuses with 409 and names the field and its count', async () => {
    const category = await seedCategory(FIELDS);
    await seedListings(2, { attributes: { facing: 'West' } });

    const err = await call(updateCategoryFields, {
      params: { id: String(category._id) },
      body: { fields: [FIELDS[1]] }, // drops `facing`
    }).catch((e) => e);

    expect(err.statusCode).toBe(409);
    expect(err.details.removedWithData).toEqual([{ key: 'facing', label: 'Facing', count: 2 }]);
    expect(err.message).toMatch(/Facing \(2 properties\)/);
  });

  it('leaves the field definitions untouched when it refuses', async () => {
    const category = await seedCategory(FIELDS);
    await seedListings(1, { attributes: { facing: 'East' } });

    await call(updateCategoryFields, {
      params: { id: String(category._id) },
      body: { fields: [FIELDS[1]] },
    }).catch(() => {});

    const still = await inWorkspace(() => Category.findById(category._id));
    expect(still.fields.map((f) => f.key).sort()).toEqual(['cornerPlot', 'facing']);
  });

  it('removes a field nobody has filled in without asking', async () => {
    const category = await seedCategory(FIELDS);
    await seedListings(2); // no attributes at all

    await call(updateCategoryFields, {
      params: { id: String(category._id) },
      body: { fields: [FIELDS[1]] },
    });

    const updated = await inWorkspace(() => Category.findById(category._id));
    expect(updated.fields.map((f) => f.key)).toEqual(['cornerPlot']);
  });

  it('goes ahead with ?force=true, and the values stay in the database', async () => {
    const category = await seedCategory(FIELDS);
    await seedListings(1, { attributes: { facing: 'West' } });

    await call(updateCategoryFields, {
      params: { id: String(category._id) },
      query: { force: 'true' },
      body: { fields: [FIELDS[1]] },
    });

    const updated = await inWorkspace(() => Category.findById(category._id));
    expect(updated.fields.map((f) => f.key)).toEqual(['cornerPlot']);

    // The refusal said "the data stays in the database but nothing will show
    // it" — so it had better still be there.
    const listing = await inWorkspace(() => Listing.findOne({ category: 'plots' }).lean());
    expect(listing.attributes.facing).toBe('West');
  });

  it('ignores an empty string as a recorded value', async () => {
    // `$nin: [null, '']` — a field someone opened and left blank is not data
    // worth blocking a schema change over.
    const category = await seedCategory(FIELDS);
    await seedListings(2, { attributes: { facing: '' } });

    await call(updateCategoryFields, {
      params: { id: String(category._id) },
      body: { fields: [FIELDS[1]] },
    });

    const updated = await inWorkspace(() => Category.findById(category._id));
    expect(updated.fields.map((f) => f.key)).toEqual(['cornerPlot']);
  });
});

/**
 * Add and edit agree, and every value survives the trip.
 *
 * The listing form is one component with a `mode`, so "the two forms differ" is
 * no longer possible in the UI — but the two API paths behind it are still
 * separate, and that is where a value can quietly fail to persist. These tests
 * drive the exact payload the form builds through create, read, edit, read.
 *
 * The specific defect they guard is the one found writing them: `updateListing`
 * compared `discountPrice >= regularPrice` without checking either was set, so
 * with both at their `0` default the comparison was `0 >= 0` and **every edit of
 * a property with no price was rejected**. The form tells people a name is
 * enough to save, so a listing created that way was immediately uneditable.
 */

import mongoose from 'mongoose';
import Listing from '../models/listing.model.js';
import Owner from '../models/owner.model.js';
import { createListing, updateListing, getListing } from '../controllers/listing.controller.js';
import { runWithTenant } from '../tenancy/tenantContext.js';

/** The fields the form owns — mirrors EMPTY in frontend/src/hooks/useListingForm.js. */
const FORM_FIELDS = [
  'name', 'description', 'address', 'city', 'locality', 'state', 'pincode',
  'type', 'status', 'propertyType', 'bedrooms', 'bathrooms',
  'regularPrice', 'discountPrice', 'offer', 'parking', 'furnished',
  'category', 'ownerIds', 'imageUrls', 'attributes', 'location',
  'areaName', 'propertyNo', 'plotSize', 'sqYard', 'sqYardRate',
  'totalValue', 'areaSqFt', 'remarks',
];

let tenantId;
let userId;

const inWorkspace = (fn) => runWithTenant({ tenantId: String(tenantId) }, fn);

beforeEach(() => {
  tenantId = global.testUtils.tenantId;
  userId = new mongoose.Types.ObjectId();
});

/** Invoke a controller the way Express would, and surface any error. */
function call(handler, { body = {}, params = {} } = {}) {
  const req = {
    user: { id: String(userId), role: 'admin' },
    tenantId: String(tenantId),
    body, params, query: {}, headers: {}, ip: '127.0.0.1',
    originalUrl: '/api/listing',
    get: () => undefined,
  };
  return inWorkspace(
    () =>
      new Promise((resolve, reject) => {
        const res = {
          setHeader() {},
          status() { return this; },
          json(payload) { resolve(payload); return this; },
        };
        Promise.resolve(handler(req, res, (err) => (err ? reject(err) : resolve(undefined))))
          .catch(reject);
      })
  );
}

/** What the edit form holds after loading a listing. */
function asFormLoads(read) {
  const merged = { ...read, ownerIds: (read.owners || []).map((o) => String(o._id)) };
  return Object.fromEntries(FORM_FIELDS.map((k) => [k, merged[k]]));
}

const create = (body) => call(createListing, { body });
const update = (id, body) => call(updateListing, { body, params: { id: String(id) } });
const read = async (id) => asFormLoads(await call(getListing, { params: { id: String(id) } }));

describe('a listing with only a name', () => {
  it('can be created — the form promises a name is enough', async () => {
    const res = await create({ name: 'Just a name' });
    expect(res?.data?._id).toBeTruthy();
  });

  it('can then be edited', async () => {
    // The regression: with regularPrice and discountPrice both at their 0
    // default, a `discountPrice >= regularPrice` guard reads 0 >= 0 and rejects
    // the edit. Everything saved with just a name became uneditable.
    const { data } = await create({ name: 'Just a name' });
    const loaded = await read(data._id);
    await expect(update(data._id, loaded)).resolves.toBeTruthy();
  });

  it('can be given a price later', async () => {
    const { data } = await create({ name: 'Priced later' });
    const loaded = await read(data._id);
    await update(data._id, { ...loaded, regularPrice: 5000000 });
    expect((await read(data._id)).regularPrice).toBe(5000000);
  });
});

describe('the offer-price rule', () => {
  it('still rejects an offer price at or above the price', async () => {
    const { data } = await create({ name: 'Priced', regularPrice: 1000000 });
    const loaded = await read(data._id);
    await expect(update(data._id, { ...loaded, discountPrice: 1000000 })).rejects.toThrow(/less than/i);
    await expect(update(data._id, { ...loaded, discountPrice: 2000000 })).rejects.toThrow(/less than/i);
  });

  it('accepts an offer price below the price', async () => {
    const { data } = await create({ name: 'Priced', regularPrice: 1000000 });
    const loaded = await read(data._id);
    await update(data._id, { ...loaded, discountPrice: 900000 });
    expect((await read(data._id)).discountPrice).toBe(900000);
  });
});

describe('every field the form owns survives a round trip', () => {
  const FULL = {
    name: 'Full listing', description: 'all fields set', address: 'Block C',
    city: 'Bathinda', locality: 'Sector 21', state: 'Punjab', pincode: '151001',
    type: 'lease', status: 'under_negotiation', propertyType: 'plot',
    bedrooms: 4, bathrooms: 3, regularPrice: 9000000, discountPrice: 8500000,
    offer: true, parking: true, furnished: true, category: '',
    ownerIds: [], imageUrls: ['https://example.test/a.jpg'],
    attributes: { customThing: 'kept' }, location: { lat: 30.21, lng: 74.94 },
    areaName: 'Amoha', propertyNo: 'F-1', plotSize: '30x50',
    sqYard: 250, sqYardRate: 20000, totalValue: 5000000, areaSqFt: 2250,
    remarks: 'internal note',
  };

  const same = (want, got) =>
    FORM_FIELDS.filter((k) => JSON.stringify(want[k] ?? null) !== JSON.stringify(got[k] ?? null));

  it('after create', async () => {
    const { data } = await create(FULL);
    expect(same(FULL, await read(data._id))).toEqual([]);
  });

  it('after an edit that changes two fields', async () => {
    const { data } = await create(FULL);
    const loaded = await read(data._id);
    await update(data._id, { ...loaded, name: 'Renamed', sqYard: 300 });
    expect(same({ ...FULL, name: 'Renamed', sqYard: 300 }, await read(data._id))).toEqual([]);
  });

  it('after an edit that changes nothing', async () => {
    // Opening the form and pressing Save must not lose anything — the case
    // where a field missing from the payload silently reverts to its default.
    const { data } = await create(FULL);
    await update(data._id, await read(data._id));
    expect(same(FULL, await read(data._id))).toEqual([]);
  });
});

describe('owners', () => {
  let ids;

  beforeEach(async () => {
    const owners = await inWorkspace(() =>
      Owner.insertMany([{ name: 'Owner A' }, { name: 'Owner B' }])
    );
    ids = owners.map((o) => String(o._id));
  });

  it('are kept through a no-op edit', async () => {
    const { data } = await create({ name: 'Jointly held', ownerIds: ids });
    await update(data._id, await read(data._id));
    expect((await read(data._id)).ownerIds.sort()).toEqual([...ids].sort());
  });

  it('can be reduced', async () => {
    const { data } = await create({ name: 'Jointly held', ownerIds: ids });
    const loaded = await read(data._id);
    await update(data._id, { ...loaded, ownerIds: [ids[0]] });
    expect((await read(data._id)).ownerIds).toEqual([ids[0]]);
  });

  it('can be cleared entirely', async () => {
    // An empty array has to reach the database as an empty array. A payload
    // builder that strips falsy values would drop it and the owners would stay.
    const { data } = await create({ name: 'Jointly held', ownerIds: ids });
    const loaded = await read(data._id);
    await update(data._id, { ...loaded, ownerIds: [] });
    expect((await read(data._id)).ownerIds).toEqual([]);
  });
});

describe('the form field list matches what the API accepts', () => {
  it('has no field the API would silently discard', async () => {
    // If the form gains a field the payload whitelist does not carry, it would
    // appear to save and then vanish on reload — the exact failure the two
    // separate forms used to produce.
    const { data } = await create({ name: 'Whitelist check' });
    const stored = await inWorkspace(() => Listing.findById(data._id).lean());

    const notPersistable = FORM_FIELDS.filter(
      (f) => !(f in stored) && !['ownerIds', 'attributes', 'location'].includes(f)
    );
    expect(notPersistable).toEqual([]);
  });
});

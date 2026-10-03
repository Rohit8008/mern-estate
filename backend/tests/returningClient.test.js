/**
 * A client who comes back after a closed deal.
 *
 * One person, many deals: a new requirement is a new deal on the same client,
 * not a second record. The client's overall `status` is a single overwritten
 * value, so the history lives in statusHistory, the per-deal stageHistory and
 * the transaction — this pins that reopening keeps all of it.
 */

import mongoose from 'mongoose';
import { registerTenancy } from '../tenancy/tenantPlugin.js';
import { runWithTenant } from '../tenancy/tenantContext.js';

let Client, Listing, Transaction, addDeal, updateDealStage, setDealListing;

const TENANT = new mongoose.Types.ObjectId().toString();
const inTenant = (fn) => runWithTenant({ tenantId: TENANT }, fn);
const USER = { id: new mongoose.Types.ObjectId().toString(), role: 'admin' };

beforeAll(async () => {
  registerTenancy(mongoose);
  ({ default: Client } = await import('../models/client.model.js'));
  ({ default: Listing } = await import('../models/listing.model.js'));
  ({ default: Transaction } = await import('../models/transaction.model.js'));
  ({ addDeal, updateDealStage, setDealListing } = await import('../controllers/crm.controller.js'));
});

beforeEach(async () => {
  await Client.collection.deleteMany({});
  await Listing.collection.deleteMany({});
  await Transaction.collection.deleteMany({});
});

/** Run a controller and hand back what it answered or passed to next(). */
async function call(handler, { params, body }) {
  let out;
  const res = { status: () => res, json: (v) => { out = v; return res; } };
  let error;
  await handler({ params, body, user: USER, query: {} }, res, (e) => { error = e; });
  if (error) throw error;
  return out;
}

const makeClient = () =>
  new Client({ name: 'Repeat Buyer', phone: '9876543210', assignedTo: USER.id, createdBy: USER.id }).save();

describe('a client who returns after a closed deal', () => {
  it('is reopened by a new deal, keeping the first deal and a status history', () =>
    inTenant(async () => {
      const client = await makeClient();
      await call(addDeal, { params: { id: client.id }, body: { stage: 'new_lead', value: 100 } });
      let fresh = await Client.findById(client.id);
      await call(updateDealStage, { params: { id: client.id, dealId: String(fresh.deals[0]._id) }, body: { stage: 'closed_won' } });

      fresh = await Client.findById(client.id);
      expect(fresh.status).toBe('won');
      const firstConversion = fresh.convertedAt;
      expect(firstConversion).toBeTruthy();

      await call(addDeal, { params: { id: client.id }, body: { stage: 'new_lead', value: 200 } });
      fresh = await Client.findById(client.id);

      expect(fresh.status).toBe('qualified');
      expect(fresh.deals).toHaveLength(2);
      expect(fresh.deals[0].stage).toBe('closed_won');
      expect(fresh.deals[0].stageHistory.length).toBeGreaterThan(1);
      expect(fresh.convertedAt).toEqual(firstConversion);
      expect(fresh.statusHistory.map((h) => `${h.from}>${h.to}`)).toEqual(['lead>won', 'won>qualified']);
    }));

  it('goes back to won, not lost, when the second deal is lost', () =>
    inTenant(async () => {
      const client = await makeClient();
      await call(addDeal, { params: { id: client.id }, body: { stage: 'new_lead' } });
      let fresh = await Client.findById(client.id);
      await call(updateDealStage, { params: { id: client.id, dealId: String(fresh.deals[0]._id) }, body: { stage: 'closed_won' } });
      await call(addDeal, { params: { id: client.id }, body: { stage: 'new_lead' } });
      fresh = await Client.findById(client.id);
      await call(updateDealStage, { params: { id: client.id, dealId: String(fresh.deals[1]._id) }, body: { stage: 'closed_lost', notes: 'went elsewhere' } });

      fresh = await Client.findById(client.id);
      expect(fresh.status).toBe('won');
      expect(fresh.lostReason).toBeUndefined();
    }));

  it('stays active when one deal is lost but another is still open', () =>
    inTenant(async () => {
      const client = await makeClient();
      await call(addDeal, { params: { id: client.id }, body: { stage: 'new_lead' } });
      await call(addDeal, { params: { id: client.id }, body: { stage: 'new_lead' } });
      let fresh = await Client.findById(client.id);
      await call(updateDealStage, { params: { id: client.id, dealId: String(fresh.deals[0]._id) }, body: { stage: 'closed_lost' } });

      fresh = await Client.findById(client.id);
      expect(fresh.status).not.toBe('lost');
    }));
});

describe('the property a client bought', () => {
  const makeListing = (name = 'Plot 12') =>
    Listing.create({
      name, description: 'd', address: 'a', regularPrice: 100, discountPrice: 0,
      bathrooms: 1, bedrooms: 1, furnished: false, parking: false, type: 'sale', offer: false,
      imageUrls: ['x'], userRef: USER.id,
    });

  it('is recorded on the deal and carried to the sale when it is won', () =>
    inTenant(async () => {
      const client = await makeClient();
      const listing = await makeListing();
      await call(addDeal, { params: { id: client.id }, body: { stage: 'new_lead', value: 100, listingId: String(listing._id), type: 'sale' } });
      let fresh = await Client.findById(client.id);
      expect(String(fresh.deals[0].listingId)).toBe(String(listing._id));

      await call(updateDealStage, { params: { id: client.id, dealId: String(fresh.deals[0]._id) }, body: { stage: 'closed_won' } });
      expect((await Listing.findById(listing._id)).status).toBe('sold');
      const tx = await Transaction.findOne({ client: client._id });
      expect(String(tx.property)).toBe(String(listing._id));
      expect(tx.propertyName).toBe('Plot 12');
    }));

  it('can be linked afterwards, repairing an already-won deal', () =>
    inTenant(async () => {
      const client = await makeClient();
      const listing = await makeListing('Villa 3');
      await call(addDeal, { params: { id: client.id }, body: { stage: 'new_lead', value: 50 } });
      let fresh = await Client.findById(client.id);
      const dealId = String(fresh.deals[0]._id);
      await call(updateDealStage, { params: { id: client.id, dealId }, body: { stage: 'closed_won' } });

      await call(setDealListing, { params: { id: client.id, dealId }, body: { listingId: String(listing._id) } });
      expect((await Listing.findById(listing._id)).status).toBe('sold');
      expect((await Transaction.findOne({ client: client._id })).propertyName).toBe('Villa 3');

      // …but a won deal cannot be swapped to a different property.
      const other = await makeListing('Other');
      await expect(
        call(setDealListing, { params: { id: client.id, dealId }, body: { listingId: String(other._id) } })
      ).rejects.toThrow(/already won/);
    }));

  it('must be a property that exists', () =>
    inTenant(async () => {
      const client = await makeClient();
      await expect(
        call(addDeal, { params: { id: client.id }, body: { listingId: String(new mongoose.Types.ObjectId()) } })
      ).rejects.toThrow(/not found/);
    }));
});

describe('buyer requirements and clients', () => {
  let BuyerRequirement, createBuyerRequirement, getBuyerRequirements;
  beforeAll(async () => {
    ({ default: BuyerRequirement } = await import('../models/buyerRequirement.model.js'));
    ({ createBuyerRequirement, getBuyerRequirements } = await import('../controllers/buyerRequirement.controller.js'));
  });
  beforeEach(async () => { await BuyerRequirement.collection.deleteMany({}); });

  const body = (extra = {}) => ({ buyerName: 'Repeat Buyer', buyerPhone: '+919876543210', propertyType: 'sale', ...extra });
  const send = (req) => call(createBuyerRequirement, { params: {}, body: req });

  it('links to the client already on file with that phone', () =>
    inTenant(async () => {
      const client = await makeClient();
      const made = await send(body());
      expect(String(made.clientId)).toBe(String(client._id));
    }));

  it('links to a client named explicitly', () =>
    inTenant(async () => {
      const client = await makeClient();
      const made = await send(body({ buyerPhone: '+911111111111', clientId: String(client._id) }));
      expect(String(made.clientId)).toBe(String(client._id));
    }));

  it('stays unlinked for a walk-in, and when unlinking is asked for', () =>
    inTenant(async () => {
      const client = await makeClient();
      expect((await send(body({ buyerPhone: '+912222222222' }))).clientId).toBeNull();
      expect((await send(body({ clientId: null }))).clientId).toBeNull();
      expect(client).toBeTruthy();
    }));

  it('refuses a client that does not exist', () =>
    inTenant(async () => {
      await expect(send(body({ clientId: String(new mongoose.Types.ObjectId()) }))).rejects.toThrow(/not found/);
    }));

  it('lists one client’s requirements', () =>
    inTenant(async () => {
      const client = await makeClient();
      await send(body());
      await send(body({ buyerPhone: '+913333333333' }));
      const res = {};
      let out;
      await getBuyerRequirements(
        { query: { clientId: String(client._id) }, user: USER },
        { json: (v) => { out = v; return res; } },
        (e) => { throw e; }
      );
      expect(out).toHaveLength(1);
    }));
});

describe('the contact copy on a requirement', () => {
  let BuyerRequirement, createBuyerRequirement, eraseContact, exportContactData;
  beforeAll(async () => {
    ({ default: BuyerRequirement } = await import('../models/buyerRequirement.model.js'));
    ({ createBuyerRequirement } = await import('../controllers/buyerRequirement.controller.js'));
    ({ eraseContact, exportContactData } = await import('../controllers/dataRights.controller.js'));
  });
  beforeEach(async () => { await BuyerRequirement.collection.deleteMany({}); });

  const linked = async (client) =>
    call(createBuyerRequirement, {
      params: {},
      body: { buyerName: client.name, buyerPhone: '+919876543210', propertyType: 'sale', clientId: String(client._id) },
    });

  it('follows the client when their name, phone or email change', () =>
    inTenant(async () => {
      const client = await makeClient();
      const req = await linked(client);

      const fresh = await Client.findById(client.id);
      fresh.set({ name: 'Renamed Buyer', phone: '+91 98765-00000', email: 'New@Example.com' });
      await fresh.save();

      const after = await BuyerRequirement.findById(req._id);
      expect(after.buyerName).toBe('Renamed Buyer');
      expect(after.buyerPhone).toBe('+919876500000');
      expect(after.buyerEmail).toBe('new@example.com');
    }));

  it('is left alone when something else about the client changes', () =>
    inTenant(async () => {
      const client = await makeClient();
      const req = await linked(client);
      await BuyerRequirement.updateOne({ _id: req._id }, { $set: { buyerName: 'Hand edited' } });

      const fresh = await Client.findById(client.id);
      fresh.priority = 'urgent';
      await fresh.save();

      expect((await BuyerRequirement.findById(req._id)).buyerName).toBe('Hand edited');
    }));

  it('does not touch requirements linked to someone else', () =>
    inTenant(async () => {
      const a = await makeClient();
      const b = await new Client({ name: 'Other Person', phone: '9123456780', assignedTo: USER.id, createdBy: USER.id }).save();
      const reqB = await linked(b);
      const freshA = await Client.findById(a.id);
      freshA.name = 'Changed A';
      await freshA.save();
      expect((await BuyerRequirement.findById(reqB._id)).buyerName).toBe('Other Person');
    }));

  it('is erased with the client', () =>
    inTenant(async () => {
      const client = await makeClient();
      const req = await linked(client);
      const res = { json: () => res, status: () => res };
      await eraseContact({ params: { kind: 'client', id: client.id }, user: USER, query: {}, body: {} }, res, (e) => { throw e; });
      const after = await BuyerRequirement.findById(req._id);
      expect(after.buyerPhone).toBe('');
      expect(after.buyerName).toBe('Erased buyer');
      expect(after.erasedAt).toBeTruthy();
    }));

  it('is part of the client\u2019s data export', () =>
    inTenant(async () => {
      const client = await makeClient();
      await linked(client);
      let sent;
      const res = { setHeader: () => {}, send: (v) => { sent = JSON.parse(v); } };
      await exportContactData({ params: { kind: 'client', id: client.id }, user: USER }, res, (e) => { throw e; });
      expect(sent.requirements).toHaveLength(1);
      expect(sent.requirements[0].buyerName).toBe('Repeat Buyer');
    }));
});

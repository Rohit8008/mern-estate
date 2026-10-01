/**
 * Two people editing the same record must not silently overwrite each other.
 *
 * Listing and client updates were last-write-wins: an agent fixing the price
 * while a colleague fixed the address lost one of the two edits with no sign
 * it had happened. A caller that sends the `updatedAt` it loaded now gets a 409
 * VERSION_CONFLICT when someone saved in between. A caller that sends nothing —
 * the mobile app, scripts — keeps the old behaviour, which is the third case
 * each block holds.
 */

import mongoose from 'mongoose';
import Listing from '../models/listing.model.js';
import Client from '../models/client.model.js';
import '../models/user.model.js';
import { updateListing } from '../controllers/listing.controller.js';
import { updateClient } from '../controllers/client.controller.js';
import { asTestTenant } from './setup.js';

const ADMIN = { id: new mongoose.Types.ObjectId().toString(), role: 'admin' };

/** Run a controller to its response or its error. */
function call(handler, { params, body }) {
  return new Promise((resolve, reject) => {
    const res = {
      status() { return this; },
      json: resolve,
    };
    Promise.resolve(handler({ params, body, user: ADMIN, query: {} }, res, reject)).catch(reject);
  });
}

const later = () => new Promise((r) => setTimeout(r, 5));

describe('listing edit conflicts', () => {
  const seed = () => Listing.create({ name: 'Sea View 2BHK', userRef: ADMIN.id });

  it('saves when the version the caller loaded is still current', async () => {
    await asTestTenant(async () => {
      const listing = await seed();
      const body = await call(updateListing, {
        params: { id: String(listing._id) },
        body: { name: 'Sea View 2BHK, renovated', expectedUpdatedAt: listing.updatedAt },
      });
      expect(body.name).toBe('Sea View 2BHK, renovated');
    });
  });

  it('refuses a stale save with VERSION_CONFLICT and leaves the other edit in place', async () => {
    await asTestTenant(async () => {
      const listing = await seed();
      const loaded = listing.updatedAt;

      await later();
      await call(updateListing, { params: { id: String(listing._id) }, body: { address: '12 Marine Drive' } });

      const err = await call(updateListing, {
        params: { id: String(listing._id) },
        body: { address: '14 Marine Drive', expectedUpdatedAt: loaded },
      }).catch((e) => e);

      expect(err.statusCode).toBe(409);
      expect(err.code).toBe('VERSION_CONFLICT');
      expect(new Date(err.details.currentUpdatedAt).getTime()).toBeGreaterThan(loaded.getTime());

      const stored = await Listing.findById(listing._id).lean();
      expect(stored.address).toBe('12 Marine Drive');
    });
  });

  it('keeps last-write-wins for a caller that sends no version', async () => {
    await asTestTenant(async () => {
      const listing = await seed();
      await later();
      await call(updateListing, { params: { id: String(listing._id) }, body: { address: 'A' } });
      const body = await call(updateListing, { params: { id: String(listing._id) }, body: { address: 'B' } });
      expect(body.address).toBe('B');
    });
  });

  it('refuses a malformed version instead of ignoring it', async () => {
    await asTestTenant(async () => {
      const listing = await seed();
      const err = await call(updateListing, {
        params: { id: String(listing._id) },
        body: { name: 'X Y Z', expectedUpdatedAt: 'yesterday-ish' },
      }).catch((e) => e);
      expect(err.statusCode).toBe(400);
    });
  });
});

describe('client edit conflicts', () => {
  const seed = () => Client.create({ name: 'Priya Shah', assignedTo: ADMIN.id, createdBy: ADMIN.id });

  it('saves, and still recalculates the score, when the version is current', async () => {
    await asTestTenant(async () => {
      const client = await seed();
      const body = await call(updateClient, {
        params: { id: String(client._id) },
        body: { priority: 'urgent', expectedUpdatedAt: client.updatedAt },
      });
      expect(body.data.priority).toBe('urgent');
      const stored = await Client.findById(client._id).lean();
      expect(stored.priority).toBe('urgent');
      expect(typeof stored.score).toBe('number');
    });
  });

  it('refuses a stale save with VERSION_CONFLICT', async () => {
    await asTestTenant(async () => {
      const client = await seed();
      const loaded = client.updatedAt;

      await later();
      await call(updateClient, { params: { id: String(client._id) }, body: { organization: 'Shah & Co' } });

      const err = await call(updateClient, {
        params: { id: String(client._id) },
        body: { organization: 'Shah Group', expectedUpdatedAt: loaded },
      }).catch((e) => e);

      expect(err.statusCode).toBe(409);
      expect(err.code).toBe('VERSION_CONFLICT');
      const stored = await Client.findById(client._id).lean();
      expect(stored.organization).toBe('Shah & Co');
    });
  });

  it('guards the save itself, for a write that lands between the read and the save', async () => {
    // The controller's pre-check sees the record as read; `$where` on save is
    // what closes the gap after it. Exercised directly, because the window is
    // too narrow to hit through the handler.
    await asTestTenant(async () => {
      const client = await seed();
      const doc = await Client.findById(client._id);
      const loaded = doc.updatedAt;

      await later();
      await Client.updateOne({ _id: client._id }, { $set: { organization: 'Theirs' } });

      doc.set({ organization: 'Mine' });
      doc.$where = { updatedAt: loaded };
      const err = await doc.save().catch((e) => e);
      expect(err?.name).toBe('DocumentNotFoundError');
      expect((await Client.findById(client._id).lean()).organization).toBe('Theirs');
    });
  });

  it('accepts a version that arrives as a Date (what Joi hands over) without losing milliseconds', async () => {
    await asTestTenant(async () => {
      const client = await seed();
      const body = await call(updateClient, {
        params: { id: String(client._id) },
        body: { organization: 'Shah & Co', expectedUpdatedAt: new Date(client.updatedAt.getTime()) },
      });
      expect(body.data.organization).toBe('Shah & Co');
    });
  });

  it('keeps last-write-wins for a caller that sends no version', async () => {
    await asTestTenant(async () => {
      const client = await seed();
      await later();
      await call(updateClient, { params: { id: String(client._id) }, body: { organization: 'A' } });
      const body = await call(updateClient, { params: { id: String(client._id) }, body: { organization: 'B' } });
      expect(body.data.organization).toBe('B');
    });
  });
});

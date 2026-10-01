/**
 * Performance changes that must not change an answer.
 *
 * Each block pins a behaviour that moved from "many queries / whole documents"
 * to "one grouped query / bounded read" and checks the response is the same as
 * before: dashboard counts, thread order, conversation unread, list rows.
 */

import mongoose from 'mongoose';
import request from 'supertest';
import Listing from '../models/listing.model.js';
import BuyerRequirement from '../models/buyerRequirement.model.js';
import Message from '../models/message.model.js';
import Client from '../models/client.model.js';
import User from '../models/user.model.js';
import '../models/role.model.js';
import { getDashboardAnalytics, getEmployeePerformance, getPropertyStats } from '../controllers/dashboard.controller.js';
import { getThread, getConversations } from '../controllers/message.controller.js';
import { getClients } from '../controllers/client.controller.js';
import { searchListings } from '../search/listingSearch.js';
import { encryptMessageWithKey } from '../utils/encryption.js';
import { invalidateEverywhere } from '../utils/cache.js';
import { runWithTenant } from '../tenancy/tenantContext.js';
import { asTestTenant } from './setup.js';
import { setDistHeaders } from '../app.js';

/** Drive an asyncHandler-wrapped or plain handler and wait for its answer. */
function call(handler, req) {
  return new Promise((resolve, reject) => {
    const res = { status() { return res; }, json: resolve };
    handler({ params: {}, query: {}, ...req }, res, reject);
  });
}

const ADMIN = { id: String(new mongoose.Types.ObjectId()), role: 'admin' };
const OID = () => new mongoose.Types.ObjectId();

async function seedListings(rows) {
  await Listing.insertMany(
    rows.map((r) => ({ name: 'L', userRef: OID(), type: 'sale', status: 'available', ...r }))
  );
}

describe('dashboard analytics', () => {
  it('counts each status from one grouped pass, as before', async () => {
    await asTestTenant(async () => {
      await seedListings([
        { status: 'available' }, { status: 'available' }, { status: 'sold' },
        { status: 'rented' }, { status: 'under_negotiation' }, { status: 'available', isDeleted: true },
      ]);
      const agent = OID();
      for (const status of ['active', 'active', 'matched', 'closed']) {
        await BuyerRequirement.create({ buyerName: 'B', buyerPhone: '9999999999', status, createdBy: agent, assignedAgent: agent });
      }
      const body = await call(getDashboardAnalytics, { user: ADMIN });
      expect(body.data.properties).toMatchObject({ total: 5, available: 2, sold: 1, rented: 1, underNegotiation: 1 });
      expect(body.data.buyers).toEqual({ total: 4, active: 2, matched: 1, closed: 1 });
    });
  });

  it('is cached per workspace and dropped by a listing write', async () => {
    await asTestTenant(async () => {
      await seedListings([{ status: 'available' }]);
      const first = await call(getDashboardAnalytics, { user: ADMIN });
      expect(first.data.properties.total).toBe(1);

      await seedListings([{ status: 'sold' }]);
      const stale = await call(getDashboardAnalytics, { user: ADMIN });
      expect(stale.data.properties.total).toBe(1); // served from the 30 s cache

      invalidateEverywhere({ prefix: 'dashboard:' });
      const fresh = await call(getDashboardAnalytics, { user: ADMIN });
      expect(fresh.data.properties.total).toBe(2);
    });
  });

  it('never serves one workspace another\'s cached dashboard', async () => {
    const other = String(OID());
    await asTestTenant(async () => {
      await seedListings([{}, {}, {}]);
      const mine = await call(getDashboardAnalytics, { user: ADMIN });
      expect(mine.data.properties.total).toBe(3);
    });
    const theirs = await runWithTenant({ tenantId: other }, () => call(getDashboardAnalytics, { user: ADMIN }));
    expect(theirs.data.properties.total).toBe(0);
  });

  it('keeps employees\' cached views apart from the admin\'s and each other\'s', async () => {
    await asTestTenant(async () => {
      const a = String(OID());
      const b = String(OID());
      await seedListings([{ assignedAgent: a }, { assignedAgent: a }, { assignedAgent: b }]);
      const forA = await call(getPropertyStats, { user: { id: a, role: 'employee' } });
      const forB = await call(getPropertyStats, { user: { id: b, role: 'employee' } });
      const total = (r) => r.data.statusBreakdown.reduce((n, x) => n + x.count, 0);
      expect(total(forA)).toBe(2);
      expect(total(forB)).toBe(1);
    });
  });
});

describe('employee performance', () => {
  it('returns the same per-employee figures from two grouped queries', async () => {
    await asTestTenant(async () => {
      const mk = (username) => User.create({ username, email: `${username}@example.com`, password: 'Passw0rd!x', role: 'employee' });
      const [e1, e2, e3] = [await mk('asha'), await mk('bilal'), await mk('chitra')];
      await seedListings([
        { assignedAgent: e1._id, status: 'sold' }, { assignedAgent: e1._id, status: 'rented' },
        { assignedAgent: e1._id, status: 'available' }, { assignedAgent: e1._id, status: 'available', isDeleted: true },
        { assignedAgent: e2._id, status: 'available' },
      ]);
      await BuyerRequirement.create({ buyerName: 'B', buyerPhone: '9999999999', status: 'closed', createdBy: e1._id, assignedAgent: e1._id });
      await BuyerRequirement.create({ buyerName: 'B', buyerPhone: '9999999998', status: 'active', createdBy: e1._id, assignedAgent: e1._id });

      const body = await call(getEmployeePerformance, { user: ADMIN });
      const by = Object.fromEntries(body.data.map((r) => [r.employee.username, r.stats]));
      expect(by.asha).toEqual({ assignedListings: 3, soldListings: 2, assignedBuyers: 2, closedBuyers: 1, conversionRate: '66.67' });
      expect(by.bilal).toEqual({ assignedListings: 1, soldListings: 0, assignedBuyers: 0, closedBuyers: 0, conversionRate: '0.00' });
      expect(by.chitra).toEqual({ assignedListings: 0, soldListings: 0, assignedBuyers: 0, closedBuyers: 0, conversionRate: 0 });
      expect(e3).toBeTruthy();
    });
  });
});

describe('message thread', () => {
  const me = String(OID());
  const them = OID();

  async function seedThread(n) {
    for (let i = 0; i < n; i += 1) {
      await Message.create({
        senderId: i % 2 ? them : me, receiverId: i % 2 ? me : them,
        content: `m${i}`, createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
      });
    }
  }

  it('returns the newest page, oldest first, as a bare array', async () => {
    await asTestTenant(async () => {
      await seedThread(8);
      const body = await call(getThread, { user: { id: me }, params: { otherId: String(them) }, query: { limit: '3' } });
      expect(Array.isArray(body)).toBe(true);
      expect(body.map((m) => m.content)).toEqual(['m5', 'm6', 'm7']);
    });
  });

  it('pages backwards with before=', async () => {
    await asTestTenant(async () => {
      await seedThread(8);
      const older = await call(getThread, {
        user: { id: me }, params: { otherId: String(them) },
        query: { limit: '3', before: new Date(Date.UTC(2026, 0, 1, 0, 0, 5)).toISOString() },
      });
      expect(older.map((m) => m.content)).toEqual(['m2', 'm3', 'm4']);
    });
  });

  it('defaults to 100 and decrypts', async () => {
    await asTestTenant(async () => {
      await Message.create({ senderId: me, receiverId: them, content: encryptMessageWithKey('secret hello'), isEncrypted: true });
      const body = await call(getThread, { user: { id: me }, params: { otherId: String(them) } });
      expect(body).toHaveLength(1);
      expect(body[0].content).toBe('secret hello');
    });
  });

  it('rejects a malformed cursor with a 400', async () => {
    await asTestTenant(async () => {
      await expect(
        call(getThread, { user: { id: me }, params: { otherId: String(them) }, query: { before: 'nonsense' } })
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});

describe('conversations', () => {
  it('groups by counterpart with the latest message, truncated, and the unread count', async () => {
    await asTestTenant(async () => {
      const me = OID();
      const a = OID();
      const b = OID();
      const long = 'x'.repeat(500);
      await Message.create({ senderId: a, receiverId: me, content: 'old from a', createdAt: new Date('2026-01-01T00:00:01Z') });
      await Message.create({ senderId: a, receiverId: me, content: long, createdAt: new Date('2026-01-01T00:00:03Z') });
      await Message.create({ senderId: me, receiverId: b, content: 'to b', createdAt: new Date('2026-01-01T00:00:05Z') });
      await Message.create({ senderId: b, receiverId: me, content: 'read already', read: true, createdAt: new Date('2026-01-01T00:00:02Z') });

      const list = await call(getConversations, { user: { id: String(me) } });
      expect(list.map((c) => c.otherId)).toEqual([String(b), String(a)]);
      const [cb, ca] = list;
      expect(cb.unread).toBe(0);
      expect(cb.lastMessage.content).toBe('to b');
      expect(ca.unread).toBe(2);
      expect(ca.lastMessage.content.length).toBe(201); // 200 chars + ellipsis
      expect(ca.otherUser).toMatchObject({ username: 'Former team member' });
    });
  });
});

describe('client list rows', () => {
  it('leave out the heavy arrays but keep the fields lists render', async () => {
    await asTestTenant(async () => {
      const owner = OID();
      await Client.create({
        name: 'Lead One', phone: '9876543210', assignedTo: owner, createdBy: owner,
        communications: [{ type: 'call', summary: 'hello', createdBy: owner }],
        followUps: [{ dueAt: new Date(), type: 'call' }],
        deals: [{ title: 'D', stage: 'qualified' }],
      });
      const body = await call(getClients, { user: { id: String(owner), role: 'admin' }, query: {} });
      const row = body.data[0];
      expect(row).toMatchObject({ name: 'Lead One', phone: '9876543210' });
      expect(row.communications).toBeUndefined();
      expect(row.followUps).toBeUndefined();
      expect(row.scoreFactors).toBeUndefined();
      expect(row.deals).toHaveLength(1);
      expect(row.deals[0].stage).toBe('qualified');
      expect(row.deals[0].stageHistory).toBeUndefined();
    });
  });
});

describe('listing search without $facet', () => {
  it('does not leak the relevance score into rows', async () => {
    await asTestTenant(async () => {
      await seedListings([
        { name: 'Sunrise Heights', city: 'Pune' }, { name: 'Sunrise Plaza', city: 'Pune' },
        { name: 'Sunrise Villa', city: 'Pune' }, { name: 'Sunrise Court', city: 'Pune' },
        { name: 'Sunrise Tower', city: 'Pune' }, { name: 'Other', city: 'Delhi' },
      ]);
      const out = await searchListings({ q: 'sunrise', user: ADMIN, limit: 3 });
      expect(out.tier).toBe('text');
      expect(out.total).toBe(5);
      expect(out.listings).toHaveLength(3);
      out.listings.forEach((r) => expect(r).not.toHaveProperty('score'));
    });
  });

  it('keeps newest-first order with _id as the tiebreak', async () => {
    await asTestTenant(async () => {
      const same = new Date('2026-02-02T00:00:00Z');
      await Listing.insertMany([1, 2, 3].map((i) => ({ name: `T${i}`, userRef: OID(), type: 'sale', status: 'available', createdAt: same })));
      const out = await searchListings({ user: ADMIN, limit: 10 });
      const ids = out.listings.map((l) => String(l._id));
      expect([...ids].sort().reverse()).toEqual(ids);
    });
  });
});

describe('request pipeline limits', () => {
  let app;
  beforeAll(async () => {
    const { createApp } = await import('../app.js');
    app = createApp();
  });

  const big = JSON.stringify({ pad: 'x'.repeat(1.5 * 1024 * 1024) });

  it('refuses a 1.5 MB JSON body on an ordinary route', async () => {
    const res = await request(app).post('/api/clients').set('Content-Type', 'application/json').send(big);
    expect(res.status).toBe(413);
  });

  it('still lets the import routes take it (they reach auth, not the size limit)', async () => {
    const lead = await request(app).post('/api/lead-import/preview').set('Content-Type', 'application/json').send(big);
    expect(lead.status).not.toBe(413);
    const listing = await request(app).post('/api/listing/import/preview').set('Content-Type', 'application/json').send(big);
    expect(listing.status).not.toBe(413);
  });
});

describe('static cache headers', () => {
  const run = (file) => {
    const headers = {};
    setDistHeaders({ setHeader: (k, v) => { headers[k] = v; } }, file);
    return headers['Cache-Control'];
  };

  it('caches hashed assets for a year, immutable', () => {
    expect(run('/srv/frontend/dist/assets/index-abc123.js')).toBe('public, max-age=31536000, immutable');
  });

  it('never caches the shell or the service worker', () => {
    expect(run('/srv/frontend/dist/index.html')).toBe('no-cache');
    expect(run('/srv/frontend/dist/sw.js')).toBe('no-cache');
  });

  it('leaves everything else to the defaults', () => {
    expect(run('/srv/frontend/dist/favicon.ico')).toBeUndefined();
  });
});

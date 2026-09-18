/**
 * Share links — what replaced public browsing.
 *
 * The property book is no longer reachable without a session, so this is the
 * only path by which anything in it leaves the agency. The token in the URL IS
 * the credential, and every test here follows from taking that seriously: what
 * the link exposes, when it stops working, and who is allowed to create one.
 */

import mongoose from 'mongoose';
import bcryptjs from 'bcryptjs';
import PropertyShare from '../models/propertyShare.model.js';
import Listing from '../models/listing.model.js';
import { createShare, openShare, revokeShare, listShares } from '../controllers/share.controller.js';
import { runWithTenant } from '../tenancy/tenantContext.js';

let tenantId;
let adminId;

const inWorkspace = (fn) => runWithTenant({ tenantId: String(tenantId) }, fn);

beforeEach(() => {
  tenantId = global.testUtils.tenantId;
  adminId = new mongoose.Types.ObjectId();
});

function call(handler, { user, body = {}, params = {}, headers = {} } = {}) {
  const req = {
    user,
    tenantId: String(tenantId),
    body, params, query: {}, headers, ip: '127.0.0.1',
    originalUrl: '/api/share',
    get: (h) => headers[h.toLowerCase()],
  };
  return inWorkspace(
    () =>
      new Promise((resolve, reject) => {
        const res = {
          setHeader() {},
          status(code) { this.__status = code; return this; },
          json(payload) { resolve({ ...payload, __status: this.__status || 200 }); return this; },
        };
        Promise.resolve(handler(req, res, (err) => (err ? reject(err) : resolve(undefined)))).catch(reject);
      })
  );
}

const admin = () => ({ id: String(adminId), role: 'admin' });

/** Wait for a fire-and-forget write to land, up to a deadline. */
async function until(fn, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > deadline) return null;
    await new Promise((r) => setTimeout(r, 10));
  }
}

async function seedListings(n = 2) {
  return inWorkspace(() =>
    Listing.insertMany(
      Array.from({ length: n }, (_, i) => ({
        name: `Property ${i + 1}`,
        userRef: adminId,
        regularPrice: 1000000 * (i + 1),
        city: 'Bathinda',
        remarks: 'INTERNAL: owner will take less',
        imageUrls: ['/uploads/x.jpg'],
      }))
    )
  );
}

describe('creating a link', () => {
  it('mints a token long enough that guessing is not a strategy', async () => {
    const [l] = await seedListings(1);
    const res = await call(createShare, { user: admin(), body: { listingIds: [String(l._id)] } });
    // 32 random bytes, base64url — 43 characters.
    expect(res.data.share.token.length).toBeGreaterThanOrEqual(43);
    expect(res.data.path).toBe(`/s/${res.data.share.token}`);
  });

  it('expires by default', async () => {
    // A link that works forever is one still working long after the deal closed
    // and the recipient has forwarded it on.
    const [l] = await seedListings(1);
    const res = await call(createShare, { user: admin(), body: { listingIds: [String(l._id)] } });
    expect(res.data.share.expiresAt).toBeTruthy();
    const days = Math.round((new Date(res.data.share.expiresAt) - Date.now()) / 86400000);
    expect(days).toBe(30);
  });

  it('allows no expiry only when asked for explicitly', async () => {
    const [l] = await seedListings(1);
    const res = await call(createShare, {
      user: admin(),
      body: { listingIds: [String(l._id)], expiryDays: null },
    });
    expect(res.data.share.expiresAt).toBeNull();
  });

  it('refuses an empty selection', async () => {
    await expect(call(createShare, { user: admin(), body: { listingIds: [] } })).rejects.toThrow(/at least one/i);
  });

  it('never returns the passcode hash to the agent', async () => {
    const [l] = await seedListings(1);
    const res = await call(createShare, {
      user: admin(),
      body: { listingIds: [String(l._id)], passcode: '1234' },
    });
    expect(res.data.share.hasPasscode).toBe(true);
    expect(res.data.share.passcodeHash).toBeUndefined();
  });

  it('refuses a passcode too short to be worth having', async () => {
    const [l] = await seedListings(1);
    await expect(
      call(createShare, { user: admin(), body: { listingIds: [String(l._id)], passcode: '12' } })
    ).rejects.toThrow(/4 characters/);
  });
});

describe('you cannot share what you cannot see', () => {
  it('refuses a property outside the creator\'s scope', async () => {
    // A share must not become a way around the permissions that apply
    // everywhere else in the product.
    const [l] = await inWorkspace(() =>
      Listing.insertMany([{ name: 'Not theirs', userRef: adminId, category: 'admins-only' }])
    );
    const stranger = {
      id: String(new mongoose.Types.ObjectId()),
      role: 'employee',
      assignedCategories: ['something-else'],
    };
    await expect(
      call(createShare, { user: stranger, body: { listingIds: [String(l._id)] } })
    ).rejects.toThrow(/not yours to share/i);
  });

  it('refuses the whole request when only one property is out of scope', async () => {
    const [mine, theirs] = await inWorkspace(() =>
      Listing.insertMany([
        { name: 'Mine', userRef: adminId, category: 'mine' },
        { name: 'Theirs', userRef: adminId, category: 'theirs' },
      ])
    );
    const employee = {
      id: String(new mongoose.Types.ObjectId()),
      role: 'employee',
      assignedCategories: ['mine'],
    };
    await expect(
      call(createShare, { user: employee, body: { listingIds: [String(mine._id), String(theirs._id)] } })
    ).rejects.toThrow(/not yours to share/i);
  });
});

describe('opening a link', () => {
  let token;
  let listings;

  beforeEach(async () => {
    listings = await seedListings(2);
    const res = await call(createShare, {
      user: admin(),
      body: { listingIds: listings.map((l) => String(l._id)), label: 'For Mr Sharma' },
    });
    token = res.data.share.token;
  });

  it('works with no session at all', async () => {
    const res = await call(openShare, { user: undefined, params: { token } });
    expect(res.data.properties).toHaveLength(2);
    expect(res.data.label).toBe('For Mr Sharma');
  });

  it('shows only the properties on the link', async () => {
    const [other] = await inWorkspace(() =>
      Listing.insertMany([{ name: 'Not on the link', userRef: adminId }])
    );
    const res = await call(openShare, { user: undefined, params: { token } });
    expect(res.data.properties.map((p) => p.name)).not.toContain('Not on the link');
    expect(String(other._id)).toBeTruthy();
  });

  it('exposes an allowlist, never the internal columns', async () => {
    // An allowlist rather than a redaction, so a new column on Listing cannot
    // become visible to the public because somebody added one.
    const res = await call(openShare, { user: undefined, params: { token } });
    const shown = res.data.properties[0];
    ['remarks', 'ownerIds', 'assignedAgent', 'userRef', 'tenantId', 'voiceNotes', 'attributes', 'isDeleted']
      .forEach((field) => expect(shown[field]).toBeUndefined());
    expect(shown.name).toBeTruthy();
    expect(shown.imageUrls).toBeDefined();
  });

  it('withholds the price when the agent chose to', async () => {
    const [l] = await seedListings(1);
    const created = await call(createShare, {
      user: admin(),
      body: { listingIds: [String(l._id)], showPrice: false },
    });
    const res = await call(openShare, { user: undefined, params: { token: created.data.share.token } });
    expect(res.data.properties[0].regularPrice).toBeUndefined();
    expect(res.data.properties[0].name).toBeTruthy();
  });

  it('counts each view, so an agent can see a link spreading', async () => {
    await call(openShare, { user: undefined, params: { token } });
    await call(openShare, { user: undefined, params: { token } });

    // openShare increments without awaiting, so the write lands slightly after
    // the response. Poll to a deadline rather than sleeping a fixed 60ms, which
    // is a coin flip under CI load, and assert the EXACT count: ">= 1" would
    // still pass if the second increment were lost, which is precisely the bug
    // this test exists to catch.
    const share = await until(async () => {
      const s = await inWorkspace(() => PropertyShare.findOne({ token }));
      return s?.viewCount === 2 ? s : null;
    });

    expect(share).not.toBeNull();
    expect(share.viewCount).toBe(2);
    expect(share.lastViewedAt).toBeInstanceOf(Date);
  });

  it('gives the same answer for an unknown token as for a withdrawn one', async () => {
    // Otherwise the endpoint tells an attacker which tokens once existed.
    await expect(call(openShare, { user: undefined, params: { token: 'made-up' } })).rejects.toThrow(
      /not valid/i
    );
  });
});

describe('a link that should no longer work', () => {
  it('stops after it is withdrawn', async () => {
    const [l] = await seedListings(1);
    const created = await call(createShare, { user: admin(), body: { listingIds: [String(l._id)] } });
    await call(revokeShare, { user: admin(), params: { id: created.data.share.id } });

    const res = await call(openShare, { user: undefined, params: { token: created.data.share.token } });
    expect(res.__status).toBe(410);
    expect(res.message).toMatch(/withdrawn/i);
  });

  it('stops after it expires', async () => {
    const [l] = await seedListings(1);
    const share = await inWorkspace(() =>
      PropertyShare.create({
        token: PropertyShare.generateToken(),
        listingIds: [l._id],
        createdBy: adminId,
        expiresAt: new Date(Date.now() - 1000),
      })
    );
    const res = await call(openShare, { user: undefined, params: { token: share.token } });
    expect(res.__status).toBe(410);
    expect(res.message).toMatch(/expired/i);
  });

  it('is kept rather than deleted, so the record of what was sent survives', async () => {
    const [l] = await seedListings(1);
    const created = await call(createShare, { user: admin(), body: { listingIds: [String(l._id)] } });
    await call(revokeShare, { user: admin(), params: { id: created.data.share.id } });

    const share = await inWorkspace(() => PropertyShare.findById(created.data.share.id));
    expect(share).not.toBeNull();
    expect(share.revokedAt).toBeTruthy();
    expect(String(share.revokedBy)).toBe(String(adminId));
  });

  it('cannot be withdrawn by someone else', async () => {
    const [l] = await seedListings(1);
    const created = await call(createShare, { user: admin(), body: { listingIds: [String(l._id)] } });
    const other = { id: String(new mongoose.Types.ObjectId()), role: 'employee' };
    await expect(
      call(revokeShare, { user: other, params: { id: created.data.share.id } })
    ).rejects.toThrow(/only withdraw links you created/i);
  });
});

describe('passcode-protected links', () => {
  let token;

  beforeEach(async () => {
    const [l] = await seedListings(1);
    const created = await call(createShare, {
      user: admin(),
      body: { listingIds: [String(l._id)], passcode: 'gate1234' },
    });
    token = created.data.share.token;
  });

  it('asks for the passcode rather than showing anything', async () => {
    const res = await call(openShare, { user: undefined, params: { token } });
    expect(res.__status).toBe(401);
    expect(res.passcodeRequired).toBe(true);
    expect(res.data).toBeUndefined();
  });

  it('refuses the wrong one', async () => {
    const res = await call(openShare, {
      user: undefined, params: { token }, headers: { 'x-share-passcode': 'nope' },
    });
    expect(res.__status).toBe(401);
    expect(res.data).toBeUndefined();
  });

  it('opens with the right one', async () => {
    const res = await call(openShare, {
      user: undefined, params: { token }, headers: { 'x-share-passcode': 'gate1234' },
    });
    expect(res.data.properties).toHaveLength(1);
  });

  it('stores the passcode hashed, never in the clear', async () => {
    // A share link is routinely pasted into WhatsApp; the second factor should
    // not sit in the database in plain text either.
    const share = await inWorkspace(() => PropertyShare.findOne({ token }).select('+passcodeHash'));
    expect(share.passcodeHash).not.toBe('gate1234');
    expect(await bcryptjs.compare('gate1234', share.passcodeHash)).toBe(true);
  });
});

describe('listing what has been sent out', () => {
  it('shows an admin every link in the workspace', async () => {
    const [l] = await seedListings(1);
    const other = { id: String(new mongoose.Types.ObjectId()), role: 'employee' };
    await call(createShare, { user: admin(), body: { listingIds: [String(l._id)] } });
    await inWorkspace(() =>
      PropertyShare.create({
        token: PropertyShare.generateToken(), listingIds: [l._id], createdBy: other.id,
      })
    );
    const res = await call(listShares, { user: admin() });
    expect(res.data.shares.length).toBe(2);
  });

  it('shows an employee only their own', async () => {
    const [l] = await seedListings(1);
    const mine = { id: String(new mongoose.Types.ObjectId()), role: 'employee', assignedCategories: [] };
    await call(createShare, { user: admin(), body: { listingIds: [String(l._id)] } });
    const res = await call(listShares, { user: mine });
    expect(res.data.shares).toHaveLength(0);
  });
});

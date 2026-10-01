/**
 * Lists that used to have no bound, and the storage cap on uploads.
 *
 * The mailbox, the user list and a lead's communication history all returned
 * everything there was; documents parsed `?limit=` by hand with no cap. Each
 * now pages — but only when asked, because the existing callers read the old
 * shape and the mobile app cannot be updated in the same release. These cases
 * hold both shapes, and the storage cap that uploads now answer to.
 */

import mongoose from 'mongoose';
import Message from '../models/message.model.js';
import Client from '../models/client.model.js';
import Document from '../models/document.model.js';
import '../models/user.model.js';
// Registered for populate(): listUsers fills assignedRole.
import '../models/role.model.js';
import { getInbox } from '../controllers/message.controller.js';
import { listUsers, searchUsers } from '../controllers/user.controller.js';
import { getCommunications } from '../controllers/crm.controller.js';
import { listDocuments, storedDocumentBytes } from '../controllers/document.controller.js';
import { assertStorageAvailable, PlanLimitError } from '../tenancy/limits.js';
import { runWithTenant } from '../tenancy/tenantContext.js';
import { asTestTenant, TEST_TENANT_ID } from './setup.js';

const ME = { id: new mongoose.Types.ObjectId().toString(), role: 'admin' };
const OTHER = new mongoose.Types.ObjectId();

/** Call an Express handler and resolve with whatever it answered. */
function call(handler, req) {
  return new Promise((resolve, reject) => {
    const res = {
      status() { return res; },
      json: resolve,
    };
    handler({ params: {}, query: {}, user: ME, ...req }, res, reject);
  });
}

describe('message mailbox', () => {
  it('stays a bare array, newest first, when no page is asked for', async () => {
    await asTestTenant(async () => {
      for (const content of ['one', 'two', 'three']) {
        await Message.create({ senderId: OTHER, receiverId: ME.id, content });
      }
      const body = await call(getInbox, {});
      expect(Array.isArray(body)).toBe(true);
      expect(body.map((m) => m.content)).toEqual(['three', 'two', 'one']);
    });
  });

  it('pages with a total when a page is asked for', async () => {
    await asTestTenant(async () => {
      for (const content of ['one', 'two', 'three']) {
        await Message.create({ senderId: OTHER, receiverId: ME.id, content });
      }
      const body = await call(getInbox, { query: { page: '2', limit: '2' } });
      expect(body.total).toBe(3);
      expect(body.data.map((m) => m.content)).toEqual(['one']);
    });
  });
});

describe('user list', () => {
  const seedUsers = async (names) => {
    const User = mongoose.model('User');
    for (const username of names) {
      await User.create({ username, email: `${username}@example.com`, password: 'Passw0rd!x' });
    }
  };

  it('stays a bare array without a page', async () => {
    await asTestTenant(async () => {
      await seedUsers(['asha', 'bilal']);
      const body = await call(listUsers, {});
      expect(Array.isArray(body)).toBe(true);
      expect(body.map((u) => u.username)).toEqual(['asha', 'bilal']);
      expect(body[0].password).toBeUndefined();
    });
  });

  it('pages and sorts by an allowed key', async () => {
    await asTestTenant(async () => {
      await seedUsers(['asha', 'bilal', 'chen']);
      const body = await call(listUsers, { query: { page: '1', limit: '2', sort: 'username:desc' } });
      expect(body.total).toBe(3);
      expect(body.data.map((u) => u.username)).toEqual(['chen', 'bilal']);
    });
  });
});

describe('user search', () => {
  it('treats the query as literal text, so a stray bracket is not a 500', async () => {
    await asTestTenant(async () => {
      const User = mongoose.model('User');
      await User.create({ username: 'a(b', email: 'ab@example.com', password: 'Passw0rd!x' });
      await User.create({ username: 'axb', email: 'axb@example.com', password: 'Passw0rd!x' });
      const body = await call(searchUsers, { query: { q: 'a(' } });
      expect(body.map((u) => u.username)).toEqual(['a(b']);
      // "." is a literal dot, not "any character".
      expect(await call(searchUsers, { query: { q: 'a.b' } })).toEqual([]);
    });
  });
});

describe('communication history', () => {
  it('pages in the database, newest first, and keeps its shape', async () => {
    await asTestTenant(async () => {
      const base = Date.now();
      const client = await Client.create({
        name: 'Lead',
        assignedTo: ME.id,
        createdBy: ME.id,
        communications: [1, 2, 3, 4].map((n) => ({
          type: 'call',
          summary: `call ${n}`,
          createdBy: ME.id,
          createdAt: new Date(base + n * 1000),
        })),
      });
      const body = await call(getCommunications, {
        params: { id: String(client._id) },
        query: { limit: '2', offset: '1' },
      });
      expect(body.success).toBe(true);
      expect(body.data.total).toBe(4);
      expect(body.data.communications.map((c) => c.summary)).toEqual(['call 3', 'call 2']);
    });
  });

  it('treats junk paging values as defaults rather than failing', async () => {
    await asTestTenant(async () => {
      const client = await Client.create({ name: 'Lead', assignedTo: ME.id, createdBy: ME.id });
      const body = await call(getCommunications, {
        params: { id: String(client._id) },
        query: { limit: 'abc', offset: '-4' },
      });
      expect(body.data).toEqual({ total: 0, communications: [] });
    });
  });
});

describe('document list paging', () => {
  it('caps an absurd limit instead of returning every record', async () => {
    await asTestTenant(async () => {
      const body = await call(listDocuments, { query: { limit: '1000000', page: 'abc' } });
      expect(body.limit).toBe(500);
      expect(body.page).toBe(1);
    });
  });
});

describe('storage cap', () => {
  const MB = 1024 * 1024;
  // Built per call: TEST_TENANT_ID is only set in setup.js's beforeAll, after
  // this file's describe blocks have been evaluated.
  const tenantWith = (limits) => ({ _id: TEST_TENANT_ID, slug: 'test', plan: 'starter', limits });
  const inWorkspace = (fn) =>
    runWithTenant({ tenantId: String(TEST_TENANT_ID), tenant: tenantWith({ maxStorageMb: 10 }) }, fn);

  const storeDocs = (sizes, extra = {}) => Promise.all(sizes.map((size, i) => Document.create({
    title: `doc ${i}`,
    filename: `f${i}.pdf`,
    mimeType: 'application/pdf',
    size,
    url: `/api/documents/file/f${i}.pdf`,
    uploadedBy: ME.id,
    related: { kind: 'client' },
    ...extra,
  })));

  it('counts live documents only', async () => {
    await inWorkspace(async () => {
      await storeDocs([3 * MB, 2 * MB]);
      await storeDocs([4 * MB], { isDeleted: true });
      expect(await storedDocumentBytes()).toBe(5 * MB);
    });
  });

  it('allows an upload that fits and refuses one that does not, with a 402', async () => {
    await inWorkspace(async () => {
      await storeDocs([8 * MB]);
      await expect(assertStorageAvailable(1.5 * MB, storedDocumentBytes)).resolves.toBeUndefined();
      const refused = assertStorageAvailable(3 * MB, storedDocumentBytes);
      await expect(refused).rejects.toThrow(PlanLimitError);
      await expect(assertStorageAvailable(3 * MB, storedDocumentBytes)).rejects.toMatchObject({ statusCode: 402 });
    });
  });

  it('does not check at all on an unlimited plan', async () => {
    const unlimited = tenantWith({ maxStorageMb: 0 });
    let asked = false;
    await runWithTenant({ tenantId: String(TEST_TENANT_ID), tenant: unlimited }, () =>
      assertStorageAvailable(50 * MB, async () => { asked = true; return 0; })
    );
    expect(asked).toBe(false);
  });
});

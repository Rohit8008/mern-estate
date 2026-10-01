/**
 * Search text is a literal, never a pattern.
 *
 * Controllers fed `req.query.q` straight into `new RegExp()` / `$regex`, so a
 * stray "(" was a 500, "a.*" matched every row, and "(a+)+$" could stall the
 * database on backtracking. These hold the helper, and the controllers that
 * now go through it.
 */

import mongoose from 'mongoose';
import { escapeRegex, containsInsensitive, equalsInsensitive } from '../utils/escapeRegex.js';
import Transaction from '../models/transaction.model.js';
import Role from '../models/role.model.js';
import Listing from '../models/listing.model.js';
import '../models/user.model.js';
import { listTransactions } from '../controllers/transaction.controller.js';
import { getRoles } from '../controllers/role.controller.js';
import { bulkImportListings } from '../controllers/listing.controller.js';
import { runWithTenant } from '../tenancy/tenantContext.js';
import { asTestTenant, TEST_TENANT_ID } from './setup.js';

const ADMIN = { id: new mongoose.Types.ObjectId().toString(), role: 'admin' };

/** Drive an Express handler without HTTP: resolves with the body or the error. */
function call(handler, req) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json: resolve,
    };
    Promise.resolve(handler({ user: ADMIN, query: {}, body: {}, ...req }, res, reject)).catch(reject);
  });
}

describe('escapeRegex helpers', () => {
  it('escapes every metacharacter', () => {
    expect(escapeRegex('a.b*(c)?[d]{e}|f^g$h\\i+')).toBe('a\\.b\\*\\(c\\)\\?\\[d\\]\\{e\\}\\|f\\^g\\$h\\\\i\\+');
  });

  it('treats the input as literal text', () => {
    expect(containsInsensitive('a.c').test('xA.Cx')).toBe(true);
    expect(containsInsensitive('a.c').test('abc')).toBe(false);
    expect(() => containsInsensitive('(')).not.toThrow();
  });

  it('matches a whole value ignoring case, and nothing longer', () => {
    expect(equalsInsensitive('Sales Agent').test('sales agent')).toBe(true);
    expect(equalsInsensitive('Sales').test('Sales Agent')).toBe(false);
    expect(equalsInsensitive('.*').test('anything')).toBe(false);
  });

  it('stringifies objects instead of passing them through', () => {
    expect(escapeRegex({ $ne: 1 })).toBe('\\[object Object\\]');
    expect(escapeRegex(undefined)).toBe('');
  });
});

describe('controllers search literally', () => {
  it('transactions: "(" is a search, not a 500, and "." is a dot', async () => {
    await asTestTenant(async () => {
      const base = { amount: 1, agent: ADMIN.id };
      await Transaction.create([
        { ...base, propertyName: 'Unit (A)', clientName: 'Asha' },
        { ...base, propertyName: 'Unit B', clientName: 'A.K. Rao' },
        { ...base, propertyName: 'Unit C', clientName: 'Akbar' },
      ]);
      const paren = await call(listTransactions, { query: { q: '(' } });
      expect(paren.data.map((t) => t.propertyName)).toEqual(['Unit (A)']);
      const dot = await call(listTransactions, { query: { q: 'A.K' } });
      expect(dot.data.map((t) => t.clientName)).toEqual(['A.K. Rao']);
    });
  });

  it('roles: a regex-looking search matches nothing it should not', async () => {
    await asTestTenant(async () => {
      await Role.create([{ name: 'Sales' }, { name: 'Support' }]);
      const body = await call(getRoles, { query: { search: 'S.*' } });
      expect(body.data.roles ?? body.data).toHaveLength(0);
    });
  });
});

describe('legacy bulk import', () => {
  it('refuses a row that repeats an earlier row in the same request', async () => {
    await asTestTenant(async () => {
      const row = { name: 'Plot 7', address: 'Sector 4', city: 'Gurgaon' };
      const body = await call(bulkImportListings, {
        body: { listings: [row, { ...row, name: ' plot 7 ' }, { name: 'Plot 8', address: 'Sector 4' }] },
      });
      expect(body.success).toBe(true);
      expect(await Listing.countDocuments({})).toBe(2);
      const dupes = body.results?.failed ?? body.data?.failed ?? [];
      expect(JSON.stringify(dupes)).toMatch(/Duplicate of row 2/);
    });
  });

  it('is held to the plan listing cap, before anything is written', async () => {
    const tenant = { _id: TEST_TENANT_ID, slug: 'test', plan: 'starter', limits: { maxListings: 1 } };
    const err = await runWithTenant({ tenantId: String(TEST_TENANT_ID), tenant }, () =>
      call(bulkImportListings, {
        body: { listings: [{ name: 'A1', address: 'x' }, { name: 'B2', address: 'y' }] },
      }).then(() => null, (e) => e)
    );
    expect(err?.statusCode).toBe(402);
    expect(await asTestTenant(() => Listing.countDocuments({}))).toBe(0);
  });
});

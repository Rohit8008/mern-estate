/**
 * GET /api/buyer-requirements answers in two shapes, and both are contracts.
 *
 * The mobile app reads a bare array and has no idea paging exists; the web
 * board asks for `?page=` and needs a total to draw a pager. Changing the
 * default shape would have broken the app on its next request, so paging is
 * opt-in — and these cases hold both halves.
 */

import mongoose from 'mongoose';
import BuyerRequirement from '../models/buyerRequirement.model.js';
// Registered for populate(): the handler fills createdBy and assignedAgent.
import '../models/user.model.js';
import { getBuyerRequirements } from '../controllers/buyerRequirement.controller.js';
import { asTestTenant } from './setup.js';

const STAFF = { id: new mongoose.Types.ObjectId().toString(), role: 'admin' };

function call(query) {
  return new Promise((resolve, reject) => {
    const res = { json: resolve };
    getBuyerRequirements({ query, user: STAFF }, res, reject);
  });
}

async function seed(names) {
  // Created one at a time so createdAt is strictly increasing.
  for (const buyerName of names) {
    await BuyerRequirement.create({ buyerName, createdBy: STAFF.id });
  }
}

describe('buyer list paging', () => {
  it('stays a bare array, newest first, when no page is asked for', async () => {
    await asTestTenant(async () => {
      await seed(['Asha', 'Bilal', 'Chen']);
      const body = await call({});
      expect(Array.isArray(body)).toBe(true);
      expect(body.map((b) => b.buyerName)).toEqual(['Chen', 'Bilal', 'Asha']);
    });
  });

  it('pages with a total when a page is asked for', async () => {
    await asTestTenant(async () => {
      await seed(['Asha', 'Bilal', 'Chen']);
      const body = await call({ page: '2', limit: '2', sort: 'name:asc' });
      expect(body.total).toBe(3);
      expect(body.page).toBe(2);
      expect(body.limit).toBe(2);
      expect(body.data.map((b) => b.buyerName)).toEqual(['Chen']);
    });
  });

  it('applies the same filter to the total as to the page', async () => {
    await asTestTenant(async () => {
      await seed(['Asha', 'Asif', 'Bilal']);
      const body = await call({ page: '1', limit: '1', search: 'as' });
      expect(body.total).toBe(2);
      expect(body.data).toHaveLength(1);
    });
  });

  it('ignores a sort key outside the allowlist', async () => {
    await asTestTenant(async () => {
      await seed(['Asha', 'Bilal']);
      const body = await call({ page: '1', sort: 'createdBy:asc' });
      expect(body.data.map((b) => b.buyerName)).toEqual(['Bilal', 'Asha']);
    });
  });
});

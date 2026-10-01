/**
 * Paging and sorting parsed from untrusted query strings.
 *
 * The list controllers used to do `Number(req.query.limit)`, so `?limit=1e9`
 * returned a whole collection and `?page=abc` reached Mongo as a NaN skip. The
 * sort allowlist matters for the same reason: a caller must not be able to
 * order rows by a field nobody exposed to them.
 */

import { parsePaging, parseSort } from '../utils/listQuery.js';

describe('parsePaging', () => {
  it('defaults to the first page of 20', () => {
    expect(parsePaging({})).toEqual({ page: 1, limit: 20, skip: 0 });
  });

  it('computes skip from page and limit', () => {
    expect(parsePaging({ page: '3', limit: '50' })).toEqual({ page: 3, limit: 50, skip: 100 });
  });

  it('caps the limit', () => {
    expect(parsePaging({ limit: '1000000' }).limit).toBe(500);
    expect(parsePaging({ limit: '80' }, { maxLimit: 50 }).limit).toBe(50);
  });

  it('falls back on junk instead of producing NaN', () => {
    expect(parsePaging({ page: 'abc', limit: '-5' })).toEqual({ page: 1, limit: 20, skip: 0 });
    expect(parsePaging({ page: '0' }).page).toBe(1);
    expect(parsePaging({ limit: ['10', '20'] }).limit).toBe(10);
  });
});

describe('parseSort', () => {
  const allowed = { name: 'name', budget: 'budget.max' };
  const fallback = { updatedAt: -1 };

  it('maps an allowed key to its stored path and direction', () => {
    expect(parseSort('budget:desc', allowed, fallback)).toEqual({ 'budget.max': -1, _id: -1 });
    expect(parseSort('name:asc', allowed, fallback)).toEqual({ name: 1, _id: 1 });
  });

  it('defaults to ascending when no direction is given', () => {
    expect(parseSort('name', allowed, fallback)).toEqual({ name: 1, _id: 1 });
  });

  it('ignores keys outside the allowlist', () => {
    expect(parseSort('passwordHash:asc', allowed, fallback)).toEqual({ updatedAt: -1, _id: -1 });
    expect(parseSort('__proto__:asc', allowed, fallback)).toEqual({ updatedAt: -1, _id: -1 });
    expect(parseSort(undefined, allowed, fallback)).toEqual({ updatedAt: -1, _id: -1 });
  });

  it('keeps a multi-key default and still adds the _id tiebreaker', () => {
    expect(parseSort('', allowed, { date: -1, createdAt: -1 })).toEqual({ date: -1, createdAt: -1, _id: -1 });
  });

  it('does not mutate the fallback', () => {
    const fb = { dueAt: 1 };
    parseSort('', allowed, fb);
    expect(fb).toEqual({ dueAt: 1 });
  });
});

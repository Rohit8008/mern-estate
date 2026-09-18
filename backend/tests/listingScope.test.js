/**
 * listingScope is the access boundary for every endpoint that returns more than
 * one listing. Before it existed, GET /api/listing/get applied no scoping at
 * all and the UI routing employees to /my-assigned was the only thing keeping
 * them out of the whole book — so these cases are a security regression guard,
 * not a style check.
 */

import { listingScope, canSeeInternalListingFields } from '../middleware/permissions.js';

const ADMIN = { id: 'admin1', role: 'admin' };
const EMPLOYEE = { id: 'emp1', role: 'employee', assignedCategories: ['plots', 'green-city'] };
const BARE_EMPLOYEE = { id: 'emp2', role: 'employee' };
const SELLER = { id: 'sell1', role: 'seller' };
const BUYER = { id: 'buy1', role: 'buyer' };

describe('listingScope', () => {
  it('does not restrict an admin', () => {
    expect(listingScope(ADMIN)).toEqual({});
  });

  it('narrows an admin to their own work when scope=assigned', () => {
    const filter = listingScope(ADMIN, { scope: 'assigned' });
    expect(filter.$or).toEqual(
      expect.arrayContaining([{ assignedAgent: 'admin1' }, { userRef: 'admin1' }])
    );
  });

  it('restricts an employee to their categories, assignments and own records', () => {
    const filter = listingScope(EMPLOYEE);
    expect(filter.$or).toEqual([
      { assignedAgent: 'emp1' },
      { userRef: 'emp1' },
      { category: { $in: ['plots', 'green-city'] } },
    ]);
  });

  it('still restricts an employee who has no categories assigned', () => {
    // The dangerous failure would be returning {} here — an unassigned
    // employee would then see everything.
    const filter = listingScope(BARE_EMPLOYEE);
    expect(filter).not.toEqual({});
    expect(filter.$or).toEqual([{ assignedAgent: 'emp2' }, { userRef: 'emp2' }]);
  });

  it('restricts a seller to what they created', () => {
    expect(listingScope(SELLER)).toEqual({ userRef: 'sell1' });
  });

  it('leaves the public catalogue unrestricted for buyers and anonymous visitors', () => {
    // Field-level redaction, not row filtering, is what protects internal data
    // on the public browse flow.
    expect(listingScope(BUYER)).toEqual({});
    expect(listingScope(undefined)).toEqual({});
  });

  it('never returns an empty filter for a staff role', () => {
    [EMPLOYEE, BARE_EMPLOYEE, SELLER].forEach((user) => {
      expect(Object.keys(listingScope(user)).length).toBeGreaterThan(0);
    });
  });
});

describe('canSeeInternalListingFields', () => {
  it('admits CRM staff only', () => {
    expect(canSeeInternalListingFields(ADMIN)).toBe(true);
    expect(canSeeInternalListingFields(EMPLOYEE)).toBe(true);
    expect(canSeeInternalListingFields(SELLER)).toBe(false);
    expect(canSeeInternalListingFields(BUYER)).toBe(false);
    expect(canSeeInternalListingFields(undefined)).toBe(false);
  });
});

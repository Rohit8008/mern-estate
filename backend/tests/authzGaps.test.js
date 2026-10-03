/**
 * Within-workspace authorisation gaps found by the 2026-10-03 audit.
 *
 * Tenant scoping was never the problem here: each of these let a signed-in user
 * of the SAME workspace read or touch something their role should not reach —
 * the palette returning the owner book to a seller, a transaction flipping a
 * colleague's listing to sold, report mail sent from someone else's template.
 */

import mongoose from 'mongoose';
import { asTestTenant } from './setup.js';
import { registerTenancy } from '../tenancy/tenantPlugin.js';
import { escapeHtml, stripActiveHtml } from '../utils/htmlSafety.js';
import { listingActionValidation } from '../middleware/validation.js';

let Role; let Owner; let Client; let Listing; let BuyerRequirement;
let searchOwners; let searchBuyers; let searchClients;
let userHasPermission; let assertCanReference;

const oid = () => String(new mongoose.Types.ObjectId());
const parsed = (remaining) => ({ remaining, filters: {} });

beforeAll(async () => {
  registerTenancy(mongoose);
  ({ default: Role } = await import('../models/role.model.js'));
  ({ default: Owner } = await import('../models/owner.model.js'));
  ({ default: Client } = await import('../models/client.model.js'));
  ({ default: Listing } = await import('../models/listing.model.js'));
  ({ default: BuyerRequirement } = await import('../models/buyerRequirement.model.js'));
  ({ searchOwners, searchBuyers, searchClients } = await import('../search/entitySearchers.js'));
  ({ userHasPermission } = await import('../middleware/permissions.js'));
  ({ assertCanReference } = await import('../controllers/transaction.controller.js'));
});

const inTenant = (fn) => asTestTenant(fn);
const makeRole = (permissions) =>
  inTenant(() => Role.create({ name: `r-${oid()}`, description: 'test', permissions }));

describe('userHasPermission (strict)', () => {
  it('admin yes; seller and role-less employee no; role decides otherwise', async () => {
    const withKey = await makeRole({ viewOwners: true });
    const without = await makeRole({ viewClients: true });
    await inTenant(async () => {
      expect(await userHasPermission({ role: 'admin' }, 'viewOwners')).toBe(true);
      expect(await userHasPermission({ role: 'seller' }, 'viewOwners')).toBe(false);
      expect(await userHasPermission({ role: 'employee' }, 'viewOwners')).toBe(false);
      expect(await userHasPermission({ role: 'employee', assignedRole: String(without._id) }, 'viewOwners')).toBe(false);
      expect(await userHasPermission({ role: 'employee', assignedRole: String(withKey._id) }, 'viewOwners')).toBe(true);
    });
  });
});

describe('global search honours the same permissions as the list routes', () => {
  it('owners: a seller and an employee without viewOwners get nothing', async () => {
    const role = await makeRole({ viewOwners: true });
    const noOwners = await makeRole({ viewClients: true });
    await inTenant(() => Owner.create({ name: 'Zorblax Estates' }));
    await inTenant(async () => {
      expect((await searchOwners(parsed('Zorblax'), { id: oid(), role: 'seller' })).items).toEqual([]);
      const denied = { id: oid(), role: 'employee', assignedRole: String(noOwners._id) };
      expect((await searchOwners(parsed('Zorblax'), denied)).items).toEqual([]);
      const allowed = { id: oid(), role: 'employee', assignedRole: String(role._id) };
      expect((await searchOwners(parsed('Zorblax'), allowed)).items).toHaveLength(1);
      expect((await searchOwners(parsed('Zorblax'), { id: oid(), role: 'admin' })).items).toHaveLength(1);
    });
  });

  it('buyers: a seller sees only requirements they created', async () => {
    const seller = { id: oid(), role: 'seller' };
    const base = { buyerPhone: '9000000000', buyerEmail: 'b@example.com', propertyType: 'sale' };
    await inTenant(async () => {
      await BuyerRequirement.create({ ...base, buyerName: 'Quillon Mine', createdBy: seller.id });
      await BuyerRequirement.create({ ...base, buyerName: 'Quillon Theirs', createdBy: oid() });
      const names = (await searchBuyers(parsed('Quillon'), seller)).items.map((i) => i.title);
      expect(names).toEqual(['Quillon Mine']);
    });
  });

  it('clients: refused without viewClients, scoped to assignedTo otherwise', async () => {
    const role = await makeRole({ viewClients: true });
    const me = { id: oid(), role: 'employee', assignedRole: String(role._id) };
    await inTenant(async () => {
      await Client.create({ name: 'Wendlar Mine', phone: '9000000001', assignedTo: me.id, createdBy: me.id });
      await Client.create({ name: 'Wendlar Theirs', phone: '9000000002', assignedTo: oid(), createdBy: oid() });
      expect((await searchClients(parsed('Wendlar'), me)).items.map((i) => i.title)).toEqual(['Wendlar Mine']);
      expect((await searchClients(parsed('Wendlar'), { id: oid(), role: 'seller' })).items).toEqual([]);
    });
  });
});

describe('transactions may only reference what the caller can see', () => {
  it('rejects a listing and a client outside the caller\'s scope, allows their own', async () => {
    const me = { id: oid(), role: 'employee' };
    await inTenant(async () => {
      const listing = (userRef) => Listing.create({
        name: 'L', description: 'd', address: 'a', regularPrice: 1, bathrooms: 1, bedrooms: 1, userRef, type: 'sale',
      });
      const mine = await listing(me.id);
      const theirs = await listing(oid());
      const myClient = await Client.create({ name: 'C1', phone: '9000000003', assignedTo: me.id, createdBy: me.id });
      const theirClient = await Client.create({ name: 'C2', phone: '9000000004', assignedTo: oid(), createdBy: oid() });

      await expect(assertCanReference(me, { property: theirs._id })).rejects.toMatchObject({ statusCode: 403 });
      await expect(assertCanReference(me, { property: mine._id })).resolves.toBeUndefined();
      await expect(assertCanReference(me, { client: theirClient._id })).rejects.toMatchObject({ statusCode: 403 });
      await expect(assertCanReference(me, { client: myClient._id })).resolves.toBeUndefined();
      await expect(assertCanReference(me, {})).resolves.toBeUndefined();
      await expect(assertCanReference({ id: oid(), role: 'admin' }, { client: theirClient._id })).resolves.toBeUndefined();
    });
  });
});

describe('report mail HTML', () => {
  it('escapes interpolated names', () => {
    expect(escapeHtml('<img src=x onerror=1>"&')).toBe('&lt;img src=x onerror=1&gt;&quot;&amp;');
  });

  it('strips script, handlers and javascript: urls, including reassembled ones', () => {
    const dirty = '<p onclick="x()">hi</p><script>alert(1)</script><a href="javascript:alert(1)">l</a><scr<script>ipt>alert(2)</scr</script>ipt><iframe src="//e"></iframe>';
    const clean = stripActiveHtml(dirty);
    expect(clean).not.toMatch(/<script|<iframe|onclick|javascript:|alert\(/i);
    expect(clean).toContain('<p>hi</p>');
  });
});

describe('voice note payload', () => {
  const check = (v) => listingActionValidation.voiceNote.validate(v).error;
  it('accepts an https url and refuses javascript:, http and a missing url', () => {
    expect(check({ url: 'https://res.cloudinary.com/x/video/upload/a.webm', label: 'n', duration: 3 })).toBeUndefined();
    expect(check({ url: 'javascript:alert(1)' })).toBeDefined();
    expect(check({ url: 'http://example.com/a.webm' })).toBeDefined();
    expect(check({})).toBeDefined();
  });
});

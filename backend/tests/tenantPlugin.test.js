/**
 * The tenant boundary.
 *
 * In shared-database multi-tenancy, isolation is enforced by this plugin and by
 * nothing else — there is no database-level wall to fall back on. Every case
 * below is a way one agency could end up reading or writing another agency's
 * data, so treat a failure here as a security incident rather than a broken
 * test.
 *
 * The plugin is registered on a private mongoose instance so these tests are
 * unaffected by whether the app has registered it globally.
 */

import mongoose from 'mongoose';
import { tenantPlugin, TenantScopeError } from '../tenancy/tenantPlugin.js';
import {
  runWithTenant,
  runWithoutTenantScope,
  getTenantId,
} from '../tenancy/tenantContext.js';

const TENANT_A = new mongoose.Types.ObjectId();
const TENANT_B = new mongoose.Types.ObjectId();

let Widget;

beforeAll(() => {
  const schema = new mongoose.Schema(
    { name: String, price: Number, city: String },
    { timestamps: true }
  );
  schema.plugin(tenantPlugin);
  Widget = mongoose.models.Widget || mongoose.model('Widget', schema);
});

const asA = (fn) => runWithTenant({ tenantId: String(TENANT_A) }, fn);
const asB = (fn) => runWithTenant({ tenantId: String(TENANT_B) }, fn);

/** Seed one document per tenant without going through the plugin. */
async function seedBothTenants() {
  await mongoose.connection.collection('widgets').insertMany([
    { name: 'A-one', price: 100, city: 'Gurugram', tenantId: TENANT_A },
    { name: 'A-two', price: 200, city: 'Gurugram', tenantId: TENANT_A },
    { name: 'B-one', price: 300, city: 'Bathinda', tenantId: TENANT_B },
  ]);
}

describe('writes are stamped with the caller\'s tenant', () => {
  it('save() sets tenantId without the caller passing it', async () => {
    const doc = await asA(() => Widget.create({ name: 'plot 1', price: 10 }));
    expect(String(doc.tenantId)).toBe(String(TENANT_A));
  });

  it('insertMany() stamps every document', async () => {
    await asA(() => Widget.insertMany([{ name: 'a' }, { name: 'b' }]));
    const raw = await mongoose.connection.collection('widgets').find({}).toArray();
    expect(raw).toHaveLength(2);
    raw.forEach((d) => expect(String(d.tenantId)).toBe(String(TENANT_A)));
  });

  it('refuses a save that claims a different tenant', async () => {
    await expect(
      asA(() => Widget.create({ name: 'smuggled', tenantId: TENANT_B }))
    ).rejects.toThrow(/tenant/i);
  });

  it('an upsert stamps the tenant on the document it inserts', async () => {
    await asA(() =>
      Widget.updateOne({ name: 'fresh' }, { $set: { price: 5 } }, { upsert: true })
    );
    const raw = await mongoose.connection.collection('widgets').findOne({ name: 'fresh' });
    expect(String(raw.tenantId)).toBe(String(TENANT_A));
  });
});

describe('reads never cross the boundary', () => {
  beforeEach(seedBothTenants);

  it('find() returns only the caller\'s documents', async () => {
    const a = await asA(() => Widget.find());
    const b = await asB(() => Widget.find());
    expect(a.map((d) => d.name).sort()).toEqual(['A-one', 'A-two']);
    expect(b.map((d) => d.name)).toEqual(['B-one']);
  });

  it('findById() cannot reach another tenant\'s document', async () => {
    const bDoc = await mongoose.connection.collection('widgets').findOne({ name: 'B-one' });
    // The id is a perfectly valid ObjectId — an attacker pasting one from
    // another workspace is the exact scenario this must survive.
    const found = await asA(() => Widget.findById(bDoc._id));
    expect(found).toBeNull();
  });

  it('countDocuments() counts only the caller\'s documents', async () => {
    expect(await asA(() => Widget.countDocuments())).toBe(2);
    expect(await asB(() => Widget.countDocuments())).toBe(1);
  });

  it('distinct() does not leak another tenant\'s values', async () => {
    const cities = await asA(() => Widget.distinct('city'));
    expect(cities).toEqual(['Gurugram']);
    expect(cities).not.toContain('Bathinda');
  });

  it('a top-level $or cannot widen the scope', async () => {
    // $or sits beside tenantId, so AND semantics still apply. This is the
    // failure mode that made the listing search leak before tenancy existed.
    const found = await asA(() =>
      Widget.find({ $or: [{ name: 'A-one' }, { name: 'B-one' }] })
    );
    expect(found.map((d) => d.name)).toEqual(['A-one']);
  });

  it('aggregate() is scoped at the front of the pipeline', async () => {
    const rows = await asA(() =>
      Widget.aggregate([{ $group: { _id: null, total: { $sum: '$price' } } }])
    );
    expect(rows[0].total).toBe(300); // 100 + 200, not B's 300 as well
  });

  it('refuses a query that names a different tenant', async () => {
    await expect(asA(() => Widget.find({ tenantId: TENANT_B }))).rejects.toThrow(TenantScopeError);
  });

  it('allows a query that redundantly names its own tenant', async () => {
    const found = await asA(() => Widget.find({ tenantId: TENANT_A }));
    expect(found).toHaveLength(2);
  });
});

describe('updates and deletes cannot reach across', () => {
  beforeEach(seedBothTenants);

  it('updateMany() leaves the other tenant untouched', async () => {
    await asA(() => Widget.updateMany({}, { $set: { price: 0 } }));
    const b = await mongoose.connection.collection('widgets').findOne({ name: 'B-one' });
    expect(b.price).toBe(300);
  });

  it('deleteMany({}) does not empty the collection for everyone', async () => {
    // The nightmare case: a maintenance script deleting "all" records.
    await asA(() => Widget.deleteMany({}));
    const left = await mongoose.connection.collection('widgets').find({}).toArray();
    expect(left).toHaveLength(1);
    expect(left[0].name).toBe('B-one');
  });

  it('findOneAndUpdate() cannot edit another tenant\'s document', async () => {
    const updated = await asA(() =>
      Widget.findOneAndUpdate({ name: 'B-one' }, { $set: { price: 1 } }, { new: true })
    );
    expect(updated).toBeNull();
    const b = await mongoose.connection.collection('widgets').findOne({ name: 'B-one' });
    expect(b.price).toBe(300);
  });

  it('bulkWrite() scopes every operation', async () => {
    // bulkWrite fires no query middleware, so it is scoped by hand in the
    // plugin. It is also the fastest write path in the app — bulk import uses
    // it — which makes an unscoped bulkWrite the widest possible hole.
    await asA(() =>
      Widget.bulkWrite([
        { updateOne: { filter: { name: 'B-one' }, update: { $set: { price: 1 } } } },
        { deleteOne: { filter: { name: 'B-one' } } },
        { insertOne: { document: { name: 'A-three' } } },
      ])
    );
    const b = await mongoose.connection.collection('widgets').findOne({ name: 'B-one' });
    expect(b).not.toBeNull();
    expect(b.price).toBe(300);

    const inserted = await mongoose.connection.collection('widgets').findOne({ name: 'A-three' });
    expect(String(inserted.tenantId)).toBe(String(TENANT_A));
  });
});

describe('operations that cannot be scoped are refused, not guessed', () => {
  it('estimatedDocumentCount() throws rather than counting every tenant', async () => {
    await expect(asA(async () => Widget.estimatedDocumentCount())).rejects.toThrow(
      /countDocuments/
    );
  });
});

describe('running without a tenant context', () => {
  beforeEach(seedBothTenants);

  it('throws rather than silently running unscoped', async () => {
    // The single most important case: forgetting the context must be loud.
    // Returning every tenant's rows here is how a shared-database product
    // leaks, and it would look like a working query in development.
    await expect(Widget.find()).rejects.toThrow(TenantScopeError);
  });

  it('names the model in the error, so the offending query is findable', async () => {
    await expect(Widget.find()).rejects.toThrow(/Widget/);
  });

  it('runWithoutTenantScope() allows a deliberate cross-tenant read', async () => {
    const all = await runWithoutTenantScope('platform-wide usage report', () => Widget.find());
    expect(all).toHaveLength(3);
  });

  it('runWithoutTenantScope() demands a stated reason', () => {
    expect(() => runWithoutTenantScope(null, () => {})).toThrow(/reason/);
  });

  it('.setOptions({ tenantScope: false }) is the per-query escape hatch', async () => {
    const all = await asA(() => Widget.find().setOptions({ tenantScope: false }));
    expect(all).toHaveLength(3);
  });
});

describe('context isolation between concurrent requests', () => {
  beforeEach(seedBothTenants);

  it('two tenants querying at the same time do not see each other', async () => {
    // AsyncLocalStorage rather than a module-level variable is what makes this
    // hold. With a shared mutable "current tenant", interleaved awaits would
    // let one request read under the other's tenant.
    const [a, b] = await Promise.all([
      asA(async () => {
        await new Promise((r) => setTimeout(r, 20));
        return Widget.find();
      }),
      asB(async () => {
        await new Promise((r) => setTimeout(r, 5));
        return Widget.find();
      }),
    ]);
    expect(a.map((d) => d.name).sort()).toEqual(['A-one', 'A-two']);
    expect(b.map((d) => d.name)).toEqual(['B-one']);
  });

  it('the context survives an await chain', async () => {
    const seen = await asA(async () => {
      await new Promise((r) => setImmediate(r));
      await Widget.countDocuments();
      return getTenantId();
    });
    expect(seen).toBe(String(TENANT_A));
  });

  it('a nested bypass does not leak back out to the caller', async () => {
    const after = await asA(async () => {
      await runWithoutTenantScope('a report', () => Widget.find());
      return Widget.find();
    });
    expect(after).toHaveLength(2);
  });
});

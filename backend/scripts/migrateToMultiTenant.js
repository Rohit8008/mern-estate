/**
 * One-time migration from single-tenant to shared-database multi-tenancy.
 *
 *   node scripts/migrateToMultiTenant.js [--dry-run] [--slug default] [--name "Acme Realty"]
 *
 * What it does, in order:
 *   1. creates (or reuses) the default tenant that existing data belongs to
 *   2. stamps `tenantId` onto every document that has none
 *   3. drops the old GLOBAL unique indexes and builds the tenant-scoped ones
 *
 * Step 3 is the one that bites if skipped. Mongoose never drops an index it no
 * longer declares, so `email_1` would survive as a global unique constraint and
 * the second agency to onboard a user with an existing email address would get
 * a duplicate-key error nobody could explain from reading the schema. This repo
 * has already been bitten by exactly that with the old `phone_1` index.
 *
 * Safe to run more than once: every step checks before it writes.
 */

import mongoose from 'mongoose';
import { config, validateConfig } from '../config/environment.js';
import { registerTenancy } from '../tenancy/tenantPlugin.js';
import { runWithoutTenantScope } from '../tenancy/tenantContext.js';

registerTenancy(mongoose);

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const argValue = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const SLUG = argValue('--slug', process.env.DEFAULT_TENANT_SLUG || 'default');
const NAME = argValue('--name', 'Default Workspace');

/**
 * Every collection the tenant plugin scopes. Kept as an explicit list rather
 * than "all models", so adding a model is a deliberate decision about whether
 * its existing rows belong to the default tenant.
 */
const SCOPED_MODELS = [
  'ActivityLog', 'BuyerRequirement', 'Category', 'Client', 'Document',
  'GeneratedReport', 'Listing', 'Message', 'Owner', 'PropertyType',
  'ReportTemplate', 'Role', 'SavedSearch', 'SearchLog', 'SecurityLog',
  'Subscriber', 'Task', 'Transaction', 'User',
];

/**
 * Indexes that were globally unique before tenancy and must go, so the
 * tenant-scoped replacements declared on each schema can take over.
 */
const OBSOLETE_INDEXES = {
  users: ['email_1', 'username_1', 'phone_1', 'phone_unique_string'],
  categories: ['slug_1', 'name_1'],
  propertytypes: ['slug_1', 'name_1'],
  roles: ['name_1'],
  subscribers: ['email_1'],
  owners: ['email_1'],
};

/**
 * The unique indexes a model DECLARES, read off the schema rather than listed
 * here, so adding a constraint cannot drift out of step with this check.
 */
function uniqueIndexSpecs(Model) {
  return (Model.schema.indexes() || [])
    .filter(([, opts]) => opts && opts.unique)
    .map(([keys, opts]) => ({
      fields: Object.keys(keys),
      partial: opts.partialFilterExpression || null,
      name: opts.name || Object.keys(keys).join('_'),
    }));
}

/**
 * Rows that would break a unique index BEFORE it is built.
 *
 * This is the check that makes step 3 safe to start. Dropping the old global
 * index first and discovering the duplicate afterwards leaves the collection
 * with no uniqueness constraint at all — the old one gone, the new one refused
 * — and that state is invisible until two records collide in production.
 *
 * Raw driver on purpose: the plugin would scope the aggregation to one tenant,
 * and a conflict in any workspace blocks the build for all of them.
 */
async function findUniqueConflicts(db, coll, spec) {
  const groupId = spec.fields.reduce((acc, f) => ({ ...acc, [f.replace(/\./g, '_')]: `$${f}` }), {});
  const pipeline = [];
  if (spec.partial && Object.keys(spec.partial).length) pipeline.push({ $match: spec.partial });
  pipeline.push(
    { $group: { _id: groupId, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
    { $limit: 10 }
  );
  return db.collection(coll).aggregate(pipeline).toArray();
}

const log = (...a) => console.log(...a);
const step = (n, msg) => log(`\n${'─'.repeat(64)}\n${n}. ${msg}\n${'─'.repeat(64)}`);

async function main() {
  validateConfig();
  await mongoose.connect(config.database.uri);
  log(`Connected to ${mongoose.connection.name}${DRY_RUN ? '   [DRY RUN — nothing will be written]' : ''}`);

  // Importing models registers them on the connection. They must be imported
  // AFTER registerTenancy() above, or they compile without the plugin.
  await import('../models/tenant.model.js');
  for (const file of [
    'activityLog', 'buyerRequirement', 'category', 'client', 'document',
    'generatedReport', 'listing', 'message', 'owner', 'propertyType',
    'reportTemplate', 'role', 'savedSearch', 'searchLog', 'securityLog',
    'subscriber', 'task', 'transaction', 'user',
  ]) {
    await import(`../models/${file}.model.js`);
  }

  const Tenant = mongoose.model('Tenant');
  const db = mongoose.connection.db;

  // ── 1. the default tenant ─────────────────────────────────────────────────
  step(1, 'Default tenant');
  let tenant = await Tenant.findOne({ slug: SLUG });
  if (tenant) {
    log(`   Already exists: ${tenant.name} (${tenant.slug})  _id=${tenant._id}`);
  } else if (DRY_RUN) {
    log(`   Would create tenant "${NAME}" with slug "${SLUG}"`);
    tenant = { _id: new mongoose.Types.ObjectId(), slug: SLUG, name: NAME };
  } else {
    tenant = await Tenant.create({
      name: NAME,
      slug: SLUG,
      status: 'active',
      plan: 'enterprise', // the existing deployment keeps everything it had
      features: new Map(),
      branding: { productName: NAME },
    });
    log(`   Created: ${tenant.name} (${tenant.slug})  _id=${tenant._id}`);
  }

  // ── 2. backfill tenantId ──────────────────────────────────────────────────
  step(2, 'Stamping tenantId onto existing documents');
  let totalStamped = 0;
  const collections = new Set((await db.listCollections().toArray()).map((c) => c.name));

  for (const modelName of SCOPED_MODELS) {
    let Model;
    try {
      Model = mongoose.model(modelName);
    } catch (_) {
      log(`   ${modelName.padEnd(20)} model not registered — skipped`);
      continue;
    }
    const coll = Model.collection.collectionName;
    if (!collections.has(coll)) {
      log(`   ${modelName.padEnd(20)} collection absent — skipped`);
      continue;
    }

    // Raw driver, not the model: the plugin would otherwise inject a tenantId
    // filter and find nothing, since these are the documents that have none.
    const missing = await db.collection(coll).countDocuments({ tenantId: { $exists: false } });
    if (missing === 0) {
      log(`   ${modelName.padEnd(20)} already stamped`);
      continue;
    }

    if (DRY_RUN) {
      log(`   ${modelName.padEnd(20)} would stamp ${missing.toLocaleString()} document(s)`);
      continue;
    }

    const result = await db
      .collection(coll)
      .updateMany({ tenantId: { $exists: false } }, { $set: { tenantId: tenant._id } });
    totalStamped += result.modifiedCount;
    log(`   ${modelName.padEnd(20)} stamped ${result.modifiedCount.toLocaleString()} document(s)`);
  }
  log(`   ── ${totalStamped.toLocaleString()} document(s) stamped in total`);

  // ── 3. indexes ────────────────────────────────────────────────────────────
  step(3, 'Replacing global unique indexes with tenant-scoped ones');

  // Pre-flight. Nothing is dropped until every tenant-scoped unique index is
  // known to be buildable. `owners.email` is the one to watch: it was a plain
  // non-unique index before tenancy, so existing data was never validated
  // against the constraint it is about to acquire.
  log('   Checking existing data against the new constraints…');
  const conflicts = [];
  for (const modelName of SCOPED_MODELS) {
    let Model;
    try {
      Model = mongoose.model(modelName);
    } catch (_) {
      continue;
    }
    const coll = Model.collection.collectionName;
    if (!collections.has(coll)) continue;

    for (const spec of uniqueIndexSpecs(Model)) {
      const dupes = await findUniqueConflicts(db, coll, spec);
      if (!dupes.length) continue;
      conflicts.push({ modelName, coll, spec, dupes });
      log(`   ${modelName.padEnd(20)} ${dupes.length}+ duplicate(s) on {${spec.fields.join(', ')}}`);
      for (const d of dupes.slice(0, 5)) {
        log(`      ${JSON.stringify(d._id)}  ×${d.n}`);
      }
    }
  }

  if (conflicts.length) {
    log('\n   REFUSING TO PROCEED. Nothing has been dropped and nothing is broken.');
    log('   Each group above is rows that are legal today but would violate the new');
    log('   per-tenant unique index. Merge or delete the duplicates, then re-run.');
    log('   (Stamping tenantId in step 2 is idempotent, so re-running is safe.)');
    await mongoose.disconnect();
    process.exit(1);
  }
  log('   No conflicts — safe to swap the indexes.');

  for (const [coll, obsolete] of Object.entries(OBSOLETE_INDEXES)) {
    if (!collections.has(coll)) continue;
    const existing = await db.collection(coll).indexes();
    const names = new Set(existing.map((i) => i.name));
    for (const name of obsolete) {
      if (!names.has(name)) continue;
      if (DRY_RUN) {
        log(`   ${coll}: would drop obsolete global index ${name}`);
        continue;
      }
      await db.collection(coll).dropIndex(name);
      log(`   ${coll}: dropped ${name}`);
    }
  }

  const syncFailures = [];
  if (!DRY_RUN) {
    log('\n   Building the new indexes (this can take a while on a large collection)…');
    for (const modelName of SCOPED_MODELS) {
      try {
        const Model = mongoose.model(modelName);
        await runWithoutTenantScope('building indexes during migration', () => Model.syncIndexes());
        log(`   ${modelName.padEnd(20)} indexes synced`);
      } catch (err) {
        syncFailures.push({ modelName, message: err.message });
        log(`   ${modelName.padEnd(20)} INDEX SYNC FAILED: ${err.message}`);
      }
    }
  }

  // A collection whose old global index was dropped and whose new one failed to
  // build now has NO uniqueness constraint. Reporting "Done" and exiting 0 here
  // is how that goes unnoticed until two records collide.
  if (syncFailures.length) {
    log('\n' + '─'.repeat(64));
    log('MIGRATION INCOMPLETE — these collections have no uniqueness constraint:');
    for (const f of syncFailures) log(`   ${f.modelName.padEnd(20)} ${f.message}`);
    log('Resolve the cause and RE-RUN before letting the app serve traffic.');
    log('─'.repeat(64));
    await mongoose.disconnect();
    process.exit(1);
  }

  // ── summary ───────────────────────────────────────────────────────────────
  step(4, 'Done');
  if (DRY_RUN) {
    log('   Dry run — nothing was written. Re-run without --dry-run to apply.');
  } else {
    log(`   Existing data now belongs to tenant "${tenant.slug}" (${tenant._id}).`);
    log('   Set DEFAULT_TENANT_SLUG in backend/.env if you used a slug other than "default",');
    log('   so requests with no subdomain and no token still resolve to this workspace.');
    log('   Everyone must sign in again: existing tokens carry no tenant claim.');
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('\nMigration failed:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

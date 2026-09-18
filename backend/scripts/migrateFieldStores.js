/**
 * Collapse the parallel dynamic-field stores on Listing.
 *
 *   node scripts/migrateFieldStores.js [--dry-run]
 *
 * A listing could hold the same value in three places:
 *   • `attributes`          — the Category system, which the UI reads
 *   • `propertyTypeFields`  — the PropertyType system, which nothing displays
 *   • a native column       — sqYard, propertyNo, plotSize, …
 *
 * Nothing reconciled them, so a value written to `propertyTypeFields` was
 * invisible: not on the form, not in filters, not in search. This moves
 * everything to the two stores that are actually read and retires the third.
 *
 * Where each value goes is decided by NATIVE_FIELD_ALIASES — the same rule the
 * listing form and the importer follow. An aliased key belongs in its typed,
 * indexed column (so it can be filtered and sorted); anything else belongs in
 * `attributes`.
 *
 * Idempotent: a second run finds nothing to move.
 */

import mongoose from 'mongoose';
import { config, validateConfig } from '../config/environment.js';
import { registerTenancy } from '../tenancy/tenantPlugin.js';

registerTenancy(mongoose);

const { NATIVE_FIELD_ALIASES } = await import('../utils/importMapping.js');

const DRY_RUN = process.argv.includes('--dry-run');

/** Native columns typed as numbers; everything else aliased is a string. */
const NUMERIC_NATIVE = new Set(['sqYard', 'sqYardRate', 'totalValue', 'areaSqFt']);

const log = (...a) => console.log(...a);
const rule = (n, msg) => log(`\n${'─'.repeat(64)}\n${n}. ${msg}\n${'─'.repeat(64)}`);

function isEmptyNative(value) {
  return value === undefined || value === null || value === '' || value === 0;
}

async function main() {
  validateConfig();
  await mongoose.connect(config.database.uri);
  log(`Connected to ${mongoose.connection.name}${DRY_RUN ? '   [DRY RUN — nothing will be written]' : ''}`);

  const listings = mongoose.connection.db.collection('listings');

  rule(1, 'Moving propertyTypeFields into attributes and native columns');

  // The full document, deliberately: the "don't overwrite a native column that
  // already has a value" check below reads those columns, and a projection that
  // omitted them would make every column look empty and clobber real data.
  const docs = await listings
    .find({ propertyTypeFields: { $exists: true, $ne: {} } })
    .toArray();

  log(`   ${docs.length} listing(s) still carry propertyTypeFields`);

  let moved = 0;
  let skipped = 0;
  // Where the two stores disagreed. Reported rather than silently resolved:
  // a value the UI has been showing and a value nobody could see are not the
  // same claim, and only someone who knows the property can say which is right.
  const conflicts = [];

  for (const doc of docs) {
    const source = doc.propertyTypeFields || {};
    const set = {};
    const intoAttributes = { ...(doc.attributes || {}) };
    const notes = [];

    for (const [key, value] of Object.entries(source)) {
      if (value === undefined || value === null || value === '') continue;

      const nativeKey = NATIVE_FIELD_ALIASES[key] || (key in NATIVE_FIELD_ALIASES ? key : null);
      const asNative = nativeKey || (Object.values(NATIVE_FIELD_ALIASES).includes(key) ? key : null);

      if (asNative) {
        // Never overwrite a native column that already holds something — the
        // column is what the UI has been showing, so it is the value the user
        // believes is correct.
        if (!isEmptyNative(doc[asNative])) {
          if (String(doc[asNative]) !== String(value)) {
            conflicts.push({
              id: String(doc._id),
              name: doc.name,
              field: asNative,
              kept: doc[asNative],
              discarded: value,
            });
          }
          notes.push(`${key}: native ${asNative} already set, dropped`);
          continue;
        }
        set[asNative] = NUMERIC_NATIVE.has(asNative) ? Number(value) || 0 : String(value);
        notes.push(`${key} → ${asNative}`);
        continue;
      }

      if (intoAttributes[key] === undefined) {
        intoAttributes[key] = value;
        notes.push(`${key} → attributes`);
      } else {
        notes.push(`${key}: attributes already set, dropped`);
      }
    }

    if (Object.keys(intoAttributes).length) set.attributes = intoAttributes;

    log(`   ${String(doc.name || doc._id).slice(0, 40).padEnd(42)} ${notes.join(', ') || '(nothing to move)'}`);

    if (DRY_RUN) {
      moved += 1;
      continue;
    }

    const update = { $unset: { propertyTypeFields: '' } };
    if (Object.keys(set).length) update.$set = set;
    const res = await listings.updateOne({ _id: doc._id }, update);
    if (res.modifiedCount) moved += 1;
    else skipped += 1;
  }

  rule(2, 'Clearing empty propertyTypeFields maps');
  const emptyCount = await listings.countDocuments({ propertyTypeFields: { $exists: true } });
  if (DRY_RUN) {
    log(`   would unset propertyTypeFields on ${emptyCount} listing(s)`);
  } else {
    const res = await listings.updateMany(
      { propertyTypeFields: { $exists: true } },
      { $unset: { propertyTypeFields: '' } }
    );
    log(`   unset on ${res.modifiedCount} listing(s)`);
  }

  if (conflicts.length) {
    rule(3, 'Conflicts — the two stores disagreed');
    log('   The native column was kept, because that is the value the UI has been');
    log('   showing and therefore the one people have been working from. Check these');
    log('   against the actual property; the hidden value may be the correct one.\n');
    conflicts.forEach((c) => {
      log(`   ${String(c.name).slice(0, 40).padEnd(42)} ${c.field}: kept ${c.kept}, discarded ${c.discarded}`);
      log(`   ${' '.repeat(42)} /update-listing/${c.id}`);
    });
  }

  rule(conflicts.length ? 4 : 3, 'Result');
  const remaining = await listings.countDocuments({ propertyTypeFields: { $exists: true } });
  log(`   moved            ${moved}`);
  if (skipped) log(`   unchanged        ${skipped}`);
  log(`   still carrying it ${remaining}`);
  if (!DRY_RUN && remaining === 0) {
    log('\n   propertyTypeFields is now unused. The schema keeps it marked deprecated');
    log('   so an old client sending it does not error; nothing reads it.');
  }
  if (DRY_RUN) log('\n   Dry run — nothing was written. Re-run without --dry-run to apply.');

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('\nMigration failed:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

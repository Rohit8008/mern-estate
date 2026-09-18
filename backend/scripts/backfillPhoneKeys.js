/**
 * ONE-TIME: populate Client.phoneKey on records written before it existed.
 *
 * Duplicate detection now matches on a derived, indexed `phoneKey` rather than
 * a suffix regex — the regex could not use an index, so on a 5,000-row portal
 * import it was 5,000 collection scans in one query.
 *
 * The field is maintained by a pre-save hook, which only fires on save. Without
 * this backfill every record written before the change has an empty key and is
 * invisible to the duplicate check, so importing a portal export would happily
 * re-create leads the agency already has.
 *
 * Safe to run more than once: it only touches records whose stored key does not
 * match what their phone number derives to.
 *
 *   npm run db:backfill-phone-keys              # every workspace
 *   npm run db:backfill-phone-keys -- --dry-run
 */

import mongoose from 'mongoose';
import { config } from '../config/environment.js';
import { registerTenancy } from '../tenancy/tenantPlugin.js';

// Tenancy is a global Mongoose plugin and only applies to schemas compiled
// AFTER it registers, so this must run before any model is imported.
registerTenancy(mongoose);

const { forEachTenant } = await import('../tenancy/tenantContext.js');
const { default: Client, phoneKeyOf } = await import('../models/client.model.js');

const dryRun = process.argv.includes('--dry-run');

async function backfillWorkspace() {
  // Only what needs looking at: a record with a phone but no key, or a key that
  // disagrees with the phone it came from.
  const clients = await Client.find({ phone: { $nin: [null, ''] } })
    .select('phone phoneKey')
    .lean();

  let changed = 0;

  for (const client of clients) {
    const expected = phoneKeyOf(client.phone);
    if (client.phoneKey === expected) continue;

    changed += 1;
    if (!dryRun) {
      await Client.updateOne({ _id: client._id }, { $set: { phoneKey: expected } });
    }
  }

  return { scanned: clients.length, changed };
}

(async () => {
  await mongoose.connect(config.database.uri);
  console.log(`Connected to ${mongoose.connection.name}\n`);

  console.log(dryRun ? 'Dry run — nothing will be written.\n' : 'Backfilling phone keys.\n');

  const { results, failures } = await forEachTenant(
    () => backfillWorkspace(),
    { serviceableOnly: false } // a suspended workspace still needs correct data
  );

  let scanned = 0;
  let changed = 0;

  for (const { slug, value } of results) {
    scanned += value.scanned;
    changed += value.changed;
    if (value.changed) console.log(`  ${slug}: ${value.changed} of ${value.scanned} updated`);
  }

  console.log(`\n${changed} of ${scanned} client records ${dryRun ? 'would be' : 'were'} updated.`);

  if (failures.length) {
    console.error('\nFailed workspaces:');
    failures.forEach((f) => console.error(`  ${f.slug}: ${f.error}`));
  }

  await mongoose.disconnect();
  process.exit(failures.length ? 1 : 0);
})().catch((err) => {
  console.error('Backfill failed:', err.message);
  process.exit(1);
});

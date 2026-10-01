/**
 * Create the indexes declared in the schemas, on demand.
 *
 *   npm run db:sync-indexes -- --dry-run     # show what would be created
 *   npm run db:sync-indexes                  # create the missing ones
 *   npm run db:sync-indexes -- --all         # every model, not just the hot ones
 *
 * Why this exists: Mongoose builds indexes on first connect (`autoIndex`), which
 * on a large collection means a deploy that starts building a multi-gigabyte
 * index while serving traffic. Running this ahead of the release builds them
 * deliberately; the app's own start-up then finds them already there and does
 * nothing.
 *
 * This is ADDITIVE ONLY. It never drops an index — Mongoose does not either,
 * and removing an index a query still depends on is a staged migration, not a
 * side effect of a sync. Indexes the schemas no longer declare are only
 * reported. Indexes are collection-level, so no --workspace is needed.
 */

import { models as bootModels, mongoose } from './_bootstrap.js';
import { config, validateConfig } from '../config/environment.js';

const dryRun = process.argv.includes('--dry-run');
const all = process.argv.includes('--all');

// Imported after _bootstrap, which registers the tenancy plugin first.
const Message = (await import('../models/message.model.js')).default;

/** The collections whose indexes back the hot list / search / inbox paths. */
const HOT = {
  Listing: bootModels.Listing,
  Client: bootModels.Client,
  Owner: bootModels.Owner,
  Task: bootModels.Task,
  Message,
  BuyerRequirement: bootModels.BuyerRequirement,
};

async function main() {
  validateConfig();
  // Without this, Mongoose would build every declared index the moment it
  // connects — before the diff below is taken — and a dry run would report
  // "nothing to create" after having created them.
  mongoose.set('autoIndex', false);
  await mongoose.connect(config.database.uri);
  console.log(`Database: ${mongoose.connection.name}${dryRun ? '  (dry run)' : ''}\n`);

  const targets = all
    ? Object.fromEntries(mongoose.modelNames().map((n) => [n, mongoose.model(n)]))
    : HOT;

  let created = 0;
  for (const [name, Model] of Object.entries(targets)) {
    let toCreate = [];
    let toDrop = [];
    try {
      const diff = await Model.diffIndexes();
      toCreate = diff.toCreate || [];
      toDrop = diff.toDrop || [];
    } catch (e) {
      // Collection does not exist yet: everything declared is "to create".
      if (e.codeName !== 'NamespaceNotFound' && e.code !== 26) throw e;
      toCreate = Model.schema.indexes().map(([spec]) => spec);
    }

    // Text indexes are skipped: the driver reports them as missing even when
    // present (the server names and weights them), and a second text index on a
    // collection is an error. They are built by the app's own start-up.
    toCreate = toCreate.filter((spec) => !Object.values(spec).includes('text'));

    console.log(`${name}: ${toCreate.length} to create` + (toDrop.length ? `, ${toDrop.length} not in schema (left alone)` : ''));
    toCreate.forEach((spec) => console.log(`  + ${JSON.stringify(spec)}`));
    toDrop.forEach((n) => console.log(`  ? ${n}  (not declared; NOT dropped)`));

    if (!dryRun && toCreate.length) {
      // One at a time, so a conflict on one index (e.g. a legacy text index that
      // already exists under another name) is reported without stopping the rest.
      const wanted = new Set(toCreate.map((spec) => JSON.stringify(spec)));
      for (const [spec, options] of Model.schema.indexes()) {
        if (!wanted.has(JSON.stringify(spec))) continue;
        try {
          await Model.collection.createIndex(spec, { background: true, ...options });
          created += 1;
        } catch (e) {
          console.log(`  ! could not create ${JSON.stringify(spec)}: ${e.message}`);
        }
      }
    }
  }

  console.log(dryRun ? '\nDry run: nothing changed.' : `\nDone. ${created} index(es) created.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());

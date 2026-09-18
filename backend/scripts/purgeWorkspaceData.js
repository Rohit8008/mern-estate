/**
 * Empty a workspace, keeping the people who can sign in.
 *
 *   node scripts/purgeWorkspaceData.js --workspace default --confirm
 *   node scripts/purgeWorkspaceData.js --workspace default --dry-run
 *
 * Removes the working data — properties, owners, clients, tasks, buyer
 * requirements, documents, transactions, messages, reports and the various
 * logs — and keeps what makes the workspace usable afterwards: the tenant
 * itself, its admin accounts, and its roles.
 *
 * ── Two safeguards, both deliberate ─────────────────────────────────────────
 *   • A JSON backup of everything it is about to delete is written FIRST, and
 *     the purge is abandoned if that write fails. "Clear it out" and "I can
 *     never get it back" are different requests, and only one of them was made.
 *   • `--confirm` is required. A script that empties a database on a bare
 *     invocation is one tab-completion away from an accident.
 *
 * Non-admin users are removed by default; `--keep-users` keeps everyone. Roles
 * are always kept — deleting them would leave surviving accounts pointing at
 * permissions that no longer exist.
 */

import fs from 'fs';
import path from 'path';
import { bootstrapScript, models } from './_bootstrap.js';

const args = process.argv;
const has = (flag) => args.includes(flag);
const DRY_RUN = has('--dry-run');
const CONFIRMED = has('--confirm');
const KEEP_USERS = has('--keep-users');

/**
 * What gets emptied. Roles and the tenant are absent on purpose; users are
 * handled separately because admins survive.
 */
const PURGE = [
  'Listing', 'Owner', 'Client', 'Task', 'BuyerRequirement',
  'Category', 'PropertyType',
];

/** Collections with no model in the bootstrap, cleared through the driver. */
const RAW_COLLECTIONS = [
  'documents', 'transactions', 'messages', 'activitylogs', 'searchlogs',
  'securitylogs', 'savedsearches', 'generatedreports', 'reporttemplates',
  'subscribers',
];

const log = (...a) => console.log(...a);
const rule = (n, msg) => log(`\n${'─'.repeat(66)}\n${n}. ${msg}\n${'─'.repeat(66)}`);

async function main() {
  const { tenant, inWorkspace, close } = await bootstrapScript();
  const tenantId = tenant._id;

  log(DRY_RUN ? '[DRY RUN — nothing will be deleted]\n' : '');

  // ── 1. what is actually there ─────────────────────────────────────────────
  rule(1, `What "${tenant.name}" holds today`);

  const inventory = {};
  await inWorkspace(async () => {
    for (const name of PURGE) {
      inventory[name] = await models[name].countDocuments();
    }
    inventory.User = await models.User.countDocuments();
    inventory.UserAdmins = await models.User.countDocuments({ role: 'admin' });
    inventory.Role = await models.Role.countDocuments();
  });

  const db = (await import('mongoose')).default.connection.db;
  const existing = new Set((await db.listCollections().toArray()).map((c) => c.name));
  for (const coll of RAW_COLLECTIONS) {
    inventory[coll] = existing.has(coll)
      ? await db.collection(coll).countDocuments({ tenantId })
      : 0;
  }

  Object.entries(inventory)
    .filter(([k]) => !['UserAdmins'].includes(k))
    .forEach(([k, v]) => v && log(`   ${k.padEnd(22)} ${v}`));
  log(`\n   Keeping: the workspace, ${inventory.UserAdmins} admin account(s), ${inventory.Role} role(s)`);
  if (!KEEP_USERS && inventory.User > inventory.UserAdmins) {
    log(`   Removing: ${inventory.User - inventory.UserAdmins} non-admin user(s) — pass --keep-users to keep them`);
  }

  // ── 2. backup, before anything is touched ─────────────────────────────────
  rule(2, 'Backup');

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = path.join(process.cwd(), 'backups', `${tenant.slug}-${stamp}`);

  if (DRY_RUN) {
    log(`   Would write a JSON backup to ${dir}`);
  } else {
    try {
      fs.mkdirSync(dir, { recursive: true });

      await inWorkspace(async () => {
        for (const name of [...PURGE, 'User', 'Role']) {
          const docs = await models[name].find().lean();
          if (!docs.length) continue;
          fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(docs, null, 2));
          log(`   ${name.padEnd(22)} ${String(docs.length).padStart(5)} saved`);
        }
      });

      for (const coll of RAW_COLLECTIONS) {
        if (!existing.has(coll)) continue;
        const docs = await db.collection(coll).find({ tenantId }).toArray();
        if (!docs.length) continue;
        fs.writeFileSync(path.join(dir, `${coll}.json`), JSON.stringify(docs, null, 2));
        log(`   ${coll.padEnd(22)} ${String(docs.length).padStart(5)} saved`);
      }

      fs.writeFileSync(
        path.join(dir, '_meta.json'),
        JSON.stringify({ tenant: { id: String(tenantId), slug: tenant.slug, name: tenant.name }, takenAt: new Date(), inventory }, null, 2)
      );
      log(`\n   Backup written to ${dir}`);
    } catch (err) {
      // Refusing to continue is the point: without the backup this stops being
      // reversible, and that was not what was asked for.
      log(`\n   BACKUP FAILED: ${err.message}`);
      log('   Nothing has been deleted. Fix the backup location and run again.');
      await close();
      process.exitCode = 1;
      return;
    }
  }

  // ── 3. the purge ──────────────────────────────────────────────────────────
  rule(3, 'Deleting');

  if (!CONFIRMED && !DRY_RUN) {
    log('   Refusing to delete without --confirm.');
    log(`\n   node scripts/purgeWorkspaceData.js --workspace ${tenant.slug} --confirm`);
    await close();
    return;
  }

  if (DRY_RUN) {
    log('   Dry run — nothing deleted. Re-run with --confirm to apply.');
    await close();
    return;
  }

  let total = 0;
  await inWorkspace(async () => {
    for (const name of PURGE) {
      const { deletedCount } = await models[name].deleteMany({});
      if (deletedCount) log(`   ${name.padEnd(22)} ${String(deletedCount).padStart(5)} deleted`);
      total += deletedCount;
    }

    if (!KEEP_USERS) {
      const { deletedCount } = await models.User.deleteMany({ role: { $ne: 'admin' } });
      if (deletedCount) log(`   ${'User (non-admin)'.padEnd(22)} ${String(deletedCount).padStart(5)} deleted`);
      total += deletedCount;
    }
  });

  for (const coll of RAW_COLLECTIONS) {
    if (!existing.has(coll)) continue;
    const { deletedCount } = await db.collection(coll).deleteMany({ tenantId });
    if (deletedCount) log(`   ${coll.padEnd(22)} ${String(deletedCount).padStart(5)} deleted`);
    total += deletedCount;
  }

  // ── 4. what is left ───────────────────────────────────────────────────────
  rule(4, 'Done');
  await inWorkspace(async () => {
    const admins = await models.User.find({ role: 'admin' }).select('email username').lean();
    log(`   ${total} document(s) deleted.\n`);
    log(`   "${tenant.name}" now holds:`);
    log(`     ${admins.length} admin account(s): ${admins.map((a) => a.email).join(', ')}`);
    log(`     ${await models.Role.countDocuments()} role(s)`);
    log(`     ${await models.Listing.countDocuments()} properties`);
  });
  log(`\n   Backup: ${dir}`);

  await close();
}

main().catch(async (err) => {
  console.error('\nPurge failed:', err.message);
  process.exit(1);
});

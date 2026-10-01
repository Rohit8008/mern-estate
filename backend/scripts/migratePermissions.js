/**
 * ONE-TIME (safe to re-run): give existing roles the permissions that are now
 * ENFORCED, so employees who work today keep working.
 *
 *   node scripts/migratePermissions.js --workspace acme --dry-run
 *   node scripts/migratePermissions.js --all
 *
 * Each rule in utils/permissionBackfill.js adds a key to roles that already
 * hold its closest related permission. It only ever ADDS: a permission an admin
 * ticked is never cleared, and a second run changes nothing.
 */

import { bootstrapScript, models, mongoose } from './_bootstrap.js';
import { planGrants, NOT_ENFORCED } from '../utils/permissionBackfill.js';
import { PERMISSION_KEYS } from '../utils/permissionCatalogue.js';

const DRY_RUN = process.argv.includes('--dry-run');
const ALL = process.argv.includes('--all');

async function migrateWorkspace(label, inWorkspace) {
  return inWorkspace(async () => {
    const roles = await models.Role.find({ isDeleted: { $ne: true } }).lean();
    const rows = [];
    for (const role of roles) {
      const stored = role.permissions || {};
      const { grants } = planGrants(stored);
      if (!grants.length) continue;
      rows.push({ role: role.name, grants });
      if (!DRY_RUN) {
        const $set = {};
        for (const g of grants) $set[`permissions.${g.key}`] = true;
        await models.Role.updateOne({ _id: role._id }, { $set });
      }
    }
    console.log(`\n${label}: ${roles.length} role(s), ${rows.length} ${DRY_RUN ? 'would change' : 'changed'}`);
    for (const r of rows) {
      console.log(`  ${r.role}`);
      for (const g of r.grants) console.log(`     + ${g.key.padEnd(24)} because it ${g.why}`);
    }
    return rows.length;
  });
}

async function main() {
  console.log(DRY_RUN ? 'DRY RUN - nothing will be written.' : 'Applying.');
  if (ALL) {
    const { validateConfig, config } = await import('../config/environment.js');
    const { runWithTenant, runWithoutTenantScope } = await import('../tenancy/tenantContext.js');
    validateConfig();
    await mongoose.connect(config.database.uri);
    const tenants = await runWithoutTenantScope('migrating roles in every workspace', () =>
      models.Tenant.find({ isDeleted: { $ne: true } }).select('slug name').lean()
    );
    for (const t of tenants) {
      await migrateWorkspace(`${t.name} (${t.slug})`, (fn) => runWithTenant({ tenantId: String(t._id), tenant: t }, fn));
    }
    await mongoose.disconnect();
  } else {
    const { inWorkspace, close, tenant } = await bootstrapScript();
    await migrateWorkspace(`${tenant.name} (${tenant.slug})`, inWorkspace);
    await close();
  }

  console.log('\nNot granted (nothing enforces them yet):');
  for (const [k, why] of Object.entries(NOT_ENFORCED)) console.log(`  ${k}: ${why}`);
  console.log(`\nCatalogue size: ${PERMISSION_KEYS.length}. Existing grants were never removed.`);
  if (DRY_RUN) console.log('Dry run - re-run without --dry-run to apply.');
}

main().catch(async (err) => {
  console.error('Migration failed:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

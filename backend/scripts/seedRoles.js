// Models come from _bootstrap so they are compiled AFTER the tenancy plugin is
// registered — a static `import Role from ...` here would be hoisted above it
// and produce roles with no tenantId, invisible to the application.
import { bootstrapScript } from './_bootstrap.js';
import { DEFAULT_ROLES as roles } from '../utils/defaultRoles.js';

async function seedRoles() {
  const { models, inWorkspace, close } = await bootstrapScript();
  const { Role, User } = models;

  await inWorkspace(async () => {
  // Find any admin user to set as createdBy
  const adminUser = await User.findOne({ role: 'admin' });
  if (!adminUser) {
    console.error('No admin user found. Run `npm run make-admin` first.');
    process.exit(1);
  }

  let created = 0;
  let skipped = 0;

  for (const roleData of roles) {
    const existing = await Role.findOne({ name: roleData.name });
    if (existing) {
      console.log(`  SKIP  ${roleData.name} (already exists)`);
      skipped++;
      continue;
    }
    await Role.create({ ...roleData, createdBy: adminUser._id });
    console.log(`  CREATE ${roleData.name}`);
    created++;
  }

  console.log(`\nDone. Created: ${created}, Skipped: ${skipped}`);
  });

  await close();
}

seedRoles().catch((err) => {
  console.error(err);
  process.exit(1);
});

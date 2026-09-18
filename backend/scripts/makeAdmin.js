import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { registerTenancy } from '../tenancy/tenantPlugin.js';

// Before the model import below: a global plugin only applies to schemas
// compiled after it is registered. Without this the script would write users
// with no tenantId — records the application can never see.
registerTenancy(mongoose);

const { runWithTenant, runWithoutTenantScope } = await import('../tenancy/tenantContext.js');
const User = (await import('../models/user.model.js')).default;
const Tenant = (await import('../models/tenant.model.js')).default;

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('MONGO_URI is not set. Add it to backend/.env');
  process.exit(1);
}

function parseArgs(argv) {
  const args = { email: '', username: '', password: 'ChangeMe@123', resetPassword: false, workspace: '' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--email') args.email = argv[++i] || '';
    else if (a === '--username') args.username = argv[++i] || '';
    else if (a === '--password') args.password = argv[++i] || '';
    else if (a === '--reset-password') args.resetPassword = true;
    else if (a === '--workspace') args.workspace = argv[++i] || '';
  }
  return args;
}

async function main() {
  const { email, username, password, resetPassword, workspace } = parseArgs(process.argv);
  if (!email) {
    console.error('Usage: node backend/scripts/makeAdmin.js --email <email> [--username <name>] [--password <password>] [--reset-password] [--workspace <slug>]');
    console.error('\n  A user belongs to one workspace. --workspace picks which; it defaults to');
    console.error('  the only workspace when there is just one, and is required when there are more.');
    process.exit(1);
  }
  await mongoose.connect(MONGO_URI);
  try {
    // A user now belongs to a workspace, so the script has to say which one
    // before it can look anyone up.
    const tenants = await runWithoutTenantScope('choosing a workspace to act in', () =>
      Tenant.find({ isDeleted: { $ne: true } }).select('slug name')
    );
    if (tenants.length === 0) {
      console.error('No workspaces exist. Create one first:');
      console.error('  node scripts/provisionTenant.js --name "Your Agency" --admin-email you@example.com --platform-admin');
      process.exitCode = 1;
      return;
    }

    const tenant = workspace
      ? tenants.find((t) => t.slug === workspace)
      : tenants.length === 1
        ? tenants[0]
        : null;

    if (!tenant) {
      console.error(
        workspace
          ? `No workspace with slug "${workspace}".`
          : 'More than one workspace exists — say which with --workspace <slug>.'
      );
      console.error(`  Available: ${tenants.map((t) => t.slug).join(', ')}`);
      process.exitCode = 1;
      return;
    }

    console.log(`Workspace: ${tenant.name} (${tenant.slug})\n`);

    await runWithTenant({ tenantId: String(tenant._id) }, () => run());
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await mongoose.disconnect();
  }

  async function run() {
    let user = await User.findOne({ email });
    if (!user) {
      // Don't pre-hash password - the User model's pre-save hook handles hashing
      user = await User.create({
        username: username || email.split('@')[0],
        email,
        password,
        role: 'admin',
        assignedCategories: [],
      });
      console.log(`Created new admin user: ${email}`);
      console.log(`Password: ${password}`);
    } else {
      user.role = 'admin';
      if (resetPassword) {
        user.password = password;
        console.log(`Reset password for: ${email}`);
        console.log(`New password: ${password}`);
      }
      await user.save();
      console.log(`Promoted existing user to admin: ${email}`);
    }
    console.log('Done.');
  }
}

main();



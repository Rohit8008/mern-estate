/**
 * Create a workspace from the command line.
 *
 *   node scripts/provisionTenant.js --name "Acme Realty" --slug acme \
 *        --admin-email owner@acme.in [--admin-password 'Secret@123'] \
 *        [--plan growth] [--trial-days 30] [--no-sample-data] [--platform-admin]
 *
 * This exists alongside the API for two reasons. It is the bootstrap: the very
 * first platform admin cannot be created through an API that requires a
 * platform admin, so `--platform-admin` breaks that circle. And it is the
 * fallback when the console is down but a customer is waiting.
 *
 * Both paths call the same `provisionTenant`, so a workspace created here is
 * indistinguishable from one created in the console.
 */

import mongoose from 'mongoose';
import { config, validateConfig } from '../config/environment.js';
import { registerTenancy } from '../tenancy/tenantPlugin.js';

// Before any model import — a global plugin only applies to schemas compiled
// after it is registered.
registerTenancy(mongoose);

const { provisionTenant } = await import('../tenancy/provisionTenant.js');
const { runWithTenant } = await import('../tenancy/tenantContext.js');
const User = (await import('../models/user.model.js')).default;

function parseArgs(argv) {
  const args = {
    name: '', slug: '', adminEmail: '', adminName: '', adminPassword: '',
    plan: 'trial', trialDays: 14, seedSampleData: true, platformAdmin: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--name') args.name = argv[++i] || '';
    else if (a === '--slug') args.slug = argv[++i] || '';
    else if (a === '--admin-email') args.adminEmail = argv[++i] || '';
    else if (a === '--admin-name') args.adminName = argv[++i] || '';
    else if (a === '--admin-password') args.adminPassword = argv[++i] || '';
    else if (a === '--plan') args.plan = argv[++i] || 'trial';
    else if (a === '--trial-days') args.trialDays = parseInt(argv[++i], 10) || 14;
    else if (a === '--no-sample-data') args.seedSampleData = false;
    else if (a === '--platform-admin') args.platformAdmin = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

const USAGE = `
Create a workspace.

  --name             <text>   the agency's name                        (required)
  --admin-email      <email>  who gets the first admin account         (required)
  --slug             <text>   subdomain address; derived from the name if omitted
  --admin-name       <text>   username for that admin
  --admin-password   <text>   set a password now; omit so they must use
                              "forgot password" to choose their own (recommended)
  --plan             <plan>   trial | starter | growth | enterprise    (default trial)
  --trial-days       <n>      length of the trial                      (default 14)
  --no-sample-data            skip the starter category
  --platform-admin            also make this admin a PLATFORM operator, able to
                              administer every workspace. Use for the first one only.
`;

async function main() {
  const args = parseArgs(process.argv);

  if (args.help || !args.name || !args.adminEmail) {
    console.log(USAGE);
    process.exit(args.help ? 0 : 1);
  }

  validateConfig();
  await mongoose.connect(config.database.uri);

  try {
    const result = await provisionTenant(args);
    const { tenant, adminUser, needsPasswordSetup } = result;

    if (args.platformAdmin) {
      // Set directly: no tenant-facing API can grant this, by design.
      await runWithTenant({ tenantId: String(tenant._id) }, () =>
        User.updateOne({ _id: adminUser._id }, { $set: { isPlatformAdmin: true } })
      );
    }

    const line = '─'.repeat(60);
    console.log(`\n${line}`);
    console.log(`  ${tenant.name}`);
    console.log(line);
    console.log(`  Workspace id   ${tenant._id}`);
    console.log(`  Address        ${tenant.slug}`);
    console.log(`  Plan           ${tenant.plan}${tenant.trialEndsAt ? `  (trial ends ${tenant.trialEndsAt.toISOString().slice(0, 10)})` : ''}`);
    console.log(`  Admin          ${adminUser.email}  (${adminUser.username})`);
    if (args.platformAdmin) {
      console.log('  Platform admin YES — this account can administer every workspace');
    }
    console.log(line);

    if (needsPasswordSetup) {
      console.log('\n  No password was set. Tell the admin to use "Forgot password"');
      console.log('  on the sign-in page to choose their own.');
    }

    const appDomain = config.tenancy?.appDomain;
    console.log(
      appDomain
        ? `\n  Sign in at: https://${tenant.slug}.${appDomain}/sign-in`
        : `\n  Sign in with the header  x-tenant: ${tenant.slug}` +
          '\n  (set APP_DOMAIN in .env to route workspaces by subdomain instead)'
    );
    console.log('');
  } catch (err) {
    console.error(`\n  Could not create the workspace: ${err.message}\n`);
    if (err.field) console.error(`  Field: ${err.field}\n`);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

main();

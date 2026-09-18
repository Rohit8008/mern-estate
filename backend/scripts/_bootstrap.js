/**
 * Shared start-up for command-line scripts.
 *
 * Two things have to happen in the right order, and getting either wrong is
 * silent rather than loud:
 *
 *   1. `registerTenancy` must run BEFORE any model is imported. A global
 *      Mongoose plugin only applies to schemas compiled after it is registered,
 *      so a script with `import User from '../models/user.model.js'` at the top
 *      compiles User without `tenantId` and then writes records the application
 *      can never see. Static imports are hoisted, so a script cannot do this
 *      correctly by itself — the models must be loaded through here.
 *
 *   2. Every write needs a workspace. Outside a request there is nothing to
 *      infer one from, so a script must say which workspace it is acting in.
 *
 * Use it as:
 *
 *   const { models, inWorkspace, tenant, close } = await bootstrapScript();
 *   await inWorkspace(async () => { ...  });
 *   await close();
 */

import mongoose from 'mongoose';
import { registerTenancy } from '../tenancy/tenantPlugin.js';

registerTenancy(mongoose);

const { config, validateConfig } = await import('../config/environment.js');
const { runWithTenant, runWithoutTenantScope } = await import('../tenancy/tenantContext.js');

// Imported after registerTenancy, so every one of these carries the plugin.
const Tenant = (await import('../models/tenant.model.js')).default;
const User = (await import('../models/user.model.js')).default;
const Role = (await import('../models/role.model.js')).default;
const Category = (await import('../models/category.model.js')).default;
const Listing = (await import('../models/listing.model.js')).default;
const Owner = (await import('../models/owner.model.js')).default;
const Client = (await import('../models/client.model.js')).default;
const Task = (await import('../models/task.model.js')).default;
const BuyerRequirement = (await import('../models/buyerRequirement.model.js')).default;
const PropertyType = (await import('../models/propertyType.model.js')).default;

export const models = {
  Tenant, User, Role, Category, Listing, Owner, Client, Task, BuyerRequirement, PropertyType,
};

/** Read `--workspace <slug>` from argv. */
export function workspaceArg(argv = process.argv) {
  const i = argv.indexOf('--workspace');
  return i >= 0 ? argv[i + 1] || '' : '';
}

/**
 * Connect, pick the workspace to act in, and hand back a runner bound to it.
 *
 * @param {object}  [opts]
 * @param {string}  [opts.workspace]  slug; defaults to `--workspace`, then to
 *        the only workspace when there is exactly one
 * @param {boolean} [opts.quiet]
 */
export async function bootstrapScript({ workspace, quiet = false } = {}) {
  validateConfig();
  await mongoose.connect(config.database.uri);

  const slug = workspace || workspaceArg();

  const tenants = await runWithoutTenantScope('choosing a workspace to act in', () =>
    Tenant.find({ isDeleted: { $ne: true } }).select('slug name')
  );

  if (tenants.length === 0) {
    await mongoose.disconnect();
    throw new Error(
      'No workspaces exist yet. Create one first:\n' +
        '  node scripts/provisionTenant.js --name "Your Agency" --admin-email you@example.com --platform-admin'
    );
  }

  const tenant = slug
    ? tenants.find((t) => t.slug === slug)
    : tenants.length === 1
      ? tenants[0]
      : null;

  if (!tenant) {
    const available = tenants.map((t) => t.slug).join(', ');
    await mongoose.disconnect();
    throw new Error(
      slug
        ? `No workspace with slug "${slug}". Available: ${available}`
        : `More than one workspace exists — say which with --workspace <slug>. Available: ${available}`
    );
  }

  if (!quiet) {
    console.log(`Workspace: ${tenant.name} (${tenant.slug})`);
    console.log(`Database:  ${mongoose.connection.name}\n`);
  }

  return {
    tenant,
    models,
    /** Run `fn` inside this workspace, so writes are scoped and stamped. */
    inWorkspace: (fn) => runWithTenant({ tenantId: String(tenant._id), tenant }, fn),
    /** For the rare genuinely cross-workspace read. */
    acrossWorkspaces: runWithoutTenantScope,
    close: () => mongoose.disconnect(),
  };
}

export { mongoose };

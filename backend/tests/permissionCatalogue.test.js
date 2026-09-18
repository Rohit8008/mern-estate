/**
 * A permission that a route enforces must be one an admin can actually grant.
 *
 * The failure this catches: the Roles screen is driven by a hand-written
 * catalogue that was a second copy of the schema. It fell behind — the whole
 * clientManagement group was missing, so createClient/updateClient/
 * deleteClient/viewClients were enforced by client.route.js but could not be
 * ticked in the UI. Separately, propertyType.route.js asked for
 * `manage_settings`, which was never a permission at all, so every non-admin
 * was denied forever with a message that read like a policy decision.
 *
 * Both are the same bug: two lists that had to agree and nothing making them.
 * utils/permissionCatalogue.js is now the single source; these tests hold the
 * line by reading the real schema and the real route files.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { registerTenancy } from '../tenancy/tenantPlugin.js';
import {
  PERMISSION_GROUPS,
  PERMISSION_KEYS,
  isPermissionKey,
} from '../utils/permissionCatalogue.js';

const routesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'routes');

let Role;

beforeAll(async () => {
  registerTenancy(mongoose);
  ({ default: Role } = await import('../models/role.model.js'));
});

describe('permission catalogue', () => {
  it('has no duplicate keys across groups', () => {
    expect(new Set(PERMISSION_KEYS).size).toBe(PERMISSION_KEYS.length);
  });

  it('matches the Role schema exactly, in both directions', () => {
    // A nested plain object compiles to dotted paths, not a sub-schema.
    const schemaKeys = Object.keys(Role.schema.paths)
      .filter((k) => k.startsWith('permissions.'))
      .map((k) => k.slice('permissions.'.length));

    expect([...schemaKeys].sort()).toEqual([...PERMISSION_KEYS].sort());
  });

  it('exposes every permission to the admin UI', () => {
    const served = Object.values(PERMISSION_GROUPS).flatMap((g) => Object.keys(g));

    // The regression: 31 of 35 were served, and nothing noticed.
    expect([...served].sort()).toEqual([...PERMISSION_KEYS].sort());
  });

  it('still carries the group that went missing', () => {
    expect(Object.keys(PERMISSION_GROUPS)).toContain('clientManagement');
    expect(PERMISSION_GROUPS.clientManagement).toHaveProperty('viewClients');
  });

  it('gives every permission a description for the checkbox label', () => {
    for (const [group, entries] of Object.entries(PERMISSION_GROUPS)) {
      for (const [key, description] of Object.entries(entries)) {
        expect(typeof description).toBe('string');
        expect(description.trim().length).toBeGreaterThan(0);
        expect(`${group}.${key}`).toBeTruthy();
      }
    }
  });
});

describe('routes only ask for permissions that exist', () => {
  const files = fs.readdirSync(routesDir).filter((f) => f.endsWith('.route.js'));

  it.each(files)('%s', (file) => {
    const src = fs.readFileSync(path.join(routesDir, file), 'utf8');
    const asked = [...src.matchAll(/requirePermission\(\s*['"]([^'"]+)['"]\s*\)/g)]
      .map((m) => m[1]);

    const unknown = asked.filter((p) => !isPermissionKey(p));
    expect(unknown).toEqual([]);
  });
});

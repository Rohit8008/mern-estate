/**
 * The workspace settings controller.
 *
 * The primitives underneath are well covered — screenCatalogue, stageCatalogue,
 * provisionTenant and the tenancy helpers all have suites. What had no test was
 * the layer that takes an admin's request and decides what actually gets stored:
 * the allowlist that keeps plan and limits out of a customer's reach, and the
 * screen-id contract CLAUDE.md calls unrenameable.
 *
 * The interesting assertions here are about what is NOT written.
 */

import Tenant from '../models/tenant.model.js';
import {
  updateTenantConfig,
  updateScreenSettings,
  getScreenCatalogue,
} from '../controllers/tenant.controller.js';
import { runWithTenant, runWithoutTenantScope } from '../tenancy/tenantContext.js';

let tenantId;

beforeEach(async () => {
  tenantId = global.testUtils.tenantId;
  await runWithoutTenantScope('seeding the workspace under test', () =>
    Tenant.findByIdAndUpdate(
      tenantId,
      {
        $setOnInsert: {},
        $set: { name: 'Acme Realty', slug: 'acme', status: 'active', plan: 'starter' },
      },
      { upsert: true }
    )
  );
});

const admin = () => ({ id: 'admin-1', role: 'admin' });
const employee = () => ({ id: 'emp-1', role: 'employee' });

function call(handler, { user = admin(), body = {}, query = {}, params = {} } = {}) {
  const req = {
    user, body, query, params,
    tenantId: String(tenantId),
    ip: '127.0.0.1',
    originalUrl: '/api/tenant/config',
  };
  return runWithTenant(
    { tenantId: String(tenantId) },
    () =>
      new Promise((resolve, reject) => {
        const res = {
          status(code) { this.__status = code; return this; },
          json(payload) { resolve({ ...payload, __status: this.__status || 200 }); return this; },
        };
        Promise.resolve(handler(req, res, (err) => (err ? reject(err) : resolve(undefined)))).catch(reject);
      })
  );
}

const reload = () =>
  runWithoutTenantScope('asserting what was stored', () => Tenant.findById(tenantId).lean());

describe('updateTenantConfig', () => {
  it('refuses an employee', async () => {
    const err = await call(updateTenantConfig, { user: employee(), body: { name: 'Mine now' } }).catch((e) => e);

    expect(err.statusCode).toBe(403);
    expect((await reload()).name).toBe('Acme Realty');
  });

  it.each(['plan', 'limits', 'status', 'slug', 'features'])(
    'refuses to let a workspace admin change its own %s',
    async (field) => {
      // The whole commercial boundary: an agency that can raise its own plan or
      // limits does not have a plan, it has a suggestion.
      const err = await call(updateTenantConfig, { body: { [field]: 'enterprise' } }).catch((e) => e);

      expect(err.statusCode).toBe(403);
      expect(err.message).toMatch(/managed by the platform/i);
    }
  );

  it('rejects an unknown setting rather than quietly ignoring it', async () => {
    const err = await call(updateTenantConfig, { body: { nonsense: true } }).catch((e) => e);

    expect(err.statusCode).toBe(400);
    expect(err.message).toMatch(/unknown setting/i);
  });

  it('stores the settings an admin may change', async () => {
    await call(updateTenantConfig, { body: { name: 'Acme Realty LLP' } });

    expect((await reload()).name).toBe('Acme Realty LLP');
  });

  it('merges branding rather than replacing it', async () => {
    // A client sending only the brand colour must not wipe the logo it did not send.
    await call(updateTenantConfig, { body: { branding: { productName: 'Acme CRM', logoUrl: '/logo.png' } } });
    await call(updateTenantConfig, { body: { branding: { tokens: { brand: '#2b6faa' } } } });

    const { branding } = await reload();
    expect(branding.logoUrl).toBe('/logo.png');
    expect(branding.tokens.brand).toBe('#2b6faa');
  });
});

describe('updateScreenSettings', () => {
  it('refuses an employee', async () => {
    const err = await call(updateScreenSettings, {
      user: employee(),
      body: { screens: { analytics: false } },
    }).catch((e) => e);

    expect(err.statusCode).toBe(403);
  });

  it('rejects a screen id that is not in the catalogue', async () => {
    // Screen ids are a contract with stored tenant settings. Accepting an
    // unknown one writes a key nothing will ever read or clean up.
    const err = await call(updateScreenSettings, {
      body: { screens: { dashboard: true, 'not-a-screen': true } },
    }).catch((e) => e);

    expect(err.statusCode).toBe(400);
    expect(err.message).toMatch(/unknown screen/i);

    const { features } = await reload();
    expect(Object.keys(features || {})).not.toContain('not-a-screen');
  });

  it('rejects an unknown id in the labels map too', async () => {
    const err = await call(updateScreenSettings, {
      body: { labels: { 'not-a-screen': 'Whatever' } },
    }).catch((e) => e);

    expect(err.statusCode).toBe(400);
  });

  it('refuses to switch off a core screen', async () => {
    const { data } = await call(getScreenCatalogue, {});
    const core = (data.screens || data).find((s) => s.core);
    expect(core).toBeDefined();

    const err = await call(updateScreenSettings, { body: { screens: { [core.id]: false } } }).catch((e) => e);

    expect(err.statusCode).toBe(400);
    expect(err.message).toMatch(/core product/i);
  });

  it('stores only what differs from the product default', async () => {
    // Off is stored as `false`; back on deletes the key rather than storing
    // `true`, so the map keeps saying only what this workspace changed.
    await call(updateScreenSettings, { body: { screens: { analytics: false } } });
    expect((await reload()).features.analytics).toBe(false);

    await call(updateScreenSettings, { body: { screens: { analytics: true } } });
    expect((await reload()).features).not.toHaveProperty('analytics');
  });

  it('drops a custom label that matches the default instead of storing it', async () => {
    const { data } = await call(getScreenCatalogue, {});
    const screen = (data.screens || data).find((s) => !s.core);

    await call(updateScreenSettings, { body: { labels: { [screen.id]: 'Our Name' } } });
    expect((await reload()).settings.navLabels[screen.id]).toBe('Our Name');

    await call(updateScreenSettings, { body: { labels: { [screen.id]: screen.label } } });
    expect((await reload()).settings.navLabels).not.toHaveProperty(screen.id);
  });
});

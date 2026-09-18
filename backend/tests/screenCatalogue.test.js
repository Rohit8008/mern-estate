/**
 * The screen catalogue.
 *
 * Ids in this catalogue are a contract with every workspace's stored settings:
 * a tenant records "calendar: false", so renaming `calendar` would silently
 * re-enable a screen that agency had switched off, and orphan the old flag.
 * The id guard below is the main point of this file.
 */

import {
  SCREEN_CATALOGUE,
  SCREEN_SECTIONS,
  SCREEN_IDS,
  getScreen,
  isKnownScreen,
  isScreenEnabled,
  resolveScreensForTenant,
} from '../tenancy/screenCatalogue.js';

describe('catalogue integrity', () => {
  it('has no duplicate ids', () => {
    expect(new Set(SCREEN_IDS).size).toBe(SCREEN_IDS.length);
  });

  it('puts every screen in a section that exists', () => {
    const sectionIds = new Set(SCREEN_SECTIONS.map((s) => s.id));
    SCREEN_CATALOGUE.forEach((screen) => {
      expect(sectionIds).toContain(screen.section);
    });
  });

  it('gives every screen a label, description and order', () => {
    SCREEN_CATALOGUE.forEach((screen) => {
      expect(screen.label).toBeTruthy();
      expect(screen.description).toBeTruthy();
      expect(typeof screen.order).toBe('number');
    });
  });

  it('keeps the shipped ids stable', () => {
    // Tenants enable screens by id. If this list needs editing, the question to
    // answer first is what happens to the workspaces that stored the old id —
    // adding is free, renaming is a migration, removing orphans a setting.
    expect([...SCREEN_IDS].sort()).toEqual(
      [
        'adminPanel', 'analytics', 'buyers', 'calendar', 'categories', 'clients',
        'createListing', 'dashboard', 'import', 'owners', 'pipeline', 'properties',
        'reports', 'settings', 'tasks', 'transactions',
      ].sort()
    );
  });
});

describe('isScreenEnabled', () => {
  it('treats an unconfigured screen as ON', () => {
    // The day flags are introduced, no workspace has any stored — none of them
    // should lose a screen they were already using.
    expect(isScreenEnabled(getScreen('calendar'), {})).toBe(true);
    expect(isScreenEnabled(getScreen('calendar'), undefined)).toBe(true);
  });

  it('honours an explicit false', () => {
    expect(isScreenEnabled(getScreen('calendar'), { calendar: false })).toBe(false);
  });

  it('ignores the flag for core screens', () => {
    // The product is unusable without these, so a stray false must not brick a
    // workspace's menu.
    expect(isScreenEnabled(getScreen('dashboard'), { dashboard: false })).toBe(true);
    expect(isScreenEnabled(getScreen('properties'), { properties: false })).toBe(true);
    expect(isScreenEnabled(getScreen('settings'), { settings: false })).toBe(true);
  });

  it('returns false for an unknown screen rather than throwing', () => {
    expect(isScreenEnabled(getScreen('nope'), {})).toBe(false);
  });
});

describe('isKnownScreen', () => {
  it('accepts catalogue ids and rejects anything else', () => {
    expect(isKnownScreen('clients')).toBe(true);
    expect(isKnownScreen('cliets')).toBe(false);
    expect(isKnownScreen('')).toBe(false);
  });
});

describe('resolveScreensForTenant', () => {
  const tenantWith = (features = {}, settings = {}) => ({ features, settings });

  it('reports enablement per screen', () => {
    const screens = resolveScreensForTenant(tenantWith({ calendar: false }));
    const byId = Object.fromEntries(screens.map((s) => [s.id, s]));
    expect(byId.calendar.enabled).toBe(false);
    expect(byId.tasks.enabled).toBe(true);
  });

  it('applies a workspace\'s own name for a screen, keeping the default alongside', () => {
    const screens = resolveScreensForTenant(
      tenantWith({}, { navLabels: { clients: 'Enquiries' } })
    );
    const clients = screens.find((s) => s.id === 'clients');
    expect(clients.label).toBe('Enquiries');
    // The default is kept so the settings UI can show "was Clients" and offer a reset.
    expect(clients.defaultLabel).toBe('Clients');
  });

  it('reads features from a Mongoose Map as well as a plain object', () => {
    const screens = resolveScreensForTenant({ features: new Map([['calendar', false]]) });
    expect(screens.find((s) => s.id === 'calendar').enabled).toBe(false);
  });

  it('survives a tenant with no features or settings at all', () => {
    const screens = resolveScreensForTenant({});
    expect(screens).toHaveLength(SCREEN_CATALOGUE.length);
    expect(screens.every((s) => s.enabled)).toBe(true);
  });

  it('never leaks internals the browser has no use for', () => {
    const screens = resolveScreensForTenant(tenantWith());
    screens.forEach((s) => {
      expect(Object.keys(s).sort()).toEqual(
        ['adminOnly', 'core', 'defaultLabel', 'deprecated', 'description', 'enabled', 'id', 'label', 'order', 'requires', 'section'].sort()
      );
    });
  });
});

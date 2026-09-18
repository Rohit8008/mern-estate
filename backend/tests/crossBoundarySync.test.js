/**
 * The three contracts CLAUDE.md declares and nothing enforced.
 *
 * Each of these is a pair of files, one per side of the wire, that must agree:
 *
 *   • NATIVE_FIELD_ALIASES — frontend/src/utils/nativeFieldAliases.js and
 *     backend/utils/importMapping.js. A category field that aliases a native
 *     column has to resolve to the SAME column on both sides, or the form
 *     writes to one place and the importer reads from another.
 *   • RESERVED_FIELD_KEYS — backend/utils/categoryFields.js is authoritative;
 *     frontend/src/utils/categoryFieldRules.js mirrors it for inline hints. A
 *     key the server rejects but the editor accepts is a form that fails on
 *     submit with no warning while typing.
 *   • Screen ids — backend/tenancy/screenCatalogue.js and
 *     frontend/src/app/screenRegistry.js. An id in the catalogue with no
 *     registry entry is a screen the sidebar cannot render; the reverse is a
 *     route nothing can reach. CLAUDE.md: "Screen ids are a contract with
 *     stored tenant settings — never rename one."
 *
 * The frontend halves are READ AS TEXT rather than imported: screenRegistry.js
 * imports react-icons and categoryFieldRules.js uses extensionless specifiers,
 * neither of which Node's resolver handles. Parsing is the cost of testing
 * across the boundary from here; if a file's shape changes the parse returns
 * nothing and the test fails loudly, which is the right direction to fail.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { NATIVE_FIELD_ALIASES } from '../utils/importMapping.js';
import { RESERVED_FIELD_KEYS, FIELD_TYPES } from '../utils/categoryFields.js';
import { SCREEN_IDS } from '../tenancy/screenCatalogue.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontend = (rel) => path.resolve(here, '..', '..', 'frontend', 'src', rel);

const read = (rel) => {
  const file = frontend(rel);
  expect(fs.existsSync(file)).toBe(true);
  return fs.readFileSync(file, 'utf8');
};

/** `key: 'value'` pairs inside the first `NAME = { ... }` block. */
function parseStringMap(source, name) {
  const start = source.indexOf(`${name} = {`);
  if (start === -1) return null;
  const body = source.slice(start, source.indexOf('\n};', start));
  const out = {};
  for (const [, k, v] of body.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:\s*'([^']*)'/gm)) out[k] = v;
  return out;
}

/** Quoted entries inside the first `NAME = new Set([ ... ])` block. */
function parseStringSet(source, name) {
  const start = source.indexOf(`${name} = new Set([`);
  if (start === -1) return null;
  const body = source.slice(start, source.indexOf('])', start));
  return new Set([...body.matchAll(/'([^']+)'/g)].map((m) => m[1]));
}

/** Top-level keys of the `SCREEN_REGISTRY = { ... }` object. */
function parseRegistryIds(source) {
  const start = source.indexOf('SCREEN_REGISTRY = {');
  if (start === -1) return null;
  const body = source.slice(start);
  // Two-space indent marks a top-level entry; nested config is deeper.
  return [...body.matchAll(/^ {2}([a-zA-Z][\w-]*)\s*:\s*\{/gm)].map((m) => m[1]);
}

describe('NATIVE_FIELD_ALIASES agree across the wire', () => {
  const frontendAliases = parseStringMap(read('utils/nativeFieldAliases.js'), 'NATIVE_FIELD_ALIASES');

  it('parses (guards the test itself against a shape change)', () => {
    expect(frontendAliases).not.toBeNull();
    expect(Object.keys(frontendAliases).length).toBeGreaterThan(0);
  });

  it('maps the same category keys on both sides', () => {
    expect(Object.keys(frontendAliases).sort()).toEqual(Object.keys(NATIVE_FIELD_ALIASES).sort());
  });

  it('maps each key to the SAME native column on both sides', () => {
    // The failure this catches: rateSqYard -> sqYardRate on one side and
    // -> rateSqYard on the other. Both "work"; the value lands nowhere.
    for (const key of Object.keys(NATIVE_FIELD_ALIASES)) {
      expect([key, frontendAliases[key]]).toEqual([key, NATIVE_FIELD_ALIASES[key]]);
    }
  });

  it('keeps the null prototype on both sides', () => {
    // A field literally called `__proto__` would otherwise resolve through
    // Object.prototype instead of to nothing.
    expect(Object.getPrototypeOf(NATIVE_FIELD_ALIASES)).toBeNull();
    expect(read('utils/nativeFieldAliases.js')).toMatch(/__proto__:\s*null/);
  });
});

describe('category field rules mirror the server', () => {
  const source = read('utils/categoryFieldRules.js');

  it('reserves exactly the same keys the server reserves', () => {
    const mirrored = parseStringSet(source, 'RESERVED_FIELD_KEYS');
    expect(mirrored).not.toBeNull();
    expect([...mirrored].sort()).toEqual([...RESERVED_FIELD_KEYS].sort());
  });

  it('derives its alias exemptions rather than restating them', () => {
    // A hand-kept second copy of the alias list is what drifts first.
    expect(source).toMatch(/ALIASED_KEYS\s*=\s*new Set\(Object\.keys\(NATIVE_FIELD_ALIASES\)\)/);
  });

});

describe('the field-type dropdown offers what the server accepts', () => {
  // A fourth copy of the vocabulary, in the editor. A type missing here is a
  // capability the product has and no admin can reach: `textarea` was accepted
  // by utils/categoryFields.js, allowed by the model enum and rendered by
  // DynamicCategoryFields.jsx, while this dropdown never offered it.
  const source = read('pages/AdminCategoryFields.jsx');
  const offered = [...source.matchAll(/\{\s*value:\s*'([^']+)'\s*,\s*label:/g)].map((m) => m[1]);

  it('parses (guards the test itself against a shape change)', () => {
    expect(offered.length).toBeGreaterThan(0);
  });

  it('offers every type the server accepts, and none it does not', () => {
    expect(offered.sort()).toEqual([...FIELD_TYPES].sort());
  });
});

describe('the screen catalogue and the screen registry agree', () => {
  const registryIds = parseRegistryIds(read('app/screenRegistry.js'));

  it('parses (guards the test itself against a shape change)', () => {
    expect(registryIds).not.toBeNull();
    expect(registryIds.length).toBeGreaterThan(5);
  });

  it('gives every catalogued screen an icon and a route', () => {
    const missing = SCREEN_IDS.filter((id) => !registryIds.includes(id));
    expect(missing).toEqual([]); // a catalogued screen the sidebar cannot render
  });

  it('has no registry entry for a screen the server does not know', () => {
    const orphans = registryIds.filter((id) => !SCREEN_IDS.includes(id));
    expect(orphans).toEqual([]); // a route no tenant can ever be granted
  });
});

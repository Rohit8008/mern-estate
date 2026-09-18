/**
 * Every language file has to carry the same keys.
 *
 * This is the same class of bug as the permission catalogue: two lists that
 * have to agree, with nothing making them. A key added to English and missed in
 * Hindi does not throw — i18next quietly falls back — so a half-translated
 * screen ships and nobody finds out until a customer reads it.
 *
 * The files are read from disk rather than through the i18n module so this
 * tests the source of truth, not what the bundler happened to assemble.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const localesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'locales');

const files = fs.readdirSync(localesDir).filter((name) => name.endsWith('.json'));

const load = (file) => JSON.parse(fs.readFileSync(path.join(localesDir, file), 'utf8'));

/** Every leaf key, dotted. */
const flatten = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([key, value]) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? flatten(value, `${prefix}${key}.`)
      : [`${prefix}${key}`]
  );

/** The {{names}} a string interpolates. */
const placeholders = (text) =>
  [...String(text).matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort();

const leaves = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([key, value]) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? leaves(value, `${prefix}${key}.`)
      : [[`${prefix}${key}`, value]]
  );

describe('locale files', () => {
  it('includes English', () => {
    expect(files).toContain('en.json');
  });

  it('has more than one language, so the machinery is actually exercised', () => {
    expect(files.length).toBeGreaterThan(1);
  });

  it.each(files)('%s is valid JSON and names itself', (file) => {
    const bundle = load(file);
    expect(bundle._meta?.name, `${file} needs _meta.name`).toBeTruthy();
    expect(bundle._meta?.englishName, `${file} needs _meta.englishName`).toBeTruthy();
  });

  const english = load('en.json');
  const englishKeys = flatten(english).sort();

  it.each(files.filter((f) => f !== 'en.json'))('%s has every English key', (file) => {
    const missing = englishKeys.filter((key) => !flatten(load(file)).includes(key));
    expect(missing, `${file} is missing: ${missing.join(', ')}`).toEqual([]);
  });

  it.each(files.filter((f) => f !== 'en.json'))('%s has no keys English lacks', (file) => {
    const extra = flatten(load(file)).filter((key) => !englishKeys.includes(key));
    expect(extra, `${file} has orphans: ${extra.join(', ')}`).toEqual([]);
  });

  it.each(files.filter((f) => f !== 'en.json'))(
    '%s interpolates the same variables as English',
    (file) => {
      const translated = Object.fromEntries(leaves(load(file)));
      const mismatched = leaves(english)
        .filter(([key, value]) => typeof value === 'string' && key in translated)
        .filter(([key, value]) => {
          const expected = placeholders(value);
          const actual = placeholders(translated[key]);
          return JSON.stringify(expected) !== JSON.stringify(actual);
        })
        .map(([key]) => key);

      // A translation that drops {{count}} renders a sentence with a hole in it.
      expect(mismatched, `${file} has placeholder mismatches: ${mismatched.join(', ')}`).toEqual([]);
    }
  );

  it.each(files)('%s has no empty strings', (file) => {
    const empty = leaves(load(file))
      .filter(([, value]) => typeof value === 'string' && !value.trim())
      .map(([key]) => key);
    expect(empty).toEqual([]);
  });
});

/**
 * Every t('key') a component calls must exist in English.
 *
 * i18next falls back to rendering the key itself when it is missing, so a
 * screen ships showing `owners.propertyOwners` where a heading should be. That
 * is exactly what happened: OwnersBoard was converted before the batch runner
 * existed, its strings never reached the catalogue, and the build, the lint and
 * the locale-parity test all stayed green — parity only proves the two
 * languages agree with each other, not that either one covers the code.
 *
 * Only a browser caught it. This is that check, made cheap.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const srcDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const en = JSON.parse(fs.readFileSync(path.join(srcDir, 'i18n/locales/en.json'), 'utf8'));

/** Walk every .jsx/.js under src/, skipping tests and the locale files. */
function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return ['__tests__', 'locales', 'node_modules'].includes(entry.name) ? [] : sourceFiles(full);
    }
    return /\.jsx?$/.test(entry.name) ? [full] : [];
  });
}

/**
 * i18next resolves `t('x', { count })` against the plural forms `x_one` and
 * `x_other`, so a bare `x` is present if either exists.
 */
function resolves(key) {
  const lookup = (k) => {
    let node = en;
    for (const part of k.split('.')) {
      if (!node || typeof node !== 'object' || !(part in node)) return false;
      node = node[part];
    }
    return typeof node === 'string';
  };
  return lookup(key) || lookup(`${key}_other`) || lookup(`${key}_one`);
}

const files = sourceFiles(srcDir);

describe('translation keys', () => {
  it('finds source files to check', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('every key used in the code exists in English', () => {
    const missing = [];

    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      for (const [, key] of src.matchAll(/\bt\(\s*'([A-Za-z0-9_.]+)'/g)) {
        // A key with no dot is almost certainly a variable, not a lookup.
        if (!key.includes('.')) continue;
        if (!resolves(key)) {
          missing.push(`${path.relative(srcDir, file)}: ${key}`);
        }
      }
    }

    expect(missing, `Keys used in code but absent from en.json:\n  ${missing.join('\n  ')}`).toEqual([]);
  });

  it('the namespace that shipped broken is covered', () => {
    // Regression guard for the specific failure.
    expect(resolves('owners.propertyOwners')).toBe(true);
    expect(resolves('owners.addOwner')).toBe(true);
  });

  it('plural keys resolve from their bare form', () => {
    expect(resolves('common.selected')).toBe(true);
  });
});

/**
 * Category field definitions.
 *
 * These are user-supplied *structure*, not user-supplied data: an admin
 * describes a shape that then governs how every listing in the category is
 * stored, validated and rendered. Until this existed the request schema
 * accepted `Joi.object().unknown(true)`, so nothing was checked at all.
 *
 * The cases below are the ones that caused real damage when tried by hand: a
 * key that shadows a real column, a key that walks the prototype chain, a
 * duplicate key, and a pattern that hangs the process on every listing save.
 */

import {
  validateCategoryFields,
  checkPattern,
  RESERVED_FIELD_KEYS,
  FIELD_TYPES,
} from '../utils/categoryFields.js';

const ok = (over = {}) => ({ key: 'facing', label: 'Facing', type: 'text', ...over });
const keysWithErrors = (fields) =>
  validateCategoryFields(fields).errors.map((e) => e.field);

describe('field keys', () => {
  it('accepts a sensible key', () => {
    const { errors, fields } = validateCategoryFields([ok()]);
    expect(errors).toEqual([]);
    expect(fields[0].key).toBe('facing');
  });

  it('refuses a key that shadows a real listing column', () => {
    // `attributes` is merged alongside the listing's own columns in several
    // places, so a field called `name` gives a listing two different values for
    // one word and nothing to say which a screen meant.
    ['name', 'status', 'regularPrice', 'tenantId', 'ownerIds'].forEach((key) => {
      expect(RESERVED_FIELD_KEYS.has(key)).toBe(true);
      expect(keysWithErrors([ok({ key })])).toContain('key');
    });
  });

  it('refuses prototype names', () => {
    // A plain object is used as a lookup for these keys in the import path,
    // where `__proto__` resolved to Object.prototype rather than to nothing.
    ['__proto__', 'constructor', 'prototype', 'toString'].forEach((key) => {
      expect(keysWithErrors([ok({ key })])).toContain('key');
    });
  });

  it('still allows the aliased native columns, which categories legitimately surface', () => {
    // Plot ledgers declare these as their own fields; existing workspaces rely
    // on it, and the alias table routes them to the real column.
    ['sqYard', 'propertyNo', 'plotSize', 'areaName', 'remarks'].forEach((key) => {
      expect(validateCategoryFields([ok({ key })]).errors).toEqual([]);
    });
  });

  it('refuses a malformed key', () => {
    ['', '1facing', 'Facing', 'has space', 'has-hyphen', 'a'.repeat(41)].forEach((key) => {
      expect(keysWithErrors([ok({ key })])).toContain('key');
    });
  });

  it('refuses the same key twice', () => {
    // Two fields writing the same attribute means the second silently wins.
    const errors = validateCategoryFields([ok({ key: 'dup' }), ok({ key: 'dup', label: 'Other' })]).errors;
    expect(errors.some((e) => e.field === 'key' && /twice/.test(e.message))).toBe(true);
  });

  it('names both positions in the duplicate message', () => {
    const [dup] = validateCategoryFields([ok({ key: 'dup' }), ok({ key: 'dup' })]).errors.filter(
      (e) => /twice/.test(e.message)
    );
    expect(dup.message).toMatch(/1 and 2/);
  });
});

describe('labels and types', () => {
  it('requires a label — it is what the team actually sees', () => {
    expect(keysWithErrors([ok({ label: '' })])).toContain('label');
  });

  it('refuses a type the product cannot render', () => {
    expect(keysWithErrors([ok({ type: 'wysiwyg' })])).toContain('type');
    FIELD_TYPES.forEach((type) => {
      expect(validateCategoryFields([ok({ type, options: type === 'select' ? ['A'] : [] })]).errors).toEqual([]);
    });
  });
});

describe('dropdowns', () => {
  it('refuses a dropdown with no options', () => {
    // Otherwise the field renders as an empty select nobody can fill in.
    expect(keysWithErrors([ok({ type: 'select', options: [] })])).toContain('options');
  });

  it('refuses duplicate options', () => {
    expect(keysWithErrors([ok({ type: 'select', options: ['East', 'East'] })])).toContain('options');
  });

  it('trims and drops blank options', () => {
    const { fields } = validateCategoryFields([ok({ type: 'select', options: ['  East ', '', 'West'] })]);
    expect(fields[0].options).toEqual(['East', 'West']);
  });
});

describe('numeric bounds', () => {
  it('refuses a minimum above the maximum', () => {
    expect(keysWithErrors([ok({ type: 'number', min: 100, max: 10 })])).toContain('min');
  });

  it('accepts bounds either side', () => {
    expect(validateCategoryFields([ok({ type: 'number', min: 0, max: 100 })]).errors).toEqual([]);
  });

  it('treats an empty bound as absent rather than as zero', () => {
    const { fields, errors } = validateCategoryFields([ok({ type: 'number', min: '', max: null })]);
    expect(errors).toEqual([]);
    expect(fields[0].min).toBeUndefined();
    expect(fields[0].max).toBeUndefined();
  });
});

describe('format patterns', () => {
  it('accepts an ordinary pattern', () => {
    expect(checkPattern('^[A-Z]{2}-\\d{4}$')).toBeNull();
  });

  it('refuses a pattern that will not compile', () => {
    expect(checkPattern('(')).toMatch(/not a valid pattern/);
  });

  it('refuses nested repetition, which can hang the process', () => {
    // `^(a+)+$` backtracks exponentially: ~30 characters of input occupies a
    // core for minutes. This runs on every listing save in the category, so one
    // such pattern stalls the whole workspace.
    expect(checkPattern('^(a+)+$')).toMatch(/nested repetition/);
    expect(checkPattern('(x*)*')).toMatch(/nested repetition/);
  });

  it('refuses a repeated alternation of identical branches', () => {
    expect(checkPattern('(a|a)*')).toMatch(/identical branches/);
  });

  it('refuses an absurdly long pattern', () => {
    expect(checkPattern('a'.repeat(300))).toMatch(/too long/);
  });

  it('drops a rejected pattern rather than storing it', () => {
    const { fields } = validateCategoryFields([ok({ pattern: '^(a+)+$' })]);
    expect(fields[0].pattern).toBe('');
  });
});

describe('conditional visibility', () => {
  it('refuses a field that depends on itself', () => {
    expect(
      keysWithErrors([ok({ key: 'facing', showWhen: { field: 'facing', values: ['East'] } })])
    ).toContain('showWhen');
  });

  it('refuses a dependency on a field that does not exist', () => {
    // The dependent field would never appear, which reads as a broken form.
    expect(
      keysWithErrors([ok({ key: 'a', showWhen: { field: 'nope', values: ['x'] } })])
    ).toContain('showWhen');
  });

  it('accepts a dependency on a field that does exist', () => {
    const { errors } = validateCategoryFields([
      ok({ key: 'kind', type: 'select', options: ['Plot', 'Flat'] }),
      ok({ key: 'floor', label: 'Floor', showWhen: { field: 'kind', values: ['Flat'] } }),
    ]);
    expect(errors).toEqual([]);
  });
});

describe('normalisation', () => {
  it('renumbers order from the position sent, so reordering in the UI decides it', () => {
    const { fields } = validateCategoryFields([
      ok({ key: 'a', order: 99 }),
      ok({ key: 'b', order: 5 }),
    ]);
    expect(fields.map((f) => f.order)).toEqual([0, 1]);
  });

  it('drops unknown properties rather than storing them', () => {
    const { fields } = validateCategoryFields([ok({ evil: '<script>', somethingElse: 1 })]);
    expect(fields[0].evil).toBeUndefined();
    expect(fields[0].somethingElse).toBeUndefined();
  });

  it('caps long free text', () => {
    const { fields } = validateCategoryFields([
      ok({ description: 'x'.repeat(500), placeholder: 'y'.repeat(500) }),
    ]);
    expect(fields[0].description.length).toBe(300);
    expect(fields[0].placeholder.length).toBe(200);
  });

  it('refuses more fields than a form can reasonably hold', () => {
    const many = Array.from({ length: 101 }, (_, i) => ok({ key: `f${i}` }));
    expect(validateCategoryFields(many).errors.some((e) => e.field === 'fields')).toBe(true);
  });

  it('refuses a fields value that is not a list', () => {
    expect(validateCategoryFields('nope').errors[0].field).toBe('fields');
    expect(validateCategoryFields(null).errors[0].field).toBe('fields');
  });

  it('reports which field each problem is on', () => {
    const { errors } = validateCategoryFields([ok(), ok({ key: '' })]);
    expect(errors[0].index).toBe(1);
  });
});

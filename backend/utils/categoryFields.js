/**
 * Validating the field definitions a category declares.
 *
 * These definitions are user-supplied structure, not user-supplied data: an
 * admin describes a shape that then governs how every listing in that category
 * is stored, validated and rendered. Nothing was checking them — the request
 * schema accepted `Joi.object().unknown(true)` — so a category could declare a
 * field whose key collides with a real column, a regex that hangs the process,
 * two fields with the same key, or a key that walks the prototype chain.
 *
 * The rules below are deliberately strict. A field key is an identifier the
 * product will carry for the life of the workspace's data; refusing an awkward
 * one at creation costs an admin ten seconds, and accepting it costs a
 * migration.
 */

import { NATIVE_FIELD_ALIASES } from './importMapping.js';

/** Lowercase start, then letters, digits and underscores. */
const KEY_PATTERN = /^[a-z][a-zA-Z0-9_]{0,39}$/;

export const FIELD_TYPES = ['text', 'number', 'boolean', 'select', 'date', 'textarea'];

/**
 * Keys a category field may not use.
 *
 * `attributes` is merged alongside the listing's own columns in several places,
 * so a field called `name` or `status` produces a listing whose category field
 * and whose real column disagree, with nothing to say which one a screen meant.
 * The prototype names are barred because a plain object is used as a lookup in
 * places, where `__proto__` and `constructor` resolve to inherited values
 * rather than to nothing.
 */
export const RESERVED_FIELD_KEYS = new Set([
  // Prototype plumbing.
  '__proto__', 'constructor', 'prototype', 'toString', 'valueOf', 'hasOwnProperty',
  // Real Listing columns — a category field must not shadow one.
  '_id', 'id', 'name', 'description', 'address', 'city', 'locality', 'state',
  'pincode', 'type', 'status', 'category', 'attributes', 'location',
  'regularPrice', 'discountPrice', 'offer', 'parking', 'furnished',
  'bedrooms', 'bathrooms', 'imageUrls', 'ownerIds', 'userRef', 'assignedAgent',
  'tenantId', 'isDeleted', 'deletedAt', 'createdAt', 'updatedAt', '__v',
  'propertyType', 'propertyCategory', 'commercialType', 'plotType',
]);

/**
 * A category field key may still be one of the aliased native columns — that is
 * the documented way a category surfaces `sqYard` or `propertyNo` as its own
 * field, and existing workspaces rely on it.
 */
const ALIASED_KEYS = new Set(Object.keys(NATIVE_FIELD_ALIASES));

/**
 * Reject a regex that could hang the process.
 *
 * Nested quantifiers — `(a+)+`, `(a|a)*` — backtrack exponentially, so a
 * 30-character input can occupy a core for minutes. This runs on every listing
 * save in the category, so one bad pattern stalls the workspace. A full
 * safe-regex analysis is out of scope; this catches the shapes that actually
 * cause it, and anything unparseable.
 */
export function checkPattern(pattern) {
  if (!pattern) return null;
  if (typeof pattern !== 'string') return 'must be text';
  if (pattern.length > 200) return 'is too long (200 characters maximum)';

  try {
    new RegExp(pattern);
  } catch (_) {
    return 'is not a valid pattern';
  }

  // A quantifier applied to a group that itself ends in a quantifier.
  if (/\([^)]*[+*]\s*\)\s*[+*]/.test(pattern)) {
    return 'has nested repetition (like "(a+)+") which can hang on some inputs — simplify it';
  }
  // Alternation of the same thing, then repeated: (a|a)*
  if (/\(([^)|]+)\|\1\)\s*[+*]/.test(pattern)) {
    return 'repeats an alternation of identical branches, which can hang on some inputs';
  }
  return null;
}

/**
 * Validate and normalise a category's field definitions.
 *
 * @param {unknown} fields
 * @returns {{ fields: object[], errors: {index: number|null, field: string, message: string}[] }}
 */
export function validateCategoryFields(fields) {
  const errors = [];

  if (!Array.isArray(fields)) {
    return { fields: [], errors: [{ index: null, field: 'fields', message: 'Fields must be a list.' }] };
  }
  if (fields.length > 100) {
    errors.push({ index: null, field: 'fields', message: 'A category can have at most 100 fields.' });
  }

  const seen = new Map();
  const clean = [];

  fields.forEach((raw, index) => {
    const problem = (field, message) => errors.push({ index, field, message });

    if (!raw || typeof raw !== 'object') {
      problem('field', 'Each field must be an object.');
      return;
    }

    const key = String(raw.key ?? '').trim();
    const label = String(raw.label ?? '').trim();
    const type = String(raw.type ?? 'text');

    // ── key ────────────────────────────────────────────────────────────────
    if (!key) {
      problem('key', 'Give the field a key.');
    } else if (!KEY_PATTERN.test(key)) {
      problem(
        'key',
        `"${key}" is not a valid key. Start with a lowercase letter, then letters, digits or underscores (up to 40).`
      );
    } else if (RESERVED_FIELD_KEYS.has(key) && !ALIASED_KEYS.has(key)) {
      problem('key', `"${key}" is reserved — a property already has a built-in field by that name. Pick another key.`);
    } else if (seen.has(key)) {
      problem('key', `"${key}" is used twice (fields ${seen.get(key) + 1} and ${index + 1}). Each key must be unique.`);
    } else {
      seen.set(key, index);
    }

    // ── label ──────────────────────────────────────────────────────────────
    if (!label) problem('label', 'Give the field a label — this is what your team sees.');
    else if (label.length > 100) problem('label', 'Label cannot exceed 100 characters.');

    // ── type ───────────────────────────────────────────────────────────────
    if (!FIELD_TYPES.includes(type)) {
      problem('type', `"${type}" is not a field type. Use one of: ${FIELD_TYPES.join(', ')}.`);
    }

    // ── select options ─────────────────────────────────────────────────────
    const options = Array.isArray(raw.options) ? raw.options.map((o) => String(o).trim()).filter(Boolean) : [];
    if (type === 'select') {
      if (options.length === 0) {
        problem('options', 'A dropdown needs at least one option, or nobody can fill it in.');
      } else if (options.length > 200) {
        problem('options', 'A dropdown can have at most 200 options.');
      } else if (new Set(options).size !== options.length) {
        problem('options', 'Two options are identical — remove the duplicate.');
      }
    }

    // ── numeric bounds ─────────────────────────────────────────────────────
    const min = raw.min === '' || raw.min === null ? undefined : raw.min;
    const max = raw.max === '' || raw.max === null ? undefined : raw.max;
    if (min !== undefined && Number.isNaN(Number(min))) problem('min', 'Minimum must be a number.');
    if (max !== undefined && Number.isNaN(Number(max))) problem('max', 'Maximum must be a number.');
    if (min !== undefined && max !== undefined && Number(min) > Number(max)) {
      problem('min', `Minimum (${min}) is above the maximum (${max}).`);
    }

    // ── pattern ────────────────────────────────────────────────────────────
    const patternProblem = checkPattern(raw.pattern);
    if (patternProblem) problem('pattern', `The format pattern ${patternProblem}.`);

    // ── conditional visibility ─────────────────────────────────────────────
    let showWhen = null;
    if (raw.showWhen && typeof raw.showWhen === 'object' && raw.showWhen.field) {
      const target = String(raw.showWhen.field);
      if (target === key) {
        problem('showWhen', 'A field cannot depend on itself.');
      } else {
        showWhen = {
          field: target,
          values: (Array.isArray(raw.showWhen.values) ? raw.showWhen.values : []).map(String),
        };
      }
    }

    clean.push({
      key,
      label,
      type: FIELD_TYPES.includes(type) ? type : 'text',
      required: Boolean(raw.required),
      options,
      description: String(raw.description ?? '').slice(0, 300),
      placeholder: String(raw.placeholder ?? '').slice(0, 200),
      defaultValue: raw.defaultValue,
      min: min === undefined ? undefined : Number(min),
      max: max === undefined ? undefined : Number(max),
      pattern: patternProblem ? '' : String(raw.pattern ?? ''),
      multiple: Boolean(raw.multiple),
      unit: String(raw.unit ?? '').slice(0, 30),
      group: String(raw.group ?? '').slice(0, 60),
      // Position comes from the order they were sent, so reordering in the UI
      // is what decides it rather than numbers an admin has to keep consistent.
      order: index,
      showWhen,
    });
  });

  // A dependency on a field that does not exist renders the dependent field
  // permanently invisible, which reads as "the form is broken".
  clean.forEach((field, index) => {
    if (field.showWhen && !seen.has(field.showWhen.field)) {
      errors.push({
        index,
        field: 'showWhen',
        message: `"${field.label || field.key}" only shows when "${field.showWhen.field}" has a value, but there is no field with that key.`,
      });
    }
  });

  return { fields: clean, errors };
}

/** One readable sentence from a validation result, for an API error. */
export function describeFieldErrors(errors) {
  return errors
    .map((e) => (e.index === null ? e.message : `Field ${e.index + 1}: ${e.message}`))
    .join(' ');
}

// Lives in its own module: importMapping.js needs it, and this file already
// imports importMapping.js.
export { isCategoryFieldActive } from './categoryVisibility.js';

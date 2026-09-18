/**
 * The field-definition rules, restated for the editor.
 *
 * The server is the authority — `backend/utils/categoryFields.js` checks all of
 * this and more, including patterns that could hang the process. This exists so
 * the obvious mistakes are answered as they are typed rather than on save,
 * which is the difference between an editor that feels like it is helping and
 * one that argues with you after the fact.
 *
 * Keep the key rules in step with the backend. If they drift, the server wins
 * and the admin sees a rejection the editor said was fine — annoying, but not
 * dangerous, which is the right way round for a duplicated rule.
 */

import { NATIVE_FIELD_ALIASES } from './nativeFieldAliases';

const KEY_PATTERN = /^[a-z][a-zA-Z0-9_]{0,39}$/;

/** Keys that collide with a real property column, or with prototype plumbing. */
export const RESERVED_FIELD_KEYS = new Set([
  '__proto__', 'constructor', 'prototype', 'toString', 'valueOf', 'hasOwnProperty',
  '_id', 'id', 'name', 'description', 'address', 'city', 'locality', 'state',
  'pincode', 'type', 'status', 'category', 'attributes', 'location',
  'regularPrice', 'discountPrice', 'offer', 'parking', 'furnished',
  'bedrooms', 'bathrooms', 'imageUrls', 'ownerIds', 'userRef', 'assignedAgent',
  'tenantId', 'isDeleted', 'deletedAt', 'createdAt', 'updatedAt', '__v',
  'propertyType', 'propertyCategory', 'commercialType', 'plotType',
]);

/**
 * Keys a category may legitimately use even though they name real columns —
 * this is the documented way a plot ledger surfaces `sqYard` or `propertyNo`
 * as its own field.
 */
// Derived, never restated: the backend does the same (utils/categoryFields.js),
// and a hand-kept second copy of this list drifts silently the first time an
// alias is added.
export const ALIASED_KEYS = new Set(Object.keys(NATIVE_FIELD_ALIASES));

/** Turn a label into a usable key. */
export function suggestKey(label) {
  const raw = String(label || '')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!raw) return '';
  const camel = raw
    .split('_')
    .map((part, i) => (i === 0 ? part.toLowerCase() : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()))
    .join('');
  // A key must start with a lowercase letter.
  return /^[a-z]/.test(camel) ? camel.slice(0, 40) : `f${camel}`.slice(0, 40);
}

/** What is wrong with one field, if anything — used for the inline hint. */
export function fieldProblem(field, index, allFields) {
  const key = String(field?.key ?? '').trim();
  const label = String(field?.label ?? '').trim();

  if (!key) return 'Give the field a key.';
  if (!KEY_PATTERN.test(key)) {
    return 'Key must start with a lowercase letter, then letters, digits or underscores.';
  }
  if (RESERVED_FIELD_KEYS.has(key) && !ALIASED_KEYS.has(key)) {
    return `"${key}" is reserved — a property already has a built-in field by that name.`;
  }
  const twin = allFields.findIndex((f, i) => i !== index && String(f?.key ?? '').trim() === key);
  if (twin !== -1) return `"${key}" is already used by field ${twin + 1}.`;

  if (!label) return 'Give the field a label — this is what your team sees.';

  if (field.type === 'select' && !(field.options || []).filter(Boolean).length) {
    return 'A dropdown needs at least one option, or nobody can fill it in.';
  }
  if (
    field.type === 'number' &&
    field.min !== undefined && field.min !== '' &&
    field.max !== undefined && field.max !== '' &&
    Number(field.min) > Number(field.max)
  ) {
    return `Minimum (${field.min}) is above the maximum (${field.max}).`;
  }
  if (field.pattern && /\([^)]*[+*]\s*\)\s*[+*]/.test(field.pattern)) {
    return 'That pattern has nested repetition, which can hang on some inputs.';
  }
  if (field.pattern) {
    try {
      new RegExp(field.pattern);
    } catch (_) {
      return 'That is not a valid format pattern.';
    }
  }
  if (field.showWhen?.field === key) return 'A field cannot depend on itself.';
  if (field.showWhen?.field && !allFields.some((f) => f.key === field.showWhen.field)) {
    return `This only shows when "${field.showWhen.field}" has a value, but no field has that key.`;
  }
  return null;
}

/** Every problem across the set, for the save guard. */
export function fieldProblems(fields) {
  return fields
    .map((field, index) => ({ index, message: fieldProblem(field, index, fields) }))
    .filter((p) => p.message);
}

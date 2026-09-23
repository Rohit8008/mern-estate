/**
 * Whether a category field applies to a record, given its other values.
 *
 * A field with `showWhen` exists only while the field it depends on holds one
 * of the listed values: "BHK type" for a flat, "Plot area" for a house. The
 * form already hid such fields, but every validator still required them, so a
 * flat was asked for the house-only fields it could not see, a house for the
 * flat-only ones, and four seeded categories could not be saved at all.
 *
 * `valueOf(key)` returns the record's value for a field key. The frontend
 * mirrors this in utils/categoryFieldRules.js.
 */
export function isCategoryFieldActive(field, valueOf) {
  if (!field?.showWhen?.field) return true;
  const current = valueOf(field.showWhen.field);
  const allowed = (field.showWhen.values || []).map(String);
  if (current === undefined || current === null || current === '') return false;
  if (Array.isArray(current)) return current.some((v) => allowed.includes(String(v)));
  return allowed.includes(String(current));
}

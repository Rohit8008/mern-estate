/**
 * Conditional category fields (showWhen) are only required when shown.
 *
 * Validation ignored showWhen, so a flat in "Residential for Sale" was asked
 * for the house-only Bedrooms / Floors / Plot area it could not see, a house
 * for the flat-only BHK type, and four seeded categories could not be saved
 * at all — through the form, the API or the Excel import.
 */
import { isCategoryFieldActive } from '../utils/categoryVisibility.js';

const FLAT_ONLY = { key: 'bhkType', required: true, showWhen: { field: 'propertyType', values: ['Apartment/Flat', 'Penthouse'] } };
const HOUSE_ONLY = { key: 'plotArea', required: true, showWhen: { field: 'propertyType', values: ['Independent House', 'Villa'] } };
const ALWAYS = { key: 'facing', required: true };

const valuesOf = (attrs) => (key) => attrs[key];

describe('isCategoryFieldActive', () => {
  it('keeps a field with no condition active', () => {
    expect(isCategoryFieldActive(ALWAYS, valuesOf({}))).toBe(true);
  });

  it('activates a conditional field only for the listed values', () => {
    const flat = valuesOf({ propertyType: 'Apartment/Flat' });
    expect(isCategoryFieldActive(FLAT_ONLY, flat)).toBe(true);
    expect(isCategoryFieldActive(HOUSE_ONLY, flat)).toBe(false);
  });

  it('treats a conditional field as inactive until its controlling field is set', () => {
    expect(isCategoryFieldActive(FLAT_ONLY, valuesOf({}))).toBe(false);
    expect(isCategoryFieldActive(FLAT_ONLY, valuesOf({ propertyType: '' }))).toBe(false);
  });

  it('matches multi-select values', () => {
    expect(isCategoryFieldActive(HOUSE_ONLY, valuesOf({ propertyType: ['Shop', 'Villa'] }))).toBe(true);
  });

  it('compares as strings, so numbers from a spreadsheet still match', () => {
    const field = { key: 'x', showWhen: { field: 'floors', values: ['2'] } };
    expect(isCategoryFieldActive(field, valuesOf({ floors: 2 }))).toBe(true);
  });
});

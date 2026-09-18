/**
 * Bulk-import mapping and coercion.
 *
 * These rules decide what a spreadsheet cell becomes in the database, so a
 * silent change here corrupts data rather than failing loudly. The cases below
 * are drawn from the formats real listing sheets use.
 */

import {
  toPrice,
  toNumber,
  toBoolean,
  toDate,
  autoMapHeaders,
  buildListingRow,
  dedupeKeyFor,
  NATIVE_FIELD_ALIASES,
} from '../utils/importMapping.js';

describe('toPrice', () => {
  it('reads Indian shorthand', () => {
    expect(toPrice('1.2 Cr')).toBe(12000000);
    expect(toPrice('2.5 crore')).toBe(25000000);
    expect(toPrice('85 Lakh')).toBe(8500000);
    expect(toPrice('85 lac')).toBe(8500000);
    expect(toPrice('45L')).toBe(4500000);
  });

  it('strips currency symbols and separators', () => {
    expect(toPrice('₹45,00,000')).toBe(4500000);
    expect(toPrice('Rs. 9500000')).toBe(9500000);
    expect(toPrice('Rs 45 Lakh')).toBe(4500000);
    expect(toPrice('9,500,000')).toBe(9500000);
  });

  it('returns null rather than 0 for unreadable input', () => {
    // 0 would look like a real "free" price on the board.
    expect(toPrice('on request')).toBeNull();
    expect(toPrice('')).toBeNull();
    expect(toPrice(null)).toBeNull();
  });
});

describe('toNumber', () => {
  it('ignores units and separators', () => {
    expect(toNumber('2,400 sq ft')).toBe(2400);
    expect(toNumber('250 gaj')).toBe(250);
    expect(toNumber('3 BHK')).toBe(3);
  });

  it('returns null for text with no digits', () => {
    expect(toNumber('n/a')).toBeNull();
  });
});

describe('toBoolean', () => {
  it('accepts the spellings people actually type', () => {
    ['Yes', 'y', 'TRUE', '1'].forEach((v) => expect(toBoolean(v)).toBe(true));
    ['No', 'n', 'false', '0', '-'].forEach((v) => expect(toBoolean(v)).toBe(false));
  });

  it('returns null when the cell says nothing either way', () => {
    expect(toBoolean('maybe')).toBeNull();
    expect(toBoolean('')).toBeNull();
  });
});

describe('toDate', () => {
  it('reads dd/mm/yyyy day-first, not month-first', () => {
    // The bug this guards: new Date('03/04/2026') is 4 March in JS, but every
    // sheet in this market means 3 April.
    expect(toDate('03/04/2026').toISOString()).toBe('2026-04-03T00:00:00.000Z');
    expect(toDate('15-08-2026').toISOString()).toBe('2026-08-15T00:00:00.000Z');
  });

  it('returns null for unparseable input', () => {
    expect(toDate('sometime next year')).toBeNull();
  });
});

describe('autoMapHeaders', () => {
  const categoryFields = [
    { key: 'facing', label: 'Facing', type: 'select', options: ['East', 'West'] },
    { key: 'propertyNo', label: 'Property No', type: 'text' },
  ];

  it('matches common header spellings to core fields', () => {
    const mapping = autoMapHeaders(['Property Name', 'Sector', 'Rate', 'City'], []);
    expect(mapping.map((m) => m.key)).toEqual(['name', 'locality', 'regularPrice', 'city']);
    expect(mapping.every((m) => m.target === 'core')).toBe(true);
  });

  it('prefers a category field over a core field of the same name', () => {
    const mapping = autoMapHeaders(['Facing', 'Property No'], categoryFields);
    expect(mapping[0]).toMatchObject({ target: 'attribute', key: 'facing' });
    expect(mapping[1]).toMatchObject({ target: 'attribute', key: 'propertyNo' });
  });

  it('ignores a column it does not recognise instead of inventing a field', () => {
    const mapping = autoMapHeaders(['Some Internal Ref'], []);
    expect(mapping[0]).toMatchObject({ target: 'ignore', key: null, confidence: 'none' });
  });

  it('does not map two columns onto the same core field', () => {
    const mapping = autoMapHeaders(['Price', 'Asking Price'], []);
    const priceCols = mapping.filter((m) => m.key === 'regularPrice');
    expect(priceCols).toHaveLength(1);
  });
});

describe('buildListingRow', () => {
  const category = {
    name: 'Plots',
    slug: 'plots',
    fields: [
      { key: 'facing', label: 'Facing', type: 'select', options: ['East', 'West'] },
      { key: 'khasra', label: 'Khasra no', type: 'text', required: true },
      { key: 'sqYard', label: 'Sq Yard', type: 'text' },
      { key: 'propertyNo', label: 'Property No', type: 'text' },
    ],
  };
  const headers = ['Property Name', 'Rate', 'Facing', 'Khasra No', 'Sq Yard', 'Property No'];
  const mapping = autoMapHeaders(headers, category.fields);

  const build = (row) => buildListingRow({ row, mapping, category, rowNumber: 2 });

  it('coerces values and keeps a clean row error-free', () => {
    const r = build(['Plot 214', '1.4 Cr', 'East', 'K-1180', '250', 'P-214']);
    expect(r.errors).toHaveLength(0);
    expect(r.values.name).toBe('Plot 214');
    expect(r.values.regularPrice).toBe(14000000);
    expect(r.attributes.facing).toBe('East');
    expect(r.attributes.khasra).toBe('K-1180');
  });

  it('writes aliased category fields to their real schema column, not to attributes', () => {
    // The listing form does the same; storing these as attributes would hide
    // them from area filters, sorting and duplicate detection.
    const r = build(['Plot 214', '1.4 Cr', 'East', 'K-1180', '250', 'P-214']);
    expect(r.values.sqYard).toBe(250);
    expect(r.values.propertyNo).toBe('P-214');
    expect(r.attributes.sqYard).toBeUndefined();
    expect(r.attributes.propertyNo).toBeUndefined();
    expect(NATIVE_FIELD_ALIASES.sqYard).toBe('sqYard');
  });

  it('rejects a row with no property name', () => {
    const r = build(['', '1.4 Cr', 'East', 'K-1180', '250', 'P-214']);
    expect(r.errors).toEqual([
      expect.objectContaining({ field: 'name' }),
    ]);
  });

  it('rejects a value outside a select field options', () => {
    const r = build(['Plot 216', '1.4 Cr', 'Northeast', 'K-1180', '250', 'P-216']);
    expect(r.errors.some((e) => e.field === 'facing')).toBe(true);
  });

  it('rejects a row missing a field the category marks required', () => {
    const r = build(['Plot 216', '1.4 Cr', 'East', '', '250', 'P-216']);
    expect(r.errors.some((e) => e.field === 'khasra')).toBe(true);
  });

  it('warns without failing when a price cannot be read', () => {
    const r = build(['Plot 217', 'call for price', 'East', 'K-1180', '250', 'P-217']);
    expect(r.errors).toHaveLength(0);
    expect(r.warnings.some((w) => w.field === 'regularPrice')).toBe(true);
    expect(r.values.regularPrice).toBeUndefined();
  });

  it('rejects an offer price at or above the asking price', () => {
    const withPrices = buildListingRow({
      row: ['Plot 218', '1 Cr', 'East', 'K-1', '100', 'P-218'],
      mapping: [
        ...mapping,
        { column: 6, target: 'core', key: 'discountPrice' },
      ],
      category,
      rowNumber: 2,
    });
    expect(withPrices.errors).toHaveLength(0);

    const bad = buildListingRow({
      row: ['Plot 218', '1 Cr', 'East', 'K-1', '100', 'P-218', '1.5 Cr'],
      mapping: [...mapping, { column: 6, target: 'core', key: 'discountPrice' }],
      category,
      rowNumber: 2,
    });
    expect(bad.errors.some((e) => e.field === 'discountPrice')).toBe(true);
  });

  it('only sets a location when both coordinates are present and in range', () => {
    const base = [...mapping, { column: 6, target: 'core', key: 'latitude' }, { column: 7, target: 'core', key: 'longitude' }];
    const ok = buildListingRow({
      row: ['P', '1 Cr', 'East', 'K-1', '100', 'P-1', '28.4089', '77.0507'],
      mapping: base, category, rowNumber: 2,
    });
    expect(ok.values.location).toEqual({ lat: 28.4089, lng: 77.0507 });

    const half = buildListingRow({
      row: ['P', '1 Cr', 'East', 'K-1', '100', 'P-1', '28.4089', ''],
      mapping: base, category, rowNumber: 2,
    });
    expect(half.values.location).toBeUndefined();
    expect(half.warnings.some((w) => w.field === 'location')).toBe(true);

    const bogus = buildListingRow({
      row: ['P', '1 Cr', 'East', 'K-1', '100', 'P-1', '999', '77.05'],
      mapping: base, category, rowNumber: 2,
    });
    expect(bogus.values.location).toBeUndefined();
  });
});

describe('dedupeKeyFor', () => {
  it('keys on property number when there is one', () => {
    expect(dedupeKeyFor({ propertyNo: 'P-214', name: 'Anything' }, 'plots')).toBe('no:plots:p-214');
  });

  it('falls back to name and address', () => {
    expect(dedupeKeyFor({ name: 'Plot 214', address: 'Block C' }, 'plots')).toBe('na:plots:plot 214|block c');
  });

  it('is case-insensitive, so re-uploading a re-typed sheet does not duplicate', () => {
    expect(dedupeKeyFor({ propertyNo: 'p-214' }, 'plots')).toBe(dedupeKeyFor({ propertyNo: 'P-214' }, 'plots'));
  });

  it('scopes to the category, so the same plot number in two projects is distinct', () => {
    expect(dedupeKeyFor({ propertyNo: 'P-1' }, 'green-city'))
      .not.toBe(dedupeKeyFor({ propertyNo: 'P-1' }, 'paris-city'));
  });
});

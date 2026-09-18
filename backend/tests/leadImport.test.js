/**
 * Importing portal enquiries from a spreadsheet.
 *
 * Indian agencies get their volume from 99acres, MagicBricks and Housing, and
 * every one of those exports enquiries as a CSV. This is the free path to
 * "portal integration" — no paid API and no partner agreement.
 *
 * The header rows below are the shapes those exports actually use, because an
 * importer that needs manual mapping every time is an importer nobody uses.
 */

import mongoose from 'mongoose';
import { registerTenancy } from '../tenancy/tenantPlugin.js';

let autoMapLeadHeaders, buildLeadRow, leadDedupeKey;

beforeAll(async () => {
  registerTenancy(mongoose);
  ({ autoMapLeadHeaders, buildLeadRow, leadDedupeKey } =
    await import('../utils/leadImportMapping.js'));
});

const mapOf = (headers) => autoMapLeadHeaders(headers);
const build = (headers, row) =>
  buildLeadRow({ row, mapping: mapOf(headers), rowNumber: 2 });

describe('recognising portal exports', () => {
  it('maps a 99acres-style header row with no help', () => {
    const mapping = mapOf(['Name', 'Mobile No', 'Email ID', 'Enquiry Date', 'Locality', 'Message']);
    expect(Object.values(mapping)).toEqual(
      expect.arrayContaining(['name', 'phone', 'email', 'enquiredAt', 'preferredLocations', 'requirements'])
    );
  });

  it('maps a MagicBricks-style header row', () => {
    const mapping = mapOf(['Customer Name', 'Contact Number', 'Email', 'Property Type', 'Budget']);
    expect(Object.values(mapping)).toEqual(
      expect.arrayContaining(['name', 'phone', 'email', 'propertyType', 'budgetMax'])
    );
  });

  it('is not confused by punctuation or case', () => {
    const mapping = mapOf(['FULL_NAME', 'mobile-number', 'E-Mail']);
    expect(Object.values(mapping)).toEqual(expect.arrayContaining(['name', 'phone', 'email']));
  });

  it('never assigns two columns to the same field', () => {
    // A sheet with both "Phone" and "Mobile" must not have one silently win
    // and overwrite the other.
    const mapping = mapOf(['Name', 'Phone', 'Mobile']);
    const keys = Object.values(mapping);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('ignores columns it does not recognise', () => {
    const mapping = mapOf(['Name', 'Phone', 'Internal Ref Code XYZ']);
    expect(Object.keys(mapping)).toHaveLength(2);
  });
});

describe('building a row', () => {
  const HEADERS = ['Name', 'Mobile', 'Email', 'Locality', 'Budget', 'Message'];

  it('parses a realistic row', () => {
    const { values, errors } = build(HEADERS, [
      'Anil Kumar', '+91 98765 43210', 'anil@example.com', 'Sector 57', '80 L', '3 BHK please',
    ]);

    expect(errors).toEqual([]);
    expect(values.name).toBe('Anil Kumar');
    expect(values.email).toBe('anil@example.com');
    expect(values.requirements).toBe('3 BHK please');
  });

  it('splits a multi-location cell into the array the model expects', () => {
    const { values } = build(HEADERS, ['A', '9876543210', '', 'Sector 57, Sushant Lok', '', '']);
    expect(values.preferredLocations).toEqual(['Sector 57', 'Sushant Lok']);
  });

  it('reads Indian price shorthand', () => {
    const { values } = build(HEADERS, ['A', '9876543210', '', '', '80 L', '']);
    expect(values.budget.max).toBe(8000000);
  });

  it('treats a bare "Budget" column as the ceiling, not the floor', () => {
    /*
     * "Budget: 80 L" on a portal enquiry means that is as far as the buyer
     * will go. Reading it as a minimum inverts the meaning AND costs the lead
     * its budget score, because calculateScore only rewards a stated ceiling —
     * so every imported portal lead scored as if it had given no budget and
     * came out cold.
     */
    const { values } = build(HEADERS, ['A', '9876543210', '', '', '80 L', '']);
    expect(values.budget).toEqual({ min: 0, max: 8000000 });
  });

  it('still honours an explicit min and max when the file gives both', () => {
    const headers = ['Name', 'Mobile', 'Min Budget', 'Max Budget'];
    const { values } = buildLeadRow({
      row: ['A', '9876543210', '50 L', '1 Cr'],
      mapping: mapOf(headers),
      rowNumber: 2,
    });
    expect(values.budget).toEqual({ min: 5000000, max: 10000000 });
  });

  it('requires a name and a phone', () => {
    const { errors } = build(HEADERS, ['', '', '', '', '', '']);
    expect(errors.join(' ')).toMatch(/Name is required/);
    expect(errors.join(' ')).toMatch(/Phone is required/);
  });

  it('rejects a phone nobody could dial', () => {
    // A lead nobody can contact is worse than no lead: it pollutes the dedupe
    // index and shows up as work that was never doable.
    const { errors } = build(HEADERS, ['Anil', '12345', '', '', '', '']);
    expect(errors.join(' ')).toMatch(/not a usable phone number/);
  });

  it('names the row, so a 400-row file can be corrected', () => {
    const { errors } = buildLeadRow({ row: ['', ''], mapping: mapOf(['Name', 'Phone']), rowNumber: 57 });
    expect(errors.every((e) => e.startsWith('Row 57:'))).toBe(true);
  });
});

describe('dedupe key', () => {
  it.each([
    ['+91 98765 43210', '9876543210'],
    ['098765 43210',    '9876543210'],
    ['98765-43210',     '9876543210'],
    ['919876543210',    '9876543210'],
  ])('%s and its variants collapse to the same key', (phone, expected) => {
    expect(leadDedupeKey({ phone })).toBe(expected);
  });

  it('gives different people different keys', () => {
    expect(leadDedupeKey({ phone: '9876543210' })).not.toBe(leadDedupeKey({ phone: '9876543211' }));
  });

  it('returns a short string rather than throwing on junk', () => {
    expect(leadDedupeKey({ phone: 'n/a' })).toBe('');
    expect(leadDedupeKey({})).toBe('');
  });
});

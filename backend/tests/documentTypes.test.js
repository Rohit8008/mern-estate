/**
 * Category document types, and the rule that nothing is published by accident.
 *
 * A colony carries paperwork buyers ask for by name — the RERA registration,
 * the sanctioned layout — alongside photographs that sell it. Two things have
 * to hold: the type must constrain what the file can actually be, and
 * publishing must be a decision rather than a default.
 */

import {
  CATEGORY_DOC_TYPES,
  CATEGORY_DOC_TYPE_IDS,
  DEFAULT_PUBLIC,
  getCategoryDocType,
  checkFileForType,
} from '../utils/documentTypes.js';

describe('the catalogue', () => {
  it('has no duplicate ids', () => {
    expect(new Set(CATEGORY_DOC_TYPE_IDS).size).toBe(CATEGORY_DOC_TYPE_IDS.length);
  });

  it('covers what a colony actually has paperwork for', () => {
    ['rera', 'layout', 'approval', 'brochure', 'image', 'other'].forEach((id) => {
      expect(getCategoryDocType(id)).not.toBeNull();
    });
  });

  it('gives every type a label and a description', () => {
    CATEGORY_DOC_TYPES.forEach((t) => {
      expect(t.label).toBeTruthy();
      expect(t.description.length).toBeGreaterThan(10);
      expect(['image', 'document', 'both']).toContain(t.accepts);
    });
  });

  it('returns null for a type that does not exist', () => {
    expect(getCategoryDocType('invented')).toBeNull();
  });
});

describe('nothing is public by default', () => {
  it('defaults to private', () => {
    // An approval letter naming individuals, or a brochure with stale pricing,
    // must not become public because a default said so.
    expect(DEFAULT_PUBLIC).toBe(false);
  });

  it('treats suggestPublic as a hint for the form, not a decision', () => {
    // The upload form pre-ticks this; the server never applies it. A type
    // suggesting publication is a convenience, and the admin still chooses.
    const suggested = CATEGORY_DOC_TYPES.filter((t) => t.suggestPublic);
    expect(suggested.length).toBeGreaterThan(0);
    expect(DEFAULT_PUBLIC).toBe(false);
  });

  it('does not suggest publishing an approval letter', () => {
    // These routinely name individuals and carry internal correspondence.
    expect(getCategoryDocType('approval').suggestPublic).toBe(false);
    expect(getCategoryDocType('other').suggestPublic).toBe(false);
  });
});

describe('the type constrains the file', () => {
  it('refuses a photograph as a RERA certificate', () => {
    expect(checkFileForType('rera', 'image/png')).toMatch(/PDF or an Office document/);
  });

  it('refuses a PDF as a photograph', () => {
    expect(checkFileForType('image', 'application/pdf')).toMatch(/must be a photo/);
  });

  it('accepts a PDF as a RERA certificate', () => {
    expect(checkFileForType('rera', 'application/pdf')).toBeNull();
  });

  it('accepts a photo as a photograph', () => {
    ['image/jpeg', 'image/png', 'image/webp'].forEach((mime) => {
      expect(checkFileForType('image', mime)).toBeNull();
    });
  });

  it('lets a layout be either — plans arrive as PDFs and as scans', () => {
    expect(checkFileForType('layout', 'application/pdf')).toBeNull();
    expect(checkFileForType('layout', 'image/jpeg')).toBeNull();
  });

  it('refuses a type that does not exist rather than letting it through', () => {
    expect(checkFileForType('nonsense', 'application/pdf')).toMatch(/not a document type/);
  });

  it('says what to do instead when a certificate is only a photo', () => {
    // The common real case: someone photographs the certificate on their desk.
    expect(checkFileForType('rera', 'image/jpeg')).toMatch(/Other document/);
  });
});

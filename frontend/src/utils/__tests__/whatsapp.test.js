/**
 * Turning what an agency typed into a number WhatsApp will accept.
 *
 * This is worth testing precisely because the failure is silent: given a local
 * number, wa.me opens an empty chat with no error at all. The agent sees a
 * blank screen and concludes the CRM is broken. Every case below is a shape an
 * Indian agency actually types into a phone field.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setLocaleConfig } from '../currency';
import { toInternational, canWhatsApp, whatsappHref, renderMessage } from '../whatsapp';

beforeEach(() => {
  setLocaleConfig({ dialCode: '91', currency: 'INR', numberLocale: 'en-IN' });
});

describe('toInternational', () => {
  it.each([
    ['9876543210',        '919876543210', 'bare local number'],
    ['98765 43210',       '919876543210', 'spaced'],
    ['+91 98765 43210',   '919876543210', 'already international with plus'],
    ['919876543210',      '919876543210', 'already international, no plus'],
    ['098765 43210',      '919876543210', 'national trunk prefix'],
    ['0091 98765 43210',  '919876543210', 'international 00 prefix'],
    ['(98765) 43210',     '919876543210', 'brackets'],
    ['98765-43210',       '919876543210', 'dashes'],
  ])('%s → %s (%s)', (input, expected) => {
    expect(toInternational(input)).toBe(expected);
  });

  it.each([
    [''],
    [null],
    [undefined],
    ['abc'],
    ['12345'],      // too short to be real
    ['---'],
  ])('refuses %s rather than opening an empty chat', (input) => {
    expect(toInternational(input)).toBeNull();
  });

  it('follows the workspace dial code', () => {
    setLocaleConfig({ dialCode: '44' });
    expect(toInternational('7911 123456')).toBe('447911123456');
  });

  it('takes an explicit dial code over the workspace default', () => {
    expect(toInternational('7911123456', '44')).toBe('447911123456');
  });

  it('does not double-prefix a number that already has the code', () => {
    expect(toInternational('919876543210')).toBe('919876543210');
    expect(toInternational('919876543210')).not.toContain('9191');
  });
});

describe('canWhatsApp', () => {
  it('is true for a usable number', () => {
    expect(canWhatsApp('9876543210')).toBe(true);
  });

  it('is false for junk, so the button can be disabled', () => {
    expect(canWhatsApp('')).toBe(false);
    expect(canWhatsApp('n/a')).toBe(false);
  });
});

describe('whatsappHref', () => {
  it('builds a click-to-chat link', () => {
    expect(whatsappHref('9876543210')).toBe('https://wa.me/919876543210');
  });

  it('encodes the prefilled message', () => {
    const href = whatsappHref('9876543210', 'Hi Anil, 3 BHK & parking?');
    expect(href).toContain('https://wa.me/919876543210?text=');
    expect(href).toContain('%26');            // & survived encoding
    expect(href).not.toContain(' ');          // no raw spaces
  });

  it('survives newlines and non-ASCII', () => {
    const href = whatsappHref('9876543210', 'नमस्ते\nदूसरी पंक्ति');
    expect(href).toContain('%0A');
    expect(() => new URL(href)).not.toThrow();
  });

  it('returns null for an unusable number so callers can skip the button', () => {
    expect(whatsappHref('', 'hello')).toBeNull();
  });
});

describe('renderMessage', () => {
  it('fills placeholders', () => {
    expect(renderMessage('Hi {{name}}, about {{property}}', { name: 'Anil', property: 'Plot 12' }))
      .toBe('Hi Anil, about Plot 12');
  });

  it('leaves an unknown placeholder visible, so a typo is obvious', () => {
    expect(renderMessage('Hi {{nmae}}', { name: 'Anil' })).toBe('Hi {{nmae}}');
  });

  it('renders an empty value as empty rather than "undefined"', () => {
    expect(renderMessage('Hi {{name}}', { name: undefined })).toBe('Hi ');
  });

  it('tolerates spacing inside the braces', () => {
    expect(renderMessage('Hi {{ name }}', { name: 'Anil' })).toBe('Hi Anil');
  });
});

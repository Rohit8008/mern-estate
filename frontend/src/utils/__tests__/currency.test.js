/**
 * Money, numbers and area follow the workspace, not a hardcoded locale.
 *
 * Every formatter in the product used to be a module-level constant pinned to
 * `en-IN`/`INR`, so a workspace could set its currency, number locale and area
 * unit in Settings and every screen still rendered rupees and square yards —
 * the settings round-tripped to the database and were read by nothing.
 *
 * The area-unit case is the sharpest: the listing form used a two-way ternary
 * (`sqft ? 'sq ft' : 'sq yard'`), so four of the six enum values silently
 * displayed and stored as square yards.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  setLocaleConfig,
  getLocaleConfig,
  formatCurrency,
  formatNumber,
  formatCompactCurrency,
  formatListingPrice,
  currencySymbol,
  areaUnit,
  areaUnitLabel,
  formatArea,
  isPlaceholderPrice,
  PLACEHOLDER_PRICE,
  AREA_UNITS,
} from '../currency';

/** Intl output varies by ICU build, so assert on substance, not exact glyphs. */
const digitsOf = (text) => text.replace(/[^\d]/g, '');

beforeEach(() => {
  setLocaleConfig({ currency: 'INR', numberLocale: 'en-IN', areaUnit: 'sqyard', timezone: 'Asia/Kolkata' });
});

describe('locale configuration', () => {
  it('starts on the Indian defaults the tenant model declares', () => {
    expect(getLocaleConfig()).toMatchObject({ currency: 'INR', numberLocale: 'en-IN' });
  });

  it('follows the workspace to another currency', () => {
    setLocaleConfig({ currency: 'USD', numberLocale: 'en-US' });
    expect(getLocaleConfig().currency).toBe('USD');
    expect(formatCurrency(1000)).toContain('$');
  });

  it('falls back rather than throwing on a nonsense currency code', () => {
    setLocaleConfig({ currency: 'NOT-A-CODE', numberLocale: 'en-IN' });
    expect(() => formatCurrency(1000)).not.toThrow();
    expect(digitsOf(formatCurrency(1000))).toBe('1000');
  });

  it('falls back rather than throwing on a nonsense locale', () => {
    setLocaleConfig({ currency: 'INR', numberLocale: 'zz-ZZ-nonsense' });
    expect(() => formatNumber(1234)).not.toThrow();
  });
});

describe('formatCurrency', () => {
  it('renders the amount', () => {
    expect(digitsOf(formatCurrency(1234))).toBe('1234');
  });

  it('treats a null amount as zero rather than rendering NaN', () => {
    expect(formatCurrency(null)).not.toMatch(/NaN/);
    expect(digitsOf(formatCurrency(null))).toBe('0');
  });

  it('uses the symbol for the configured currency', () => {
    setLocaleConfig({ currency: 'EUR', numberLocale: 'de-DE' });
    expect(formatCurrency(10)).toContain('€');
  });
});

describe('currencySymbol', () => {
  it('matches the symbol the amounts themselves use', () => {
    setLocaleConfig({ currency: 'USD', numberLocale: 'en-US' });
    expect(formatCurrency(1)).toContain(currencySymbol());
  });

  it('follows a currency change', () => {
    setLocaleConfig({ currency: 'GBP', numberLocale: 'en-GB' });
    expect(currencySymbol()).toBe('£');
  });
});

describe('formatCompactCurrency', () => {
  it('uses crore for large Indian amounts', () => {
    expect(formatCompactCurrency(25_000_000)).toMatch(/Cr/);
  });

  it('uses lakh for mid-size Indian amounts', () => {
    expect(formatCompactCurrency(500_000)).toMatch(/L/);
  });

  it('does not abbreviate a small amount', () => {
    expect(formatCompactCurrency(5000)).not.toMatch(/Cr|L$/);
  });

  it('does not use lakh or crore outside the Indian locale', () => {
    // 1.2 Cr and 12M are the same number written for different readers.
    setLocaleConfig({ currency: 'USD', numberLocale: 'en-US' });
    const result = formatCompactCurrency(12_000_000);
    expect(result).not.toMatch(/Cr|L\b/);
  });
});

describe('formatListingPrice', () => {
  it('says "price on request" for the import sentinel', () => {
    expect(formatListingPrice(PLACEHOLDER_PRICE)).toBe('Price on request');
    expect(isPlaceholderPrice(PLACEHOLDER_PRICE)).toBe(true);
  });

  it('formats a real price normally', () => {
    expect(digitsOf(formatListingPrice(7_500_000))).toBe('7500000');
  });

  // 0 is the form's "no price entered", so a listing never shows "₹0"; the
  // plain currency formatter still prints zero for totals and the like.
  it('treats an unset (zero) listing price as price on request', () => {
    expect(formatListingPrice(0)).toBe('Price on request');
    expect(formatCurrency(0)).not.toBe('Price on request');
  });
});

describe('area units', () => {
  it('handles all six values the tenant model allows', () => {
    // The bug: a two-way ternary meant sqm, acre, cent and guntha all rendered
    // as "sq yard".
    for (const unit of Object.keys(AREA_UNITS)) {
      setLocaleConfig({ areaUnit: unit });
      expect(areaUnit().label).toBe(AREA_UNITS[unit].label);
      expect(areaUnitLabel()).not.toBe(undefined);
    }
  });

  it('distinguishes square metres from square yards', () => {
    setLocaleConfig({ areaUnit: 'sqm' });
    expect(areaUnitLabel()).toBe('sq m');

    setLocaleConfig({ areaUnit: 'sqyard' });
    expect(areaUnitLabel()).toBe('sq yard');
  });

  it('falls back to the default for an unknown unit', () => {
    setLocaleConfig({ areaUnit: 'furlongs' });
    expect(areaUnitLabel()).toBe('sq yard');
  });

  it('formats an area with the workspace unit', () => {
    setLocaleConfig({ areaUnit: 'sqft' });
    expect(formatArea(1200)).toMatch(/sq ft$/);
  });

  it('carries a sane square-foot conversion for each unit', () => {
    expect(AREA_UNITS.sqft.inSqft).toBe(1);
    expect(AREA_UNITS.sqyard.inSqft).toBe(9);
    expect(AREA_UNITS.acre.inSqft).toBe(43560);
    for (const unit of Object.values(AREA_UNITS)) {
      expect(unit.inSqft).toBeGreaterThan(0);
    }
  });
});

describe('formatNumber', () => {
  it('groups digits', () => {
    expect(digitsOf(formatNumber(1234567))).toBe('1234567');
  });

  it('treats null as zero', () => {
    expect(digitsOf(formatNumber(null))).toBe('0');
  });
});

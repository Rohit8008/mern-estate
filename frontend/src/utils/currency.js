/**
 * Money and measurement, in the workspace's own terms.
 *
 * These formatters used to be module-level constants pinned to `en-IN`/`INR`,
 * so a workspace could set its currency, number locale and area unit in
 * Settings and every price on every screen still rendered as rupees. The
 * settings round-tripped to the database and were read by nothing.
 *
 * The locale is pushed in by TenantProvider when the workspace config lands
 * (`setLocaleConfig`), rather than pulled from React context, because most of
 * the call sites are plain functions in table cells and CSV builders rather
 * than components. `useTenantLocale()` remains for components that want to
 * react to a change.
 */

// Sentinel value used for listings imported without real price data (see backend import scripts).
export const PLACEHOLDER_PRICE = 1;

export function isPlaceholderPrice(amount) {
  return Number(amount) === PLACEHOLDER_PRICE;
}

/** Matches the tenant model's locale defaults, for use before config arrives. */
const DEFAULTS = {
  currency: 'INR',
  numberLocale: 'en-IN',
  areaUnit: 'sqyard',
  dateFormat: 'dd/MM/yyyy',
  timezone: 'Asia/Kolkata',
  // Country dialling code without the plus. Used to turn the local numbers
  // agencies type into the international form WhatsApp requires.
  dialCode: '91',
};

let current = { ...DEFAULTS };

/** Built formatters are cached: Intl.NumberFormat construction is not free. */
const formatterCache = new Map();

function cacheKey(kind, options) {
  return `${kind}|${current.numberLocale}|${current.currency}|${JSON.stringify(options || {})}`;
}

function currencyFormatter(options) {
  const key = cacheKey('currency', options);
  if (!formatterCache.has(key)) {
    let formatter;
    try {
      formatter = new Intl.NumberFormat(current.numberLocale, {
        style: 'currency',
        currency: current.currency,
        maximumFractionDigits: 0,
        ...options,
      });
    } catch {
      // An unknown locale or currency code must not take every price on the
      // screen down with it.
      formatter = new Intl.NumberFormat(DEFAULTS.numberLocale, {
        style: 'currency',
        currency: DEFAULTS.currency,
        maximumFractionDigits: 0,
        ...options,
      });
    }
    formatterCache.set(key, formatter);
  }
  return formatterCache.get(key);
}

function numberFormatter(options) {
  const key = cacheKey('number', options);
  if (!formatterCache.has(key)) {
    let formatter;
    try {
      formatter = new Intl.NumberFormat(current.numberLocale, options);
    } catch {
      formatter = new Intl.NumberFormat(DEFAULTS.numberLocale, options);
    }
    formatterCache.set(key, formatter);
  }
  return formatterCache.get(key);
}

/** Called by TenantProvider once the workspace config is known. */
export function setLocaleConfig(locale) {
  if (!locale) return;
  const next = {
    currency: locale.currency || DEFAULTS.currency,
    numberLocale: locale.numberLocale || DEFAULTS.numberLocale,
    areaUnit: locale.areaUnit || DEFAULTS.areaUnit,
    dateFormat: locale.dateFormat || DEFAULTS.dateFormat,
    timezone: locale.timezone || DEFAULTS.timezone,
    dialCode: locale.dialCode || DEFAULTS.dialCode,
  };

  const changed = Object.keys(next).some((k) => next[k] !== current[k]);
  if (!changed) return;

  current = next;
  formatterCache.clear();
  // Screens holding already-formatted strings re-render on this.
  window.dispatchEvent(new CustomEvent('locale:update'));
}

/** The active locale, for components that need the raw values. */
export function getLocaleConfig() {
  return { ...current };
}

/** A price, in the workspace's currency. */
export function formatCurrency(amount, options) {
  return currencyFormatter(options).format(Number(amount) || 0);
}

/** A plain number, grouped the way the workspace expects. */
export function formatNumber(value, options) {
  return numberFormatter(options).format(Number(value) || 0);
}

// Formats a Listing's regularPrice/discountPrice for display, showing
// "Price on request" for listings imported without real price data.
export function formatListingPrice(amount) {
  // 0 / empty is "no price entered" (the form's default), not a price of ₹0.
  if (isPlaceholderPrice(amount) || !Number(amount)) return 'Price on request';
  return formatCurrency(amount);
}

/**
 * Short forms for dashboards, where a full figure would not fit.
 *
 * Indian numbering groups by lakh and crore rather than by thousand, so the
 * abbreviation has to follow the locale and not just divide by 1000 — 1.2 Cr
 * and 12M are the same number written for different readers.
 */
export function formatCompactCurrency(amount) {
  const value = Number(amount) || 0;
  const abs = Math.abs(value);

  if (current.numberLocale === 'en-IN') {
    // minimumFractionDigits 0: the currency's default two decimals printed
    // "₹30.00 L"; the short form should read "₹30 L", "₹1.5 Cr".
    // A no-break space: "₹1.16 L" wrapped in narrow cards and left the "L"
    // alone on the next line.
    if (abs >= 1e7) return `${formatCurrency(value / 1e7, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}\u00A0Cr`;
    if (abs >= 1e5) return `${formatCurrency(value / 1e5, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}\u00A0L`;
    return formatCurrency(value);
  }

  try {
    return new Intl.NumberFormat(current.numberLocale, {
      style: 'currency',
      currency: current.currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return formatCurrency(value);
  }
}

/** How the workspace writes each area unit, and what one unit is in square feet. */
export const AREA_UNITS = {
  sqft:    { label: 'sq ft',   short: 'sq ft',  inSqft: 1 },
  sqyard:  { label: 'sq yard', short: 'sq yd',  inSqft: 9 },
  sqm:     { label: 'sq m',    short: 'm²',     inSqft: 10.7639 },
  acre:    { label: 'acre',    short: 'ac',     inSqft: 43560 },
  cent:    { label: 'cent',    short: 'cent',   inSqft: 435.6 },
  guntha:  { label: 'guntha',  short: 'guntha', inSqft: 1089 },
};

/**
 * The workspace's area unit.
 *
 * All six enum values are handled. The listing form used a two-way ternary
 * (`sqft ? 'sq ft' : 'sq yard'`), so a workspace set to sqm, acre, cent or
 * guntha silently displayed "sq yard".
 */
export function areaUnit() {
  return AREA_UNITS[current.areaUnit] || AREA_UNITS[DEFAULTS.areaUnit];
}

export function areaUnitLabel() {
  return areaUnit().label;
}

export function formatArea(value, { short = true } = {}) {
  const unit = areaUnit();
  return `${formatNumber(value)} ${short ? unit.short : unit.label}`;
}

/** A date, written the way the workspace writes dates. */
export function formatDate(value, options) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  try {
    return new Intl.DateTimeFormat(current.numberLocale, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: current.timezone,
      ...options,
    }).format(date);
  } catch {
    return date.toLocaleDateString();
  }
}

/**
 * Just the currency symbol, for form labels like "Budget Min (₹)".
 *
 * Derived from the formatter rather than kept as a second table, so it cannot
 * disagree with what the amounts themselves render as.
 */
export function currencySymbol() {
  try {
    const parts = currencyFormatter().formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value || current.currency;
  } catch {
    return current.currency;
  }
}

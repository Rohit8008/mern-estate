/**
 * Shared column-mapping and value-coercion rules for listing bulk import.
 *
 * Both the preview (dry run) and the commit path build rows through
 * `buildListingRow` here, so what an admin approves on screen is byte-for-byte
 * what gets written. Anything that reads a spreadsheet cell belongs in this
 * file — nowhere else.
 */

import { isCategoryFieldActive } from './categoryVisibility.js';

// ─── Value coercion ───────────────────────────────────────────────────────────

const CRORE = 10000000;
const LAKH = 100000;

/**
 * Parse the price formats that actually turn up in Indian property sheets:
 *   "1.2 Cr" · "85 Lakh" · "45L" · "₹45,00,000" · "Rs. 9500000" · "9,500,000"
 * Returns a whole number of rupees, or null when nothing numeric is present.
 */
export function toPrice(input) {
  if (input === null || input === undefined || input === '') return null;
  if (typeof input === 'number') return Number.isFinite(input) ? Math.round(input) : null;

  const raw = String(input).trim();
  if (!raw) return null;

  // Strip currency symbols, the word "rupees", thousands separators and spaces.
  const cleaned = raw
    .replace(/[₹$]/g, '')
    .replace(/^rs\.?\s*/i, '')
    .replace(/\brupees?\b/gi, '')
    .replace(/,/g, '')
    .trim();

  const crore = cleaned.match(/^(-?\d+(?:\.\d+)?)\s*(cr|crore|crores)\b/i);
  if (crore) return Math.round(parseFloat(crore[1]) * CRORE);

  const lakh = cleaned.match(/^(-?\d+(?:\.\d+)?)\s*(l|lac|lacs|lakh|lakhs)\b/i);
  if (lakh) return Math.round(parseFloat(lakh[1]) * LAKH);

  // Bare "45L" / "1.2C" with no word boundary after the suffix.
  const shorthand = cleaned.match(/^(-?\d+(?:\.\d+)?)\s*([lc])$/i);
  if (shorthand) {
    return Math.round(parseFloat(shorthand[1]) * (shorthand[2].toLowerCase() === 'c' ? CRORE : LAKH));
  }

  const plain = parseFloat(cleaned);
  return Number.isFinite(plain) ? Math.round(plain) : null;
}

/** Parse a number, tolerating units and separators ("2,400 sq ft" → 2400). */
export function toNumber(input) {
  if (input === null || input === undefined || input === '') return null;
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;

  const match = String(input).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = parseFloat(match[0]);
  return Number.isFinite(n) ? n : null;
}

export function toInteger(input) {
  const n = toNumber(input);
  return n === null ? null : Math.round(n);
}

const TRUTHY = new Set(['true', 'yes', 'y', '1', 'available', 'furnished', 'have', 'haan']);
const FALSY = new Set(['false', 'no', 'n', '0', 'none', 'nil', 'na', 'n/a', '-']);

/** Returns true/false, or null when the cell says nothing either way. */
export function toBoolean(input) {
  if (input === null || input === undefined || input === '') return null;
  if (typeof input === 'boolean') return input;
  const s = String(input).trim().toLowerCase();
  if (!s) return null;
  if (TRUTHY.has(s)) return true;
  if (FALSY.has(s)) return false;
  return null;
}

/**
 * Parse a date. Spreadsheets in this market are overwhelmingly dd/mm/yyyy, and
 * `new Date('03/04/2026')` would silently read that as 4 March — so the
 * day-first forms are matched explicitly before falling back to Date parsing.
 */
export function toDate(input) {
  if (input === null || input === undefined || input === '') return null;
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;

  const s = String(input).trim();
  if (!s) return null;

  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (dmy) {
    let [, d, m, y] = dmy;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    const dt = new Date(Date.UTC(year, Number(m) - 1, Number(d)));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function toText(input) {
  if (input === null || input === undefined) return '';
  return String(input).trim().replace(/\s+/g, ' ');
}

// ─── Core field catalogue ─────────────────────────────────────────────────────

/**
 * The listing fields an import may target, with the header spellings seen in
 * the wild. `synonyms` drive auto-mapping; they are matched against a
 * normalized header (lowercased, punctuation stripped).
 */
export const CORE_IMPORT_FIELDS = [
  { key: 'name', label: 'Property name', kind: 'text', required: true, example: 'Plot 214, Sector 57',
    synonyms: ['name', 'property name', 'title', 'property', 'property title', 'unit name'] },
  { key: 'propertyNo', label: 'Property / plot no.', kind: 'text', example: 'P-214',
    synonyms: ['property no', 'property number', 'plot no', 'plot number', 'unit no', 'unit number', 'flat no', 'khasra no', 'id', 'ref', 'reference'] },
  { key: 'address', label: 'Address', kind: 'text', example: 'Block C, Sushant Lok Phase 1',
    synonyms: ['address', 'full address', 'location', 'site address', 'street'] },
  { key: 'areaName', label: 'Area / colony', kind: 'text', example: 'Sushant Lok',
    synonyms: ['area', 'area name', 'colony', 'society', 'project', 'project name', 'block'] },
  { key: 'locality', label: 'Locality / sector', kind: 'text', example: 'Sector 57',
    synonyms: ['locality', 'sector', 'sub area', 'neighbourhood', 'neighborhood'] },
  { key: 'city', label: 'City', kind: 'text', example: 'Gurugram',
    synonyms: ['city', 'town', 'district'] },
  { key: 'state', label: 'State', kind: 'text', example: 'Haryana',
    synonyms: ['state', 'province'] },
  { key: 'pincode', label: 'Pincode', kind: 'text', example: '122011',
    synonyms: ['pincode', 'pin code', 'pin', 'postal code', 'zip', 'zipcode'] },
  { key: 'regularPrice', label: 'Price', kind: 'price', example: '1.4 Cr',
    synonyms: ['price', 'regular price', 'asking price', 'rate', 'amount', 'expected price', 'cost', 'value', 'demand'] },
  { key: 'discountPrice', label: 'Offer price', kind: 'price', example: '1.3 Cr',
    synonyms: ['discount price', 'offer price', 'negotiated price', 'final price', 'discounted'] },
  { key: 'totalValue', label: 'Total value', kind: 'price', example: '1.4 Cr',
    synonyms: ['total value', 'total amount', 'total', 'deal value'] },
  { key: 'sqYardRate', label: 'Rate per sq. yard', kind: 'price', example: '55000',
    synonyms: ['rate per sq yard', 'rate sq yard', 'rate/sq yard', 'per yard rate', 'yard rate', 'rate per gaj'] },
  { key: 'sqYard', label: 'Area (sq. yard)', kind: 'number', example: '250',
    synonyms: ['sq yard', 'sqyard', 'square yard', 'yards', 'gaj', 'area sq yard', 'plot area yard'] },
  { key: 'areaSqFt', label: 'Area (sq. ft)', kind: 'number', example: '2250',
    synonyms: ['area sqft', 'sq ft', 'sqft', 'square feet', 'built up area', 'builtup area', 'carpet area', 'super area', 'area'] },
  { key: 'plotSize', label: 'Plot size', kind: 'text', example: '30x50',
    synonyms: ['plot size', 'size', 'dimensions', 'dimension', 'plot dimension'] },
  { key: 'bedrooms', label: 'Bedrooms', kind: 'integer', example: '3',
    synonyms: ['bedrooms', 'bedroom', 'bhk', 'beds', 'no of bedrooms', 'bed'] },
  { key: 'bathrooms', label: 'Bathrooms', kind: 'integer', example: '3',
    synonyms: ['bathrooms', 'bathroom', 'baths', 'washrooms', 'toilets', 'bath'] },
  { key: 'type', label: 'Listing type', kind: 'enum', example: 'sale',
    options: ['sale', 'rent', 'lease'],
    synonyms: ['type', 'listing type', 'for', 'sale rent', 'transaction type', 'deal type'] },
  { key: 'status', label: 'Status', kind: 'enum', example: 'available',
    options: ['available', 'sold', 'rented', 'under_negotiation'],
    synonyms: ['status', 'availability', 'current status', 'stage'] },
  { key: 'furnished', label: 'Furnished', kind: 'boolean', example: 'Yes',
    synonyms: ['furnished', 'furnishing', 'is furnished'] },
  { key: 'parking', label: 'Parking', kind: 'boolean', example: 'Yes',
    synonyms: ['parking', 'car parking', 'has parking'] },
  { key: 'offer', label: 'On offer', kind: 'boolean', example: 'No',
    synonyms: ['offer', 'on offer', 'discounted', 'is offer'] },
  { key: 'description', label: 'Description', kind: 'text', example: 'East-facing corner plot',
    synonyms: ['description', 'details', 'about', 'notes'] },
  { key: 'remarks', label: 'Remarks', kind: 'text', example: 'Owner open to negotiation',
    synonyms: ['remarks', 'remark', 'comment', 'comments', 'internal notes'] },
  { key: 'latitude', label: 'Latitude', kind: 'number', example: '28.4089',
    synonyms: ['latitude', 'lat'] },
  { key: 'longitude', label: 'Longitude', kind: 'number', example: '77.0507',
    synonyms: ['longitude', 'lng', 'lon', 'long'] },
];

const CORE_BY_KEY = new Map(CORE_IMPORT_FIELDS.map((f) => [f.key, f]));

/**
 * Some categories declare fields that are really aliases for real, indexed
 * columns on the Listing schema — plot ledgers in this product define
 * "Property No", "Sq Yard" and friends as category fields even though the
 * schema already has typed columns for them.
 *
 * The listing form (frontend/src/utils/nativeFieldAliases.js) writes those to
 * the column and NOT to `attributes`, so the import has to do the same. Storing
 * them as attributes instead would leave the value invisible to price/area
 * filters, to sorting, and to duplicate detection — which matches on the
 * `propertyNo` column.
 *
 * Keep this table in step with the frontend's.
 */
export const NATIVE_FIELD_ALIASES = {
  // Null prototype: this object is used as a lookup keyed by user-supplied
  // field keys, and a normal object would resolve `__proto__`, `constructor`
  // and `toString` to inherited values instead of to nothing — turning a field
  // called `__proto__` into a write against `values[Object.prototype]`.
  __proto__: null,
  sqYard: 'sqYard',
  rateSqYard: 'sqYardRate',
  totalValue: 'totalValue',
  propertyNo: 'propertyNo',
  plotSize: 'plotSize',
  remarks: 'remarks',
  areaName: 'areaName',
};

/** How each aliased column is stored, regardless of how the category types it. */
const NATIVE_COLUMN_KIND = {
  sqYard: 'number',
  sqYardRate: 'price',
  totalValue: 'price',
  propertyNo: 'text',
  plotSize: 'text',
  remarks: 'text',
  areaName: 'text',
};

function coerceNative(nativeKey, raw) {
  switch (NATIVE_COLUMN_KIND[nativeKey]) {
    case 'price':
      return toPrice(raw);
    case 'number':
      return toNumber(raw);
    default:
      return toText(raw);
  }
}

/** Fields that must resolve to something before a row can be written. */
export const REQUIRED_CORE_KEYS = CORE_IMPORT_FIELDS.filter((f) => f.required).map((f) => f.key);

// ─── Auto-mapping ─────────────────────────────────────────────────────────────

// Exported so the lead importer matches spreadsheet headings the same way
// the listing importer does — two normalisers would drift.
export function normalizeHeader(header) {
  return String(header || '')
    .toLowerCase()
    .replace(/[._\-/\\]+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Guess a target for each spreadsheet column.
 *
 * Category fields are matched before core fields, because a category that
 * defines its own "Facing" or "Plot size" field should win over a generic
 * column of the same name. Returns one entry per header, always — an unmatched
 * column maps to `{ target: 'ignore' }` rather than being invented as a new
 * attribute key, so nothing silently enters the database unnamed.
 *
 * @param {string[]} headers
 * @param {Array<{key:string,label:string,type:string}>} categoryFields
 * @returns {Array<{column:number, header:string, target:'core'|'attribute'|'ignore', key:string|null, confidence:'exact'|'likely'|'none'}>}
 */
export function autoMapHeaders(headers = [], categoryFields = []) {
  const catExact = new Map();
  const catLoose = new Map();
  categoryFields.forEach((f) => {
    catExact.set(normalizeHeader(f.label), f.key);
    catExact.set(normalizeHeader(f.key), f.key);
  });
  categoryFields.forEach((f) => {
    const n = normalizeHeader(f.label);
    if (n) catLoose.set(n, f.key);
  });

  const coreExact = new Map();
  CORE_IMPORT_FIELDS.forEach((f) => {
    coreExact.set(normalizeHeader(f.label), f.key);
    coreExact.set(normalizeHeader(f.key), f.key);
    (f.synonyms || []).forEach((syn) => {
      const n = normalizeHeader(syn);
      if (n && !coreExact.has(n)) coreExact.set(n, f.key);
    });
  });

  const used = new Set();

  return headers.map((header, column) => {
    const n = normalizeHeader(header);
    const base = { column, header: String(header ?? ''), target: 'ignore', key: null, confidence: 'none' };
    if (!n) return base;

    if (catExact.has(n)) {
      return { ...base, target: 'attribute', key: catExact.get(n), confidence: 'exact' };
    }
    if (coreExact.has(n)) {
      const key = coreExact.get(n);
      // Don't map two columns onto the same core field — the second is likelier
      // to be a variant the admin should place by hand than a true duplicate.
      if (!used.has(key)) {
        used.add(key);
        return { ...base, target: 'core', key, confidence: 'exact' };
      }
    }

    // Loose containment pass: "Total Area (Sq Yard)" → sqYard.
    for (const [candidate, key] of catLoose) {
      if (candidate.length > 3 && n.includes(candidate)) {
        return { ...base, target: 'attribute', key, confidence: 'likely' };
      }
    }
    for (const [candidate, key] of coreExact) {
      if (candidate.length > 3 && n.includes(candidate) && !used.has(key)) {
        used.add(key);
        return { ...base, target: 'core', key, confidence: 'likely' };
      }
    }

    return base;
  });
}

// ─── Row building ─────────────────────────────────────────────────────────────

function coerceCore(field, raw) {
  switch (field.kind) {
    case 'price':
      return toPrice(raw);
    case 'number':
      return toNumber(raw);
    case 'integer':
      return toInteger(raw);
    case 'boolean':
      return toBoolean(raw);
    case 'enum': {
      const s = toText(raw).toLowerCase().replace(/[\s-]+/g, '_');
      if (!s) return null;
      const hit = (field.options || []).find((o) => o === s);
      if (hit) return hit;
      // Common spreadsheet spellings that aren't the stored value.
      const aliases = {
        for_sale: 'sale', selling: 'sale', sell: 'sale',
        for_rent: 'rent', rental: 'rent', renting: 'rent',
        on_lease: 'lease', leased: 'lease',
        open: 'available', active: 'available', unsold: 'available',
        negotiation: 'under_negotiation', in_negotiation: 'under_negotiation',
        under_offer: 'under_negotiation', booked: 'under_negotiation',
        closed: 'sold', done: 'sold',
      };
      return aliases[s] || undefined; // undefined → "present but unrecognised"
    }
    default:
      return toText(raw);
  }
}

function coerceAttribute(fieldDef, raw) {
  switch (fieldDef?.type) {
    case 'number':
      return toNumber(raw);
    case 'boolean':
      return toBoolean(raw);
    case 'date': {
      const d = toDate(raw);
      return d ? d.toISOString() : null;
    }
    case 'select': {
      const text = toText(raw);
      if (!text) return null;
      if (fieldDef.multiple) {
        return text.split(/[;,|]/).map((s) => s.trim()).filter(Boolean);
      }
      return text;
    }
    default:
      return toText(raw);
  }
}

/**
 * Turn one spreadsheet row into a listing payload plus a list of problems.
 *
 * Problems are split by severity so the UI can offer "import the 180 clean rows
 * and let me fix the other 12 later":
 *   • `errors`   — the row cannot be written
 *   • `warnings` — the row will be written, but something was dropped or guessed
 *
 * @returns {{ values: object, attributes: object, errors: Array, warnings: Array }}
 */
export function buildListingRow({ row, mapping, category, rowNumber }) {
  const errors = [];
  const warnings = [];
  const values = {};
  const attributes = {};

  const categoryFields = category?.fields || [];
  const fieldByKey = new Map(categoryFields.map((f) => [f.key, f]));

  mapping.forEach((map) => {
    if (!map || map.target === 'ignore' || !map.key) return;
    const raw = row[map.column];
    if (raw === undefined || raw === null || String(raw).trim() === '') return;

    if (map.target === 'core') {
      const field = CORE_BY_KEY.get(map.key);
      if (!field) return;
      const value = coerceCore(field, raw);

      if (value === undefined) {
        warnings.push({
          column: map.column,
          field: map.key,
          message: `“${toText(raw)}” isn't a recognised ${field.label.toLowerCase()} — expected one of ${(field.options || []).join(', ')}. Left at the default.`,
        });
        return;
      }
      if (value === null) {
        warnings.push({
          column: map.column,
          field: map.key,
          message: `Couldn't read “${toText(raw)}” as ${field.label.toLowerCase()}. Left blank.`,
        });
        return;
      }
      values[map.key] = value;
      return;
    }

    const fieldDef = fieldByKey.get(map.key);

    // A category field that aliases a real column writes to the column, not to
    // the dynamic map — same rule the listing form follows.
    const nativeKey = NATIVE_FIELD_ALIASES[map.key];
    if (nativeKey) {
      const nativeValue = coerceNative(nativeKey, raw);
      if (nativeValue === null || nativeValue === '') {
        warnings.push({
          column: map.column,
          field: map.key,
          message: `Couldn't read “${toText(raw)}” as ${fieldDef?.label || map.key}. Left blank.`,
        });
        return;
      }
      values[nativeKey] = nativeValue;
      return;
    }

    const value = coerceAttribute(fieldDef, raw);
    if (value === null || value === '') return;
    attributes[map.key] = value;
  });

  // Latitude/longitude collapse into the location sub-document.
  const lat = values.latitude;
  const lng = values.longitude;
  delete values.latitude;
  delete values.longitude;
  if (lat !== undefined && lng !== undefined) {
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      warnings.push({ field: 'location', message: `Coordinates ${lat}, ${lng} are out of range — location left unset.` });
    } else {
      values.location = { lat, lng };
    }
  } else if (lat !== undefined || lng !== undefined) {
    warnings.push({ field: 'location', message: 'Only one of latitude/longitude was given — location left unset.' });
  }

  // Required core fields.
  REQUIRED_CORE_KEYS.forEach((key) => {
    if (!values[key]) {
      const field = CORE_BY_KEY.get(key);
      errors.push({ field: key, message: `${field.label} is required and this row has none.` });
    }
  });

  // Cross-field price rule, matching the model's own pre-save guard.
  if (values.discountPrice && values.regularPrice && values.discountPrice >= values.regularPrice) {
    errors.push({
      field: 'discountPrice',
      message: `Offer price (${values.discountPrice}) must be below the price (${values.regularPrice}).`,
    });
  }

  // Category's own required fields and constraints.
  const valueOf = (key) => (NATIVE_FIELD_ALIASES[key] ? values[NATIVE_FIELD_ALIASES[key]] : attributes[key]);
  categoryFields.forEach((f) => {
    // Not required, and not checked, when its showWhen condition is not met.
    if (!isCategoryFieldActive(f, valueOf)) return;
    const nativeKey = NATIVE_FIELD_ALIASES[f.key];
    const val = nativeKey ? values[nativeKey] : attributes[f.key];
    if (f.required && (val === undefined || val === null || val === '')) {
      errors.push({ field: f.key, message: `${f.label} is required by the ${category.name} category.` });
      return;
    }
    if (val === undefined || val === null) return;

    // Aliased fields are already coerced to the column's type above; the
    // category's declared type (often 'text') doesn't describe them.
    if (nativeKey) return;

    if (f.type === 'number') {
      if (typeof val !== 'number') {
        errors.push({ field: f.key, message: `${f.label} must be a number.` });
        return;
      }
      if (f.min !== undefined && val < f.min) errors.push({ field: f.key, message: `${f.label} must be at least ${f.min}.` });
      if (f.max !== undefined && val > f.max) errors.push({ field: f.key, message: `${f.label} must be at most ${f.max}.` });
    }

    if (f.type === 'select') {
      const options = Array.isArray(f.options) ? f.options : [];
      const chosen = Array.isArray(val) ? val : [val];
      chosen.forEach((v) => {
        if (!options.includes(v)) {
          errors.push({ field: f.key, message: `“${v}” isn't an option for ${f.label}. Allowed: ${options.join(', ')}.` });
        }
      });
    }

    if (f.pattern && typeof val === 'string') {
      try {
        if (!new RegExp(f.pattern).test(val)) {
          errors.push({ field: f.key, message: `${f.label} doesn't match the expected format.` });
        }
      } catch (e) {
        if (!(e instanceof SyntaxError)) throw e;
      }
    }
  });

  return { rowNumber, values, attributes, errors, warnings };
}

/**
 * The key used to recognise a row that already exists.
 * Property number is the identifier brokers actually use; name + address is the
 * fallback when a sheet has no numbering.
 */
export function dedupeKeyFor(values, categorySlug) {
  if (values.propertyNo) {
    return `no:${categorySlug}:${String(values.propertyNo).toLowerCase()}`;
  }
  const name = String(values.name || '').toLowerCase();
  const address = String(values.address || '').toLowerCase();
  return `na:${categorySlug}:${name}|${address}`;
}

/** Mongo filter matching an existing listing for the given row. */
export function dedupeFilterFor(values, categorySlug) {
  if (values.propertyNo) {
    return { category: categorySlug, propertyNo: values.propertyNo, isDeleted: { $ne: true } };
  }
  if (!values.name) return null;
  return {
    category: categorySlug,
    name: values.name,
    address: values.address || '',
    isDeleted: { $ne: true },
  };
}

import { toPrice, toText, toDate, normalizeHeader } from './importMapping.js';

/**
 * Bringing portal enquiries in from a spreadsheet.
 *
 * Indian agencies get their volume from 99acres, MagicBricks and Housing, and
 * every one of those lets you export enquiries as a CSV. That export is the
 * free version of "portal integration": no paid API, no scraping, no waiting
 * on a partner agreement — the agency downloads what is already theirs and
 * this maps it onto leads.
 *
 * The synonyms below are the column headings those exports actually use, which
 * is why the mapping usually needs no adjustment at all.
 */

export const LEAD_IMPORT_FIELDS = [
  {
    key: 'name', label: 'Name', kind: 'text', required: true, example: 'Anil Kumar',
    synonyms: ['name', 'full name', 'customer name', 'client name', 'lead name', 'enquirer',
               'enquirer name', 'contact name', 'buyer name', 'sender name', 'first name'],
  },
  {
    key: 'phone', label: 'Phone', kind: 'text', required: true, example: '98765 43210',
    synonyms: ['phone', 'mobile', 'mobile no', 'mobile number', 'phone no', 'phone number',
               'contact', 'contact no', 'contact number', 'whatsapp', 'telephone', 'cell'],
  },
  {
    key: 'email', label: 'Email', kind: 'text', example: 'anil@example.com',
    synonyms: ['email', 'email id', 'e-mail', 'mail', 'email address'],
  },
  {
    key: 'alternatePhone', label: 'Alternate phone', kind: 'text', example: '98765 43211',
    synonyms: ['alternate phone', 'alt phone', 'secondary phone', 'other phone', 'phone 2'],
  },
  {
    key: 'source', label: 'Source', kind: 'text', example: '99acres',
    synonyms: ['source', 'lead source', 'portal', 'channel', 'origin', 'came from', 'medium'],
  },
  {
    key: 'requirements', label: 'Requirement', kind: 'text', example: '3 BHK, Sector 57',
    synonyms: ['requirement', 'requirements', 'message', 'enquiry', 'query', 'comments',
               'remarks', 'description', 'interested in', 'looking for', 'notes'],
  },
  {
    key: 'propertyType', label: 'Property type', kind: 'text', example: 'Apartment',
    synonyms: ['property type', 'type', 'unit type', 'category', 'configuration', 'bhk'],
  },
  {
    key: 'preferredLocations', label: 'Preferred locations', kind: 'text', example: 'Sector 57, Sushant Lok',
    synonyms: ['location', 'locality', 'preferred location', 'preferred locations', 'area',
               'city', 'preferred area', 'site'],
  },
  {
    key: 'budgetMin', label: 'Budget (min)', kind: 'price', example: '80 L',
    synonyms: ['budget min', 'min budget', 'minimum budget', 'budget from', 'price from',
               'budget starting', 'from price'],
  },
  {
    /*
     * A bare "Budget" column belongs here, not on min. When a portal enquiry
     * says "Budget: 80 L" the buyer means that is as far as they will go, and
     * reading it as a floor both inverts the meaning and costs the lead its
     * budget score — calculateScore only rewards a stated ceiling.
     */
    key: 'budgetMax', label: 'Budget (max)', kind: 'price', example: '1.2 Cr',
    synonyms: ['budget max', 'max budget', 'maximum budget', 'budget to', 'price to',
               'budget upto', 'budget up to', 'budget', 'price range', 'expected budget'],
  },
  {
    key: 'enquiredAt', label: 'Enquiry date', kind: 'date', example: '2026-09-01',
    synonyms: ['date', 'enquiry date', 'lead date', 'created', 'created on', 'received',
               'received on', 'timestamp', 'enquiry time'],
  },
];

export const LEAD_REQUIRED_KEYS = LEAD_IMPORT_FIELDS.filter((f) => f.required).map((f) => f.key);

/**
 * Match spreadsheet headings to lead fields.
 *
 * Exact label or key first, then synonyms — so a column literally called
 * "Name" wins over one whose synonym happens to include the word.
 */
export function autoMapLeadHeaders(headers = []) {
  const exact = new Map();

  LEAD_IMPORT_FIELDS.forEach((f) => {
    exact.set(normalizeHeader(f.label), f.key);
    exact.set(normalizeHeader(f.key), f.key);
  });

  const loose = new Map();
  LEAD_IMPORT_FIELDS.forEach((f) => {
    (f.synonyms || []).forEach((syn) => {
      const n = normalizeHeader(syn);
      if (n && !exact.has(n) && !loose.has(n)) loose.set(n, f.key);
    });
  });

  const mapping = {};
  const used = new Set();

  headers.forEach((header, index) => {
    const n = normalizeHeader(header);
    const key = exact.get(n) || loose.get(n);
    // One spreadsheet column per field: two columns both matching "phone"
    // should not silently overwrite each other.
    if (key && !used.has(key)) {
      mapping[index] = key;
      used.add(key);
    }
  });

  return mapping;
}

/**
 * Turn one spreadsheet row into the shape createClient expects.
 *
 * Returns `{ values, errors }` rather than throwing, so the preview can show
 * every bad row at once instead of stopping at the first.
 */
export function buildLeadRow({ row, mapping, rowNumber }) {
  const values = {};
  const errors = [];

  Object.entries(mapping).forEach(([index, key]) => {
    if (!key) return;
    const field = LEAD_IMPORT_FIELDS.find((f) => f.key === key);
    if (!field) return;

    const raw = row[Number(index)];

    if (field.kind === 'price') values[key] = toPrice(raw);
    else if (field.kind === 'date') values[key] = toDate(raw);
    else values[key] = toText(raw);
  });

  LEAD_REQUIRED_KEYS.forEach((key) => {
    if (!values[key] || !String(values[key]).trim()) {
      const field = LEAD_IMPORT_FIELDS.find((f) => f.key === key);
      errors.push(`Row ${rowNumber}: ${field?.label || key} is required`);
    }
  });

  // A phone with fewer than 7 digits cannot be dialled or matched, and a lead
  // nobody can contact is worse than no lead — it pollutes the dedupe index.
  const digits = String(values.phone || '').replace(/\D/g, '');
  if (values.phone && digits.length < 7) {
    errors.push(`Row ${rowNumber}: "${values.phone}" is not a usable phone number`);
  }

  // `preferredLocations` is an array on the model; exports give one cell.
  if (values.preferredLocations) {
    values.preferredLocations = String(values.preferredLocations)
      .split(/[,;/|]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  if (values.budgetMin || values.budgetMax) {
    values.budget = { min: values.budgetMin || 0, max: values.budgetMax || 0 };
  }
  delete values.budgetMin;
  delete values.budgetMax;

  return { values, errors };
}

/** The phone shape the dedupe index matches on: last ten digits. */
export function leadDedupeKey(values) {
  const digits = String(values?.phone || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

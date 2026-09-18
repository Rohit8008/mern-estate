import Client from '../models/client.model.js';
import LeadSource from '../models/leadSource.model.js';
import {
  LEAD_IMPORT_FIELDS,
  autoMapLeadHeaders,
  buildLeadRow,
  leadDedupeKey,
} from '../utils/leadImportMapping.js';
import { chooseAssigneesForBatch } from '../tenancy/leadAssignment.js';
import { asyncHandler, sendSuccessResponse, ValidationError } from '../utils/error.js';
import { logFromRequest } from '../utils/activity.js';
import { emitEvent } from '../utils/webhooks.js';

/**
 * Importing portal enquiries.
 *
 * Agencies get their volume from 99acres, MagicBricks and Housing, all of which
 * export enquiries as a spreadsheet. This is the free path to "portal
 * integration" — no paid API, no partner agreement, no scraping.
 *
 * Preview before commit, for the same reason the listing importer does it: an
 * import that silently creates 400 duplicates is worse than one that refuses.
 */

/** Enough to be useful, small enough that one request cannot exhaust memory. */
const MAX_ROWS = 5000;

/** A file with more distinct sources than this is noise, not attribution. */
const MAX_NEW_SOURCES = 25;

/**
 * Which of this file's phone numbers are already on file.
 *
 * One indexed lookup on the derived `phoneKey`. This was a `$or` of one suffix
 * regex per row, which no index can serve — on a 5,000-row portal export that
 * is 5,000 collection scans in a single query.
 */
async function findExistingKeys(parsed) {
  const keys = [...new Set(
    parsed.map((p) => leadDedupeKey(p.values)).filter((k) => k.length >= 10)
  )];

  if (!keys.length) return new Set();

  const existing = await Client.find({
    isDeleted: { $ne: true },
    phoneKey: { $in: keys },
  })
    .select('phoneKey')
    .lean();

  return new Set(existing.map((c) => c.phoneKey));
}

/** Where a row would land, without writing anything. */
function classify(values, existingKeys) {
  const key = leadDedupeKey(values);
  if (key && existingKeys.has(key)) return 'duplicate';
  return 'new';
}

export const getLeadImportFields = asyncHandler(async (req, res) => {
  sendSuccessResponse(
    res,
    {
      fields: LEAD_IMPORT_FIELDS.map(({ key, label, kind, required, example }) => ({
        key, label, kind, required: Boolean(required), example,
      })),
    },
    'Lead import fields'
  );
});

/** Headings in, suggested mapping out. */
export const suggestLeadMapping = asyncHandler(async (req, res) => {
  const { headers } = req.body || {};
  if (!Array.isArray(headers)) throw new ValidationError('headers must be a list', 'headers');

  sendSuccessResponse(res, { mapping: autoMapLeadHeaders(headers) }, 'Suggested mapping');
});

/**
 * A dry run: what would be created, what is already on file, what is unusable.
 */
export const previewLeadImport = asyncHandler(async (req, res) => {
  const { rows, mapping } = req.body || {};
  if (!Array.isArray(rows)) throw new ValidationError('rows must be a list', 'rows');
  if (rows.length > MAX_ROWS) {
    throw new ValidationError(`That file has ${rows.length} rows; import up to ${MAX_ROWS} at a time.`, 'rows');
  }

  const parsed = rows.map((row, i) => buildLeadRow({ row, mapping: mapping || {}, rowNumber: i + 2 }));

  const existingKeys = await findExistingKeys(parsed);

  // Duplicates inside the file itself, which a portal export routinely has
  // when the same person enquired twice.
  const seen = new Set();
  const preview = parsed.map(({ values, errors }, i) => {
    const key = leadDedupeKey(values);
    let status = errors.length ? 'error' : classify(values, existingKeys);

    if (status === 'new' && key && seen.has(key)) status = 'duplicate';
    if (status === 'new' && key) seen.add(key);

    return { rowNumber: i + 2, status, errors, values };
  });

  sendSuccessResponse(
    res,
    {
      rows: preview,
      summary: {
        total: preview.length,
        new: preview.filter((r) => r.status === 'new').length,
        duplicates: preview.filter((r) => r.status === 'duplicate').length,
        errors: preview.filter((r) => r.status === 'error').length,
      },
    },
    'Import preview'
  );
});

/**
 * Write the rows the preview said were new.
 *
 * Duplicates and errors are skipped rather than merged: deciding that two
 * records are the same person is a judgement, and an importer should not make
 * it silently on 400 rows.
 */
export const commitLeadImport = asyncHandler(async (req, res) => {
  const { rows, mapping, defaultSource } = req.body || {};
  if (!Array.isArray(rows)) throw new ValidationError('rows must be a list', 'rows');
  if (rows.length > MAX_ROWS) {
    throw new ValidationError(`That file has ${rows.length} rows; import up to ${MAX_ROWS} at a time.`, 'rows');
  }

  const parsed = rows.map((row, i) => buildLeadRow({ row, mapping: mapping || {}, rowNumber: i + 2 }));

  const existingKeys = await findExistingKeys(parsed);

  const skipped = { duplicates: 0, errors: 0 };
  const seen = new Set();

  // Decide what will be written before writing any of it, so the assignment
  // can be dealt out in one pass.
  const writable = [];
  for (const { values, errors } of parsed) {
    if (errors.length) { skipped.errors += 1; continue; }

    const key = leadDedupeKey(values);
    if (key && (existingKeys.has(key) || seen.has(key))) { skipped.duplicates += 1; continue; }
    if (key) seen.add(key);

    writable.push(values);
  }

  /*
   * The workspace's assignment rule applies to imported leads exactly as it
   * does to one typed in by hand — otherwise a 400-row import all lands on
   * whoever pressed the button. Resolved for the whole batch at once: per-row
   * it cost two aggregates each, and the counts shifted underneath as the rows
   * it had just written landed.
   */
  const { assignees } = await chooseAssigneesForBatch(writable.length, { fallback: req.user.id });

  const created = [];
  for (const [i, values] of writable.entries()) {
    const doc = new Client({
      ...values,
      source: values.source || defaultSource || 'Import',
      assignedTo: assignees[i],
      createdBy: req.user.id,
      status: 'lead',
    });

    doc.calculateScore();
    await doc.save();
    created.push(doc);
  }

  /*
   * Record any source names the file introduced, so the ROI report can see
   * them. Capped: a tidy file has a handful of distinct sources, but a messy
   * one can have a different string on every row, and the source catalogue is
   * a vocabulary rather than a dumping ground for whatever a column held.
   */
  const sources = [...new Set(created.map((c) => c.source).filter(Boolean))].slice(0, MAX_NEW_SOURCES);

  if (sources.length) {
    await LeadSource.bulkWrite(
      sources.map((name) => ({
        updateOne: {
          filter: { slug: String(name).trim().toLowerCase() },
          update: {
            $setOnInsert: {
              name: String(name).trim(),
              slug: String(name).trim().toLowerCase(),
              createdBy: req.user.id,
            },
          },
          upsert: true,
        },
      })),
      { ordered: false }
    ).catch(() => {
      // The leads are already written; a missing catalogue row costs the ROI
      // report a label, not the import.
    });
  }

  logFromRequest(req, {
    entityType: 'client',
    entityId: created[0]?._id || req.user.id,
    action: 'lead.imported',
    message: `Imported ${created.length} leads`,
    meta: { created: created.length, ...skipped },
  });

  created.slice(0, 50).forEach((c) => {
    emitEvent('lead.created', { id: String(c._id), name: c.name, phone: c.phone, source: c.source });
  });

  sendSuccessResponse(
    res,
    { created: created.length, skipped, sources },
    `Imported ${created.length} leads`,
    201
  );
});

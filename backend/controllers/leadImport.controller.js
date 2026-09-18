import Client from '../models/client.model.js';
import LeadSource from '../models/leadSource.model.js';
import {
  LEAD_IMPORT_FIELDS,
  autoMapLeadHeaders,
  buildLeadRow,
  leadDedupeKey,
} from '../utils/leadImportMapping.js';
import { chooseAssignee } from '../tenancy/leadAssignment.js';
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

  // One query for every phone in the file, rather than one per row.
  const keys = parsed.map((p) => leadDedupeKey(p.values)).filter((k) => k.length >= 10);
  const existing = keys.length
    ? await Client.find({
        isDeleted: { $ne: true },
        $or: keys.map((k) => ({ phone: { $regex: `${k}$` } })),
      }).select('phone').lean()
    : [];

  const existingKeys = new Set(existing.map((c) => leadDedupeKey(c)));

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

  const keys = parsed.map((p) => leadDedupeKey(p.values)).filter((k) => k.length >= 10);
  const existing = keys.length
    ? await Client.find({
        isDeleted: { $ne: true },
        $or: keys.map((k) => ({ phone: { $regex: `${k}$` } })),
      }).select('phone').lean()
    : [];
  const existingKeys = new Set(existing.map((c) => leadDedupeKey(c)));

  const created = [];
  const skipped = { duplicates: 0, errors: 0 };
  const seen = new Set();

  for (const { values, errors } of parsed) {
    if (errors.length) { skipped.errors += 1; continue; }

    const key = leadDedupeKey(values);
    if (key && (existingKeys.has(key) || seen.has(key))) { skipped.duplicates += 1; continue; }
    if (key) seen.add(key);

    // The workspace's assignment rule applies to an imported lead exactly as it
    // does to one typed in by hand — otherwise a 400-row import all lands on
    // whoever pressed the button.
    const { assignedTo } = await chooseAssignee({
      fallback: req.user.id,
      locality: values.preferredLocations?.[0],
    });

    const doc = new Client({
      ...values,
      source: values.source || defaultSource || 'Import',
      assignedTo,
      createdBy: req.user.id,
      status: 'lead',
    });

    doc.calculateScore();
    await doc.save();
    created.push(doc);
  }

  // Record any source names the file introduced, so the ROI report can see them.
  const sources = [...new Set(created.map((c) => c.source).filter(Boolean))];
  for (const name of sources) {
    const slug = String(name).trim().toLowerCase();
    await LeadSource.updateOne(
      { slug },
      { $setOnInsert: { name: String(name).trim(), slug, createdBy: req.user.id } },
      { upsert: true }
    ).catch(() => {});
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

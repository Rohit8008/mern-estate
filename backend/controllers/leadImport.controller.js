import Client from '../models/client.model.js';
import LeadSource from '../models/leadSource.model.js';
import EmailSuppression from '../models/emailSuppression.model.js';
import {
  LEAD_IMPORT_FIELDS,
  autoMapLeadHeaders,
  buildLeadRow,
  leadNaturalKey,
} from '../utils/leadImportMapping.js';
import { phoneKeyOf } from '../utils/phoneKey.js';
import { chooseAssigneesForBatch } from '../tenancy/leadAssignment.js';
import { reserveImportRows } from '../tenancy/limits.js';
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

/** Rows per insertMany: one round trip each, small enough to keep errors legible. */
const WRITE_BATCH = 500;

/**
 * Row-level problems returned in the response, at most. A 5,000-row file of
 * the wrong export should not produce a 5,000-entry response; the counts stay
 * exact and `rowErrorsTruncated` says the list was cut.
 */
const MAX_ROW_ERRORS = 200;

/**
 * Which of this file's rows are already on file, as a set of natural-key ids
 * (see leadNaturalKey).
 *
 * Indexed lookups only — `phoneKey` and `email` are both indexed — one query
 * per kind of key rather than one per row. Phone matching used to be a `$or`
 * of one suffix regex per row, which no index can serve: on a 5,000-row
 * portal export that was 5,000 collection scans in a single query.
 */
async function findExistingKeys(parsed) {
  const keys = parsed.map((p) => leadNaturalKey(p.values));
  const full = [...new Set(keys.filter((k) => k.kind === 'phone').map((k) => k.phoneKey))];
  const emails = [...new Set(keys.filter((k) => k.kind === 'email').map((k) => k.email))];
  const short = [...new Set(keys.filter((k) => k.kind === 'phoneName').map((k) => k.phoneKey))];

  const live = { isDeleted: { $ne: true } };
  const [byPhone, byEmail, byShort] = await Promise.all([
    full.length ? Client.find({ ...live, phoneKey: { $in: full } }).select('phoneKey').lean() : [],
    emails.length ? Client.find({ ...live, email: { $in: emails } }).select('email').lean() : [],
    short.length ? Client.find({ ...live, phoneKey: { $in: short } }).select('phoneKey name').lean() : [],
  ]);

  return new Set([
    ...byPhone.map((c) => `p:${c.phoneKey}`),
    ...byEmail.map((c) => `e:${String(c.email).trim().toLowerCase()}`),
    ...byShort.map((c) => leadNaturalKey({ phone: c.phoneKey, name: c.name }).id),
  ]);
}

/**
 * Where each row would land — 'new', 'duplicate' (on file, or earlier in the
 * same file: a portal export routinely has the same person twice) or 'error'.
 * Shared by preview and commit so the two can never disagree about a row.
 */
function classifyRows(parsed, existingKeys) {
  const seen = new Set();
  return parsed.map(({ values, errors }) => {
    if (errors.length) return 'error';
    const { id } = leadNaturalKey(values);
    if (id && (existingKeys.has(id) || seen.has(id))) return 'duplicate';
    if (id) seen.add(id);
    return 'new';
  });
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
  const statuses = classifyRows(parsed, existingKeys);
  const preview = parsed.map(({ values, errors }, i) => ({ rowNumber: i + 2, status: statuses[i], errors, values }));

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
 *
 * Every row is validated before anything is written, then written in batches
 * with `ordered: false`, so one bad row costs that row and never the rest of
 * the file. It used to save one row at a time, and the first row the database
 * refused threw out of the loop: the rows before it were written, the rows
 * after it were not, and the response said nothing about which.
 *
 * The answer is a summary in the shape the ingest pipeline uses —
 * inputCount / inserted / updated / failed with row-level `rowErrors` — on top
 * of the `created` and `skipped` fields the import screen already reads.
 */
export const commitLeadImport = asyncHandler(async (req, res) => {
  const { rows, mapping, defaultSource } = req.body || {};
  if (!Array.isArray(rows)) throw new ValidationError('rows must be a list', 'rows');
  if (rows.length > MAX_ROWS) {
    throw new ValidationError(`That file has ${rows.length} rows; import up to ${MAX_ROWS} at a time.`, 'rows');
  }

  const parsed = rows.map((row, i) => buildLeadRow({ row, mapping: mapping || {}, rowNumber: i + 2 }));
  const existingKeys = await findExistingKeys(parsed);
  const statuses = classifyRows(parsed, existingKeys);

  const skipped = { duplicates: 0, errors: 0 };
  const rowErrors = [];
  let rowErrorCount = 0;
  const addRowError = (entry) => {
    rowErrorCount += 1;
    if (rowErrors.length < MAX_ROW_ERRORS) rowErrors.push(entry);
  };

  // Decide what will be written before writing any of it, so the assignment
  // can be dealt out in one pass.
  const writable = [];
  parsed.forEach(({ values, errors }, i) => {
    const row = i + 2;
    if (statuses[i] === 'error') {
      skipped.errors += 1;
      addRowError({ row, code: 'INVALID_ROW', error: errors.join('; ') });
    } else if (statuses[i] === 'duplicate') {
      skipped.duplicates += 1;
    } else {
      writable.push({ row, values });
    }
  });

  // The plan's monthly allowance, reserved before a single row is written:
  // refusing halfway through a file would leave the agency guessing which
  // half they have. 402 with { limit, used, requested } in `details`.
  const release = await reserveImportRows(writable.length);

  /*
   * The workspace's assignment rule applies to imported leads exactly as it
   * does to one typed in by hand — otherwise a 400-row import all lands on
   * whoever pressed the button. Resolved for the whole batch at once: per-row
   * it cost two aggregates each, and the counts shifted underneath as the rows
   * it had just written landed.
   */
  const { assignees } = await chooseAssigneesForBatch(writable.length, { fallback: req.user.id });

  /*
   * insertMany does not run pre('save') middleware, so what the Client save
   * hooks derive is set here, from the same shared rules:
   *   - phoneKey      phoneKeyOf, the rule syncPhoneKey uses
   *   - emailOptOut   one lookup for the whole file instead of one per row
   *                   (syncEmailOptOut does a findOne per save)
   *   - nextFollowUp  null: an imported lead has no follow-ups yet
   * score and temperature come from calculateScore(), the only place the
   * number is computed. tenantId is stamped by the tenant plugin's own
   * insertMany hook. tests/leadImportCommit.test.js compares an imported lead
   * with one created through save(), so a new save hook that this misses
   * fails the build rather than drifting quietly.
   */
  const emails = [...new Set(writable.map((w) => String(w.values.email || '').trim().toLowerCase()).filter(Boolean))];
  const suppressed = emails.length
    ? new Map((await EmailSuppression.find({ email: { $in: emails } }).lean()).map((r) => [r.email, r]))
    : new Map();

  const candidates = [];
  for (const [i, { row, values }] of writable.entries()) {
    const doc = new Client({
      ...values,
      source: values.source || defaultSource || 'Import',
      assignedTo: assignees[i],
      createdBy: req.user.id,
      status: 'lead',
    });
    doc.calculateScore();
    doc.phoneKey = phoneKeyOf(doc.phone);
    const optOut = doc.email ? suppressed.get(String(doc.email).trim().toLowerCase()) : null;
    doc.emailOptOut = optOut ? { at: optOut.createdAt, source: optOut.source } : null;
    doc.nextFollowUp = null;

    try {
      await doc.validate();
      candidates.push({ row, doc });
    } catch (err) {
      const first = err?.errors ? Object.values(err.errors)[0] : null;
      addRowError({ row, field: first?.path, code: 'VALIDATION_FAILED', error: first?.message || err.message });
    }
  }

  const created = [];
  let writeFailures = 0;
  for (let start = 0; start < candidates.length; start += WRITE_BATCH) {
    const batch = candidates.slice(start, start + WRITE_BATCH);
    try {
      const inserted = await Client.insertMany(batch.map((c) => c.doc), { ordered: false });
      created.push(...inserted);
    } catch (err) {
      // ordered:false — the driver wrote every row it could and lists the
      // ones it refused by their index in this batch.
      if (!Array.isArray(err?.writeErrors)) throw err;
      const failedIdx = new Set();
      err.writeErrors.forEach((we) => {
        const index = we.index ?? we.err?.index;
        failedIdx.add(index);
        writeFailures += 1;
        const code = (we.err?.code ?? we.code) === 11000 ? 'DUPLICATE' : 'WRITE_FAILED';
        addRowError({ row: batch[index]?.row, code, error: we.err?.errmsg ?? we.errmsg ?? 'Could not be saved' });
      });
      created.push(...batch.filter((_, i) => !failedIdx.has(i)).map((c) => c.doc));
    }
  }

  // Count only what became a record against the month's allowance.
  await release(writable.length - created.length);

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

  const failed = writable.length - created.length;

  logFromRequest(req, {
    entityType: 'client',
    entityId: created[0]?._id || req.user.id,
    action: 'lead.imported',
    message: `Imported ${created.length} leads`,
    meta: { created: created.length, failed, ...skipped },
  });

  created.slice(0, 50).forEach((c) => {
    emitEvent('lead.created', { id: String(c._id), name: c.name, phone: c.phone, source: c.source });
  });

  sendSuccessResponse(
    res,
    {
      // What the import screen reads today.
      created: created.length,
      skipped,
      sources,
      // The ingest summary. `updated` is always 0: duplicates are skipped, not
      // merged (see above), but the field is part of the shape.
      inputCount: rows.length,
      inserted: created.length,
      updated: 0,
      failed,
      writeFailures,
      rowErrors,
      rowErrorsTruncated: rowErrorCount > rowErrors.length,
    },
    failed ? `Imported ${created.length} leads; ${failed} could not be saved` : `Imported ${created.length} leads`,
    201
  );
});

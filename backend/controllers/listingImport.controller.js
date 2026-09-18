/**
 * Bulk import for listings.
 *
 * Three endpoints, one shared code path:
 *   GET  /api/listing/import/template  — a CSV pre-headed for a category
 *   POST /api/listing/import/preview   — dry run; validates and reports, writes nothing
 *   POST /api/listing/import/commit    — writes the rows the admin approved
 *
 * Preview and commit build every row through the same `buildListingRow`, so the
 * report an admin approves is exactly what lands in the database. The old
 * approach — the browser firing one POST /listing/create per row — could not
 * tell you what would happen before it happened, half-imported a file when a
 * row failed, and duplicated everything on a second upload.
 */

import Listing from '../models/listing.model.js';
import Category from '../models/category.model.js';
import { emitToTenant } from '../socket.js';
import {
  ValidationError,
  NotFoundError,
  asyncHandler,
  sendSuccessResponse,
} from '../utils/error.js';
import { logger } from '../utils/logger.js';
import { logActivity } from '../utils/activity.js';
import { clearSearchCache } from './listing.controller.js';
import { assertWithinLimit } from '../tenancy/limits.js';
import {
  CORE_IMPORT_FIELDS,
  autoMapHeaders,
  buildListingRow,
  dedupeKeyFor,
  dedupeFilterFor,
} from '../utils/importMapping.js';

/** Rows accepted in a single request. The client chunks anything larger. */
export const IMPORT_CHUNK_LIMIT = 500;

/** Total rows accepted for one import job, across chunks. */
export const IMPORT_TOTAL_LIMIT = 20000;

// ─── Shared plumbing ──────────────────────────────────────────────────────────

async function loadCategory(slug) {
  if (!slug) throw new ValidationError('Pick a category before importing.', 'category');
  const category = await Category.findOne({ slug, isDeleted: { $ne: true } }).lean();
  if (!category) throw new NotFoundError(`No category named “${slug}”.`);
  return category;
}

function assertRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new ValidationError('No rows were sent.', 'rows');
  }
  if (rows.length > IMPORT_CHUNK_LIMIT) {
    throw new ValidationError(
      `Send at most ${IMPORT_CHUNK_LIMIT} rows per request — split the file into chunks.`,
      'rows'
    );
  }
}

function normalizeMapping(mapping) {
  if (!Array.isArray(mapping)) {
    throw new ValidationError('Column mapping is missing.', 'mapping');
  }
  return mapping
    .filter((m) => m && Number.isInteger(m.column) && m.column >= 0)
    .map((m) => ({
      column: m.column,
      target: m.target === 'core' || m.target === 'attribute' ? m.target : 'ignore',
      key: typeof m.key === 'string' && m.key ? m.key : null,
    }));
}

/**
 * Find which of these rows already exist, in two queries rather than one per
 * row. Returns a Map of dedupe key → existing listing id.
 */
async function findExisting(builtRows, categorySlug) {
  const propertyNos = [];
  const nameAddressPairs = [];

  builtRows.forEach(({ values }) => {
    if (values.propertyNo) propertyNos.push(values.propertyNo);
    else if (values.name) nameAddressPairs.push({ name: values.name, address: values.address || '' });
  });

  const found = new Map();

  if (propertyNos.length) {
    const docs = await Listing.find({
      category: categorySlug,
      propertyNo: { $in: propertyNos },
      isDeleted: { $ne: true },
    })
      .select('_id propertyNo name')
      .lean();
    docs.forEach((d) => {
      found.set(dedupeKeyFor({ propertyNo: d.propertyNo }, categorySlug), { id: d._id, name: d.name });
    });
  }

  if (nameAddressPairs.length) {
    const docs = await Listing.find({
      category: categorySlug,
      isDeleted: { $ne: true },
      $or: nameAddressPairs.map((p) => ({ name: p.name, address: p.address })),
    })
      .select('_id name address')
      .lean();
    docs.forEach((d) => {
      found.set(
        dedupeKeyFor({ name: d.name, address: d.address }, categorySlug),
        { id: d._id, name: d.name }
      );
    });
  }

  return found;
}

/**
 * Build and classify every row: valid / invalid / duplicate, plus warnings.
 * Used identically by preview and commit.
 */
async function analyzeRows({ rows, mapping, category, startRow }) {
  const built = rows.map((row, i) =>
    buildListingRow({
      row: Array.isArray(row) ? row : [],
      mapping,
      category,
      rowNumber: startRow + i,
    })
  );

  const existing = await findExisting(built, category.slug);

  // Rows that collide with an earlier row in the same file, not just with the
  // database — a sheet that lists the same plot twice is a common mistake.
  const seenInFile = new Map();

  return built.map((entry) => {
    const key = dedupeKeyFor(entry.values, category.slug);
    const dbMatch = entry.errors.length ? null : existing.get(key) || null;
    const fileMatch = seenInFile.has(key) ? seenInFile.get(key) : null;
    if (!entry.errors.length) seenInFile.set(key, entry.rowNumber);

    let status = 'ready';
    if (entry.errors.length) status = 'error';
    else if (fileMatch) status = 'duplicate_in_file';
    else if (dbMatch) status = 'duplicate';

    return {
      ...entry,
      status,
      dedupeKey: key,
      existingId: dbMatch?.id ? String(dbMatch.id) : null,
      existingName: dbMatch?.name || null,
      duplicateOfRow: fileMatch,
    };
  });
}

function summarize(analyzed) {
  return {
    total: analyzed.length,
    ready: analyzed.filter((r) => r.status === 'ready').length,
    duplicates: analyzed.filter((r) => r.status === 'duplicate').length,
    duplicatesInFile: analyzed.filter((r) => r.status === 'duplicate_in_file').length,
    errors: analyzed.filter((r) => r.status === 'error').length,
    warnings: analyzed.reduce((n, r) => n + r.warnings.length, 0),
  };
}

// ─── GET /api/listing/import/template ─────────────────────────────────────────

function csvCell(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * A CSV headed with exactly the columns this category understands, plus one
 * example row. Filling this in is the shortest path from "I have a list of
 * properties" to a clean import — no mapping step needed at all.
 */
export const getImportTemplate = asyncHandler(async (req, res) => {
  const category = await loadCategory(req.query.category);

  const coreCols = CORE_IMPORT_FIELDS.map((f) => ({ label: f.label, example: f.example }));
  const attrCols = (category.fields || [])
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((f) => ({
      label: f.label,
      example:
        f.type === 'select' ? (f.options || [])[0] || ''
        : f.type === 'boolean' ? 'Yes'
        : f.type === 'number' ? '0'
        : f.type === 'date' ? '01/04/2026'
        : '',
    }));

  const cols = [...coreCols, ...attrCols];
  const csv = [
    cols.map((c) => csvCell(c.label)).join(','),
    cols.map((c) => csvCell(c.example)).join(','),
  ].join('\r\n');

  const filename = `${category.slug}-import-template.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  // BOM so Excel opens UTF-8 (₹, ° etc.) correctly instead of mojibake.
  res.send('\uFEFF' + csv);
});

// ─── POST /api/listing/import/suggest-mapping ─────────────────────────────────

/**
 * Given the sheet's headers, propose a target for each column. Kept server-side
 * so the browser and the importer agree on what "Rate" means.
 */
export const suggestMapping = asyncHandler(async (req, res) => {
  const category = await loadCategory(req.body.category);
  const headers = Array.isArray(req.body.headers) ? req.body.headers : [];
  if (!headers.length) throw new ValidationError('No column headers were sent.', 'headers');

  const mapping = autoMapHeaders(headers, category.fields || []);

  sendSuccessResponse(
    res,
    {
      mapping,
      coreFields: CORE_IMPORT_FIELDS.map(({ key, label, kind, required, options }) => ({
        key, label, kind, required: !!required, options: options || null,
      })),
      categoryFields: (category.fields || [])
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map(({ key, label, type, required, options, unit }) => ({
          key, label, type, required: !!required, options: options || [], unit: unit || '',
        })),
      limits: { chunk: IMPORT_CHUNK_LIMIT, total: IMPORT_TOTAL_LIMIT },
    },
    'Mapping suggested'
  );
});

// ─── POST /api/listing/import/preview ─────────────────────────────────────────

/**
 * Dry run. Writes nothing, and returns the same per-row verdict the commit will
 * act on, so "Import 180 rows, skip 12" is a decision made on real information.
 */
export const previewImport = asyncHandler(async (req, res) => {
  const started = Date.now();
  const category = await loadCategory(req.body.category);
  const rows = req.body.rows;
  assertRows(rows);

  const mapping = normalizeMapping(req.body.mapping);
  const startRow = Number.isInteger(req.body.startRow) ? req.body.startRow : 2;

  const analyzed = await analyzeRows({ rows, mapping, category, startRow });

  sendSuccessResponse(
    res,
    {
      summary: summarize(analyzed),
      rows: analyzed.map((r) => ({
        rowNumber: r.rowNumber,
        status: r.status,
        name: r.values.name || '',
        propertyNo: r.values.propertyNo || '',
        preview: {
          address: r.values.address || '',
          city: r.values.city || '',
          locality: r.values.locality || '',
          regularPrice: r.values.regularPrice ?? null,
          type: r.values.type || null,
          status: r.values.status || null,
        },
        attributes: r.attributes,
        errors: r.errors,
        warnings: r.warnings,
        existingId: r.existingId,
        existingName: r.existingName,
        duplicateOfRow: r.duplicateOfRow,
      })),
      elapsedMs: Date.now() - started,
    },
    'Preview ready'
  );
});

// ─── POST /api/listing/import/commit ──────────────────────────────────────────

/**
 * Write the chunk.
 *
 * @body category        {string}  category slug
 * @body rows            {any[][]} raw cells
 * @body mapping         {object[]} column → field mapping
 * @body startRow        {number}  spreadsheet row number of rows[0], for reporting
 * @body duplicateMode   {'skip'|'update'|'create'} what to do with rows that already exist
 * @body skipInvalid     {boolean} import the clean rows instead of rejecting the chunk
 */
export const commitImport = asyncHandler(async (req, res) => {
  const started = Date.now();
  const category = await loadCategory(req.body.category);
  const rows = req.body.rows;
  assertRows(rows);

  const mapping = normalizeMapping(req.body.mapping);
  const startRow = Number.isInteger(req.body.startRow) ? req.body.startRow : 2;
  const duplicateMode = ['skip', 'update', 'create'].includes(req.body.duplicateMode)
    ? req.body.duplicateMode
    : 'skip';
  const skipInvalid = req.body.skipInvalid !== false;

  const analyzed = await analyzeRows({ rows, mapping, category, startRow });

  // Checked against the number this chunk will actually insert, before any of
  // it is written. Import is the one path that can take a workspace from well
  // inside its plan to far past it in a single request, so a per-row check
  // after the fact would be too late — and half-importing a file is exactly the
  // failure the preview/commit split exists to prevent.
  const willCreate = analyzed.filter(
    (r) => r.status === 'ready' || (r.status === 'duplicate' && req.body.duplicateMode === 'create')
  ).length;
  if (willCreate > 0) {
    await assertWithinLimit(
      'maxListings',
      () => Listing.countDocuments({ isDeleted: { $ne: true } }),
      willCreate
    );
  }

  const invalid = analyzed.filter((r) => r.status === 'error');
  if (invalid.length && !skipInvalid) {
    throw new ValidationError(
      `${invalid.length} row${invalid.length > 1 ? 's' : ''} can't be imported. Fix them, or re-run with "skip invalid rows".`,
      'rows'
    );
  }

  const outcomes = [];
  const toInsert = [];
  const toUpdate = [];

  analyzed.forEach((entry) => {
    const base = { rowNumber: entry.rowNumber, name: entry.values.name || '' };

    if (entry.status === 'error') {
      outcomes.push({ ...base, outcome: 'skipped', reason: entry.errors.map((e) => e.message).join(' ') });
      return;
    }

    if (entry.status === 'duplicate_in_file') {
      outcomes.push({
        ...base,
        outcome: 'skipped',
        reason: `Same property as row ${entry.duplicateOfRow} in this file.`,
      });
      return;
    }

    const doc = {
      ...entry.values,
      category: category.slug,
      attributes: entry.attributes,
      userRef: req.user.id,
    };

    if (entry.status === 'duplicate') {
      if (duplicateMode === 'skip') {
        outcomes.push({ ...base, outcome: 'skipped', reason: 'Already in the system.', existingId: entry.existingId });
        return;
      }
      if (duplicateMode === 'update') {
        // userRef is the original creator and must not be reassigned on update.
        const { userRef, ...updates } = doc;
        toUpdate.push({ entry, updates });
        return;
      }
      // 'create' falls through and inserts a second record deliberately.
    }

    toInsert.push({ entry, doc });
  });

  // ── Inserts ────────────────────────────────────────────────────────────────
  // Each document is validated individually first. Mongoose's own insertMany
  // error shapes don't map cleanly back to row numbers, and an import report
  // that can't name the failing row is close to useless — so validation is done
  // here, where the row number is still in hand, and insertMany then only sees
  // documents already known to be well-formed.
  let inserted = 0;
  if (toInsert.length) {
    const candidates = [];

    for (const t of toInsert) {
      const doc = new Listing(t.doc);
      try {
        await doc.validate();
        candidates.push({ entry: t.entry, doc });
      } catch (err) {
        const detail = Object.values(err?.errors || {})
          .map((e) => e.message)
          .join(' ');
        outcomes.push({
          rowNumber: t.entry.rowNumber,
          name: t.doc.name,
          outcome: 'failed',
          reason: detail || err.message || 'The database rejected this row.',
        });
      }
    }

    if (candidates.length) {
      let writeErrors = [];
      try {
        await Listing.insertMany(candidates.map((c) => c.doc), { ordered: false });
      } catch (err) {
        writeErrors = err?.writeErrors || err?.result?.result?.writeErrors || [];
        if (!writeErrors.length) throw err;
      }

      const failedByIndex = new Map(
        writeErrors.map((e) => [e.index ?? e.err?.index, e])
      );

      candidates.forEach((c, i) => {
        const failure = failedByIndex.get(i);
        if (failure) {
          outcomes.push({
            rowNumber: c.entry.rowNumber,
            name: c.doc.name,
            outcome: 'failed',
            reason: failure.errmsg || failure.err?.errmsg || 'The database rejected this row.',
          });
        } else {
          inserted += 1;
          outcomes.push({
            rowNumber: c.entry.rowNumber,
            name: c.doc.name,
            outcome: 'created',
            id: String(c.doc._id),
          });
        }
      });
    }
  }

  // ── Updates ────────────────────────────────────────────────────────────────
  let updated = 0;
  if (toUpdate.length) {
    const ops = toUpdate.map((t) => ({
      updateOne: {
        filter: dedupeFilterFor(t.entry.values, category.slug),
        update: { $set: t.updates },
      },
    }));
    try {
      await Listing.bulkWrite(ops, { ordered: false });
      toUpdate.forEach((t) => {
        updated += 1;
        outcomes.push({
          rowNumber: t.entry.rowNumber,
          name: t.updates.name,
          outcome: 'updated',
          id: t.entry.existingId,
        });
      });
    } catch (err) {
      const writeErrors = err?.writeErrors || [];
      const failedByIndex = new Map(writeErrors.map((e) => [e.index, e]));
      toUpdate.forEach((t, i) => {
        if (failedByIndex.has(i)) {
          outcomes.push({
            rowNumber: t.entry.rowNumber,
            name: t.updates.name,
            outcome: 'failed',
            reason: failedByIndex.get(i)?.errmsg || 'The database rejected this update.',
          });
        } else {
          updated += 1;
          outcomes.push({
            rowNumber: t.entry.rowNumber,
            name: t.updates.name,
            outcome: 'updated',
            id: t.entry.existingId,
          });
        }
      });
    }
  }

  outcomes.sort((a, b) => a.rowNumber - b.rowNumber);

  const result = {
    created: inserted,
    updated,
    skipped: outcomes.filter((o) => o.outcome === 'skipped').length,
    failed: outcomes.filter((o) => o.outcome === 'failed').length,
    rows: outcomes,
    elapsedMs: Date.now() - started,
  };

  if (inserted || updated) {
    clearSearchCache();
    emitToTenant(req.tenantId, 'listing:update', {
      action: 'bulk_import',
      count: inserted + updated,
      category: category.slug,
    });
    logActivity({
      entityType: 'listing',
      entityId: req.user.id,
      action: 'bulk_import',
      message: `Imported ${inserted} new and updated ${updated} ${category.name} properties`,
      meta: { category: category.slug, created: inserted, updated, skipped: result.skipped, failed: result.failed },
      createdBy: req.user.id,
    }).catch(() => {});
  }

  logger.info('Listing import chunk committed', {
    category: category.slug,
    ...result,
    rows: undefined,
    userId: req.user?.id,
  });

  sendSuccessResponse(res, result, `Created ${inserted}, updated ${updated}`);
});

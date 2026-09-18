/**
 * Streaming CSV responses.
 *
 * Exports used to happen in the browser, over whatever page of rows happened to
 * be loaded — so "export leads" gave you the twenty on screen, not the set you
 * had filtered to. These stream the real result set straight from a cursor, so
 * the file matches the filter and no request holds a whole collection in memory.
 */

/**
 * Quote a value for CSV, and defuse spreadsheet formula injection.
 *
 * A cell beginning = + - @ or a control character is executed as a formula by
 * Excel and Sheets when the file is opened. Since these exports carry names and
 * notes typed by users, a lead called `=HYPERLINK(...)` is a live attack on
 * whoever opens the file. Prefixing an apostrophe makes it text.
 */
export function csvCell(value) {
  const text =
    value === null || value === undefined ? ''
      : value instanceof Date ? value.toISOString()
      : String(value);

  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function csvRow(values) {
  return values.map(csvCell).join(',') + '\n';
}

/**
 * Stream a query to the response as a CSV download.
 *
 * @param {object} res      Express response
 * @param {object} opts
 * @param {string} opts.filename  without the date suffix
 * @param {string[]} opts.headers
 * @param {object} opts.cursor    a Mongoose cursor
 * @param {Function} opts.toRow   doc => array of cells, in header order
 */
export async function streamCsv(res, { filename, headers, cursor, toRow }) {
  const stamp = new Date().toISOString().slice(0, 10);

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}-${stamp}.csv"`);
  // A BOM keeps Excel from mangling non-ASCII — rupee signs, accented names.
  res.write('﻿');
  res.write(csvRow(headers));

  for await (const doc of cursor) {
    res.write(csvRow(toRow(doc)));
  }

  res.end();
}

/** Join populated or raw ids into something readable in a spreadsheet cell. */
export function joinNames(values, key = 'name') {
  if (!Array.isArray(values)) return '';
  return values
    .map((v) => (v && typeof v === 'object' ? v[key] || v.username || '' : v))
    .filter(Boolean)
    .join('; ');
}

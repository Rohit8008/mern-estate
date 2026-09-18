import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HiOutlineArrowLeft,
  HiOutlineArrowRight,
  HiOutlineCheckCircle,
  HiOutlineCloudUpload,
  HiOutlineDocumentDownload,
  HiOutlineDuplicate,
  HiOutlineExclamation,
  HiOutlineExclamationCircle,
  HiOutlineOfficeBuilding,
  HiOutlineRefresh,
  HiOutlineTable,
  HiOutlineX,
} from 'react-icons/hi';
import { apiClient, fetchWithRefresh, API_BASE_URL } from '../utils/http';
import { formatListingPrice, formatNumber } from '../utils/currency';
import { useNotification } from '../contexts/NotificationContext';
import {
  ACCEPT_ATTRIBUTE,
  MAX_FILE_BYTES,
  chunk,
  downloadBlob,
  downloadTextFile,
  isAcceptedFile,
  readWorkbook,
  toCsv,
} from '../utils/spreadsheet';
import { PageHeader, Button, Badge, Select, Spinner, EmptyState } from '../design-system';
import { useTranslation } from 'react-i18next';

/** Must not exceed IMPORT_CHUNK_LIMIT on the server. */
const CHUNK_SIZE = 500;

const STEPS = [
  { id: 1, label: 'Choose file' },
  { id: 2, label: 'Match columns' },
  { id: 3, label: 'Review' },
  { id: 4, label: 'Done' },
];

const DUPLICATE_MODES = [
  {
    id: 'skip',
    label: 'Leave the existing one alone',
    detail: 'Rows already in the system are skipped. Safest for topping up a list.',
  },
  {
    id: 'update',
    label: 'Update it with this row',
    detail: 'Overwrites the existing property with the values in your file.',
  },
  {
    id: 'create',
    label: 'Add it anyway',
    detail: 'Creates a second record. Only useful when the match is a coincidence.',
  },
];

function cx(...xs) {
  return xs.filter(Boolean).join(' ');
}

// ─── Step rail ────────────────────────────────────────────────────────────────

function StepRail({ current }) {
  return (
    <ol className='flex items-center gap-2 sm:gap-3 overflow-x-auto pb-1'>
      {STEPS.map((step, i) => {
        const done = current > step.id;
        const active = current === step.id;
        return (
          <li key={step.id} className='flex items-center gap-2 sm:gap-3 flex-shrink-0'>
            <div className='flex items-center gap-2'>
              <span
                className={cx(
                  'w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ring-1 transition-colors',
                  done && 'bg-emerald-500 text-white ring-emerald-500',
                  active && 'bg-slate-900 text-white ring-slate-900',
                  !done && !active && 'bg-white text-slate-400 ring-slate-200'
                )}
              >
                {done ? <HiOutlineCheckCircle className='w-4 h-4' /> : step.id}
              </span>
              <span
                className={cx(
                  'text-sm whitespace-nowrap',
                  active ? 'font-semibold text-slate-900' : 'text-slate-500'
                )}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && <span className='w-6 sm:w-10 h-px bg-slate-200' />}
          </li>
        );
      })}
    </ol>
  );
}

// ─── Summary tile ─────────────────────────────────────────────────────────────

const TILE_TONE = {
  emerald: 'border-t-emerald-500 text-emerald-700',
  amber: 'border-t-amber-500 text-amber-700',
  rose: 'border-t-rose-500 text-rose-700',
  slate: 'border-t-slate-400 text-slate-700',
};

function SummaryTile({ label, value, tone = 'slate', hint }) {
  return (
    <div className={cx('bg-white border border-slate-200 border-t-2 rounded-xl p-4', TILE_TONE[tone])}>
      <div className='text-2xl font-semibold tabular-nums leading-none'>{formatNumber(value)}</div>
      <div className='text-sm font-medium text-slate-700 mt-1.5'>{label}</div>
      {hint && <div className='text-xs text-slate-400 mt-0.5'>{hint}</div>}
    </div>
  );
}

// ─── Step 1 — choose a file ───────────────────────────────────────────────────

function SourceStep({
  categories,
  categorySlug,
  onCategoryChange,
  file,
  sheets,
  sheetIndex,
  onSheetChange,
  onFile,
  onClearFile,
  onDownloadTemplate,
  templateBusy,
  parsing,
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);
  const sheet = sheets[sheetIndex];

  return (
    <div className='flex flex-col gap-5'>
      <div className='bg-white border border-slate-200 rounded-xl p-5 shadow-sm'>
        <h2 className='text-base font-semibold text-slate-900'>{t('adminImport.1WhichKindOfPropertyIs')}</h2>
        <p className='text-sm text-slate-500 mt-0.5 mb-4'>{t('adminImport.theCategoryDecidesWhichExtraFields')}</p>
        <div className='grid grid-cols-1 sm:grid-cols-[minmax(0,20rem)_auto] gap-3 sm:items-end'>
          <Select
            label={t('adminImport.category')}
            value={categorySlug}
            onChange={(e) => onCategoryChange(e.target.value)}
          >
            <option value=''>{t('adminImport.selectACategory')}</option>
            {categories.map((c) => (
              <option key={c._id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </Select>
          <Button
            variant='secondary'
            icon={HiOutlineDocumentDownload}
            disabled={!categorySlug}
            loading={templateBusy}
            onClick={onDownloadTemplate}
          >{t('adminImport.downloadBlankTemplate')}</Button>
        </div>
        {categorySlug && (
          <p className='text-xs text-slate-400 mt-2.5'>{t('adminImport.theTemplateAlreadyHasTheRight')}</p>
        )}
      </div>

      <div className='bg-white border border-slate-200 rounded-xl p-5 shadow-sm'>
        <h2 className='text-base font-semibold text-slate-900'>{t('adminImport.2UploadYourList')}</h2>
        <p className='text-sm text-slate-500 mt-0.5 mb-4'>{t('adminImport.excelOrCsvStraightFromWherever')}</p>

        {!file ? (
          <div
            role='button'
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const dropped = e.dataTransfer.files?.[0];
              if (dropped) onFile(dropped);
            }}
            className={cx(
              'rounded-xl border-2 border-dashed px-6 py-10 text-center cursor-pointer transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
              dragging ? 'border-indigo-400 bg-indigo-50/60' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
            )}
          >
            <div className='w-11 h-11 rounded-xl bg-indigo-50 ring-1 ring-indigo-100 flex items-center justify-center mx-auto'>
              {parsing ? <Spinner /> : <HiOutlineCloudUpload className='w-5 h-5 text-indigo-600' />}
            </div>
            <p className='text-sm font-medium text-slate-800 mt-3'>
              {parsing ? 'Reading your file…' : 'Drop your file here, or click to browse'}
            </p>
            <p className='text-xs text-slate-400 mt-1'>{t('adminImport.xlsxXlsOrCsvUpTo')}</p>
            <input
              ref={inputRef}
              type='file'
              accept={ACCEPT_ATTRIBUTE}
              className='hidden'
              onChange={(e) => {
                const picked = e.target.files?.[0];
                if (picked) onFile(picked);
                e.target.value = '';
              }}
            />
          </div>
        ) : (
          <div className='flex flex-col gap-4'>
            <div className='flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3'>
              <div className='w-9 h-9 rounded-xl bg-emerald-50 ring-1 ring-emerald-100 flex items-center justify-center flex-shrink-0'>
                <HiOutlineTable className='w-4 h-4 text-emerald-600' />
              </div>
              <div className='min-w-0 flex-1'>
                <div className='text-sm font-medium text-slate-900 truncate'>{file.name}</div>
                <div className='text-xs text-slate-500'>
                  {sheet
                    ? `${formatNumber(sheet.rows.length)} rows · ${sheet.headers.length} columns`
                    : 'No readable rows'}
                </div>
              </div>
              <Button variant='ghost' size='sm' icon={HiOutlineX} onClick={onClearFile}>{t('adminImport.remove')}</Button>
            </div>

            {sheets.length > 1 && (
              <Select
                label={t('adminImport.sheet')}
                hint='This workbook has more than one sheet.'
                className='max-w-xs'
                value={String(sheetIndex)}
                onChange={(e) => onSheetChange(Number(e.target.value))}
              >
                {sheets.map((s, i) => (
                  <option key={s.name} value={i}>
                    {s.name} ({s.rows.length} rows)
                  </option>
                ))}
              </Select>
            )}

            {sheet && sheet.rows.length > 0 && (
              <div className='overflow-x-auto rounded-xl border border-slate-200'>
                <table className='w-full text-sm text-left'>
                  <thead className='bg-slate-50 border-b border-slate-200'>
                    <tr>
                      {sheet.headers.map((h, i) => (
                        <th
                          key={i}
                          className='px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap'
                        >
                          {h || <span className='text-slate-300'>(no heading)</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className='divide-y divide-slate-100'>
                    {sheet.rows.slice(0, 4).map((row, r) => (
                      <tr key={r}>
                        {sheet.headers.map((_, c) => (
                          <td key={c} className='px-3 py-2 text-slate-600 whitespace-nowrap max-w-[16rem] truncate'>
                            {String(row[c] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Step 2 — match columns ───────────────────────────────────────────────────

const CONFIDENCE_BADGE = {
  exact: null,
  likely: { variant: 'warning', text: 'Best guess' },
  none: { variant: 'slate', text: 'Not matched' },
};

function MapStep({ headers, rows, mapping, coreFields, categoryFields, categoryName, onChange }) {
  const coreByKey = useMemo(() => new Map(coreFields.map((f) => [f.key, f])), [coreFields]);
  const attrByKey = useMemo(() => new Map(categoryFields.map((f) => [f.key, f])), [categoryFields]);

  const requiredCore = useMemo(() => coreFields.filter((f) => f.required), [coreFields]);
  const requiredAttrs = useMemo(() => categoryFields.filter((f) => f.required), [categoryFields]);

  const mappedTo = useCallback(
    (target, key) => mapping.find((m) => m.target === target && m.key === key),
    [mapping]
  );

  const sampleFor = useCallback(
    (column) => {
      for (const row of rows) {
        const v = String(row[column] ?? '').trim();
        if (v) return v;
      }
      return '';
    },
    [rows]
  );

  const unmatched = mapping.filter((m) => m.target === 'ignore').length;

  const missingRequired = [
    ...requiredCore.filter((f) => !mappedTo('core', f.key)).map((f) => f.label),
    ...requiredAttrs.filter((f) => !mappedTo('attribute', f.key)).map((f) => f.label),
  ];

  return (
    <div className='flex flex-col gap-5'>
      <div className='bg-white border border-slate-200 rounded-xl p-5 shadow-sm'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div>
            <h2 className='text-base font-semibold text-slate-900'>{t('adminImport.whereShouldEachColumnGo')}</h2>
            <p className='text-sm text-slate-500 mt-0.5'>{t('adminImport.weHaveMatchedWhatWeRecognised')}</p>
          </div>
          <div className='flex items-center gap-2'>
            {unmatched > 0 && (
              <Badge variant='slate'>{unmatched} column{unmatched > 1 ? 's' : ''} ignored</Badge>
            )}
          </div>
        </div>

        {missingRequired.length > 0 && (
          <div className='mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3'>
            <HiOutlineExclamation className='w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5' />
            <div className='text-sm text-amber-900'>
              <span className='font-semibold'>Still needed: {missingRequired.join(', ')}.</span>{' '}
              Every row will be rejected until {missingRequired.length > 1 ? 'these are' : 'this is'} matched to a
              column.
            </div>
          </div>
        )}
      </div>

      <div className='overflow-x-auto rounded-xl border border-slate-200 bg-white'>
        <table className='w-full text-sm text-left'>
          <thead className='bg-slate-50 border-b border-slate-200'>
            <tr>
              <th className='px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider'>{t('adminImport.columnInYourFile')}</th>
              <th className='px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider'>{t('adminImport.exampleValue')}</th>
              <th className='px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-72'>{t('adminImport.importAs')}</th>
            </tr>
          </thead>
          <tbody className='divide-y divide-slate-100'>
            {headers.map((header, column) => {
              const map = mapping.find((m) => m.column === column) || { target: 'ignore', key: null };
              const badge = CONFIDENCE_BADGE[map.confidence] || null;
              const value =
                map.target === 'ignore' ? 'ignore' : `${map.target}:${map.key}`;
              const label =
                map.target === 'core'
                  ? coreByKey.get(map.key)?.label
                  : map.target === 'attribute'
                  ? attrByKey.get(map.key)?.label
                  : null;

              return (
                <tr key={column} className={cx(map.target === 'ignore' && 'bg-slate-50/50')}>
                  <td className='px-4 py-3 align-middle'>
                    <div className='flex items-center gap-2'>
                      <span className='font-medium text-slate-900'>
                        {header || <span className='text-slate-300 italic'>Column {column + 1}</span>}
                      </span>
                      {badge && map.target !== 'ignore' && (
                        <Badge variant={badge.variant} size='xs'>
                          {badge.text}
                        </Badge>
                      )}
                    </div>
                    {label && map.confidence === 'likely' && (
                      <div className='text-xs text-slate-400 mt-0.5'>Guessed as {label}</div>
                    )}
                  </td>
                  <td className='px-4 py-3 align-middle text-slate-500 max-w-[18rem] truncate'>
                    {sampleFor(column) || <span className='text-slate-300'>—</span>}
                  </td>
                  <td className='px-4 py-3 align-middle'>
                    <Select
                      value={value}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === 'ignore') {
                          onChange(column, { target: 'ignore', key: null, confidence: 'none' });
                          return;
                        }
                        const [target, key] = v.split(':');
                        onChange(column, { target, key, confidence: 'exact' });
                      }}
                    >
                      <option value='ignore'>{t('adminImport.donTImportThisColumn')}</option>
                      <optgroup label={t('adminImport.propertyDetails')}>
                        {coreFields.map((f) => (
                          <option key={f.key} value={`core:${f.key}`}>
                            {f.label}
                            {f.required ? ' (required)' : ''}
                          </option>
                        ))}
                      </optgroup>
                      {categoryFields.length > 0 && (
                        <optgroup label={`${categoryName} fields`}>
                          {categoryFields.map((f) => (
                            <option key={f.key} value={`attribute:${f.key}`}>
                              {f.label}
                              {f.required ? ' (required)' : ''}
                              {f.unit ? ` — ${f.unit}` : ''}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </Select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Step 3 — review ──────────────────────────────────────────────────────────

const ROW_STATUS = {
  ready: { variant: 'success', label: 'Ready' },
  duplicate: { variant: 'info', label: 'Already exists' },
  duplicate_in_file: { variant: 'warning', label: 'Repeated in file' },
  error: { variant: 'error', label: 'Cannot import' },
};

function ReviewStep({
  summary,
  rows,
  duplicateMode,
  onDuplicateMode,
  filter,
  onFilter,
  onDownloadIssues,
}) {
  const filtered = useMemo(() => {
    if (filter === 'issues') return rows.filter((r) => r.status !== 'ready' || r.warnings.length);
    if (filter === 'all') return rows;
    return rows.filter((r) => r.status === filter);
  }, [rows, filter]);

  const shown = filtered.slice(0, 200);

  return (
    <div className='flex flex-col gap-5'>
      <div className='grid grid-cols-2 lg:grid-cols-4 gap-3'>
        <SummaryTile label={t('adminImport.readyToImport')} value={summary.ready} tone='emerald' />
        <SummaryTile
          label={t('adminImport.alreadyInTheSystem')}
          value={summary.duplicates}
          tone='slate'
          hint={DUPLICATE_MODES.find((m) => m.id === duplicateMode)?.label}
        />
        <SummaryTile
          label={t('adminImport.repeatedInYourFile')}
          value={summary.duplicatesInFile}
          tone='amber'
          hint={summary.duplicatesInFile ? 'Only the first copy is imported' : undefined}
        />
        <SummaryTile
          label={t('adminImport.cannotImport')}
          value={summary.errors}
          tone={summary.errors ? 'rose' : 'slate'}
          hint={summary.errors ? 'These rows are skipped' : 'Nothing blocked'}
        />
      </div>

      {summary.duplicates > 0 && (
        <div className='bg-white border border-slate-200 rounded-xl p-5 shadow-sm'>
          <div className='flex items-start gap-3'>
            <div className='w-9 h-9 rounded-xl bg-blue-50 ring-1 ring-blue-100 flex items-center justify-center flex-shrink-0'>
              <HiOutlineDuplicate className='w-4 h-4 text-blue-600' />
            </div>
            <div className='min-w-0'>
              <h3 className='text-sm font-semibold text-slate-900'>
                {formatNumber(summary.duplicates)} of these are already in the system
              </h3>
              <p className='text-sm text-slate-500 mt-0.5'>{t('adminImport.matchedOnPropertyNumberOrOn')}</p>
            </div>
          </div>
          <div className='grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4'>
            {DUPLICATE_MODES.map((mode) => (
              <button
                key={mode.id}
                type='button'
                onClick={() => onDuplicateMode(mode.id)}
                className={cx(
                  'text-left rounded-xl border p-3.5 transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
                  duplicateMode === mode.id
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                )}
              >
                <div className='text-sm font-medium'>{mode.label}</div>
                <div className={cx('text-xs mt-1', duplicateMode === mode.id ? 'text-slate-300' : 'text-slate-500')}>
                  {mode.detail}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className='bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden'>
        <div className='flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-200'>
          <div className='flex items-center gap-1.5 flex-wrap'>
            {[
              { id: 'issues', label: 'Needs a look' },
              { id: 'error', label: 'Cannot import' },
              { id: 'duplicate', label: 'Already exists' },
              { id: 'all', label: 'Every row' },
            ].map((tab) => (
              <button
                key={tab.id}
                type='button'
                onClick={() => onFilter(tab.id)}
                className={cx(
                  'px-3 py-1.5 rounded-lg text-sm transition-colors',
                  filter === tab.id
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {summary.errors > 0 && (
            <Button variant='secondary' size='sm' icon={HiOutlineDocumentDownload} onClick={onDownloadIssues}>{t('adminImport.downloadTheProblemRows')}</Button>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className='px-5 py-10'>
            <EmptyState
              icon={HiOutlineCheckCircle}
              title={t('adminImport.nothingToLookAtHere')}
              body={t('adminImport.everyRowInThisViewIs')}
            />
          </div>
        ) : (
          <div className='overflow-x-auto'>
            <table className='w-full text-sm text-left'>
              <thead className='bg-slate-50 border-b border-slate-200'>
                <tr>
                  <th className='px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider'>{t('adminImport.row')}</th>
                  <th className='px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider'>{t('adminImport.property')}</th>
                  <th className='px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider'>{t('adminImport.price')}</th>
                  <th className='px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider'>{t('adminImport.status')}</th>
                  <th className='px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider'>{t('adminImport.whatWeFound')}</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-slate-100'>
                {shown.map((row) => {
                  const status = ROW_STATUS[row.status] || ROW_STATUS.ready;
                  return (
                    <tr key={row.rowNumber} className='align-top'>
                      <td className='px-4 py-3 text-slate-400 tabular-nums whitespace-nowrap'>{row.rowNumber}</td>
                      <td className='px-4 py-3'>
                        <div className='font-medium text-slate-900'>
                          {row.name || <span className='text-slate-300 italic'>{t('adminImport.noName')}</span>}
                        </div>
                        <div className='text-xs text-slate-500 mt-0.5'>
                          {[row.propertyNo, row.preview.locality, row.preview.city].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </td>
                      <td className='px-4 py-3 text-slate-600 whitespace-nowrap tabular-nums'>
                        {row.preview.regularPrice
                          ? formatListingPrice(row.preview.regularPrice)
                          : <span className='text-slate-300'>—</span>}
                      </td>
                      <td className='px-4 py-3'>
                        <Badge variant={status.variant} size='sm'>{status.label}</Badge>
                      </td>
                      <td className='px-4 py-3'>
                        {row.errors.length === 0 && row.warnings.length === 0 && row.status === 'ready' && (
                          <span className='text-slate-400'>—</span>
                        )}
                        {row.status === 'duplicate' && row.existingName && (
                          <div className='text-slate-500'>Matches “{row.existingName}” already saved.</div>
                        )}
                        {row.status === 'duplicate_in_file' && (
                          <div className='text-slate-500'>Same property as row {row.duplicateOfRow}.</div>
                        )}
                        <ul className='space-y-1'>
                          {row.errors.map((e, i) => (
                            <li key={`e${i}`} className='flex items-start gap-1.5 text-rose-700'>
                              <HiOutlineExclamationCircle className='w-4 h-4 flex-shrink-0 mt-0.5' />
                              <span>{e.message}</span>
                            </li>
                          ))}
                          {row.warnings.map((w, i) => (
                            <li key={`w${i}`} className='flex items-start gap-1.5 text-amber-700'>
                              <HiOutlineExclamation className='w-4 h-4 flex-shrink-0 mt-0.5' />
                              <span>{w.message}</span>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length > shown.length && (
              <div className='px-4 py-3 text-xs text-slate-400 border-t border-slate-100'>
                Showing the first {formatNumber(shown.length)} of{' '}
                {formatNumber(filtered.length)}. Download the problem rows to see them all.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Step 4 — result ──────────────────────────────────────────────────────────

function ResultStep({ result, categorySlug, onDownloadReport, onStartOver }) {
  const navigate = useNavigate();
  const total = result.created + result.updated;

  return (
    <div className='flex flex-col gap-5'>
      <div className='bg-white border border-slate-200 rounded-xl p-6 shadow-sm text-center'>
        <div
          className={cx(
            'w-12 h-12 rounded-2xl ring-1 flex items-center justify-center mx-auto',
            result.failed ? 'bg-amber-50 ring-amber-100' : 'bg-emerald-50 ring-emerald-100'
          )}
        >
          {result.failed ? (
            <HiOutlineExclamation className='w-6 h-6 text-amber-600' />
          ) : (
            <HiOutlineCheckCircle className='w-6 h-6 text-emerald-600' />
          )}
        </div>
        <h2 className='text-lg font-semibold text-slate-900 mt-3'>
          {total > 0
            ? `${formatNumber(total)} propert${total === 1 ? 'y is' : 'ies are'} in your system`
            : 'Nothing was imported'}
        </h2>
        <p className='text-sm text-slate-500 mt-1'>
          {formatNumber(result.created)} added
          {result.updated ? `, ${formatNumber(result.updated)} updated` : ''}
          {result.skipped ? `, ${formatNumber(result.skipped)} skipped` : ''}
          {result.failed ? `, ${formatNumber(result.failed)} failed` : ''}.
        </p>
        <div className='flex flex-wrap items-center justify-center gap-2 mt-5'>
          <Button
            icon={HiOutlineOfficeBuilding}
            onClick={() => navigate(`/properties?category=${encodeURIComponent(categorySlug)}`)}
          >{t('adminImport.viewTheProperties')}</Button>
          {(result.failed > 0 || result.skipped > 0) && (
            <Button variant='secondary' icon={HiOutlineDocumentDownload} onClick={onDownloadReport}>{t('adminImport.downloadWhatWasSkipped')}</Button>
          )}
          <Button variant='ghost' icon={HiOutlineRefresh} onClick={onStartOver}>{t('adminImport.importAnotherFile')}</Button>
        </div>
      </div>

      <div className='grid grid-cols-2 lg:grid-cols-4 gap-3'>
        <SummaryTile label={t('adminImport.added')} value={result.created} tone='emerald' />
        <SummaryTile label={t('adminImport.updated')} value={result.updated} tone='slate' />
        <SummaryTile label={t('adminImport.skipped')} value={result.skipped} tone='amber' />
        <SummaryTile label={t('adminImport.failed')} value={result.failed} tone={result.failed ? 'rose' : 'slate'} />
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminImport() {
  const { t } = useTranslation();
  const { showError, showSuccess } = useNotification();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [categories, setCategories] = useState([]);
  const [categorySlug, setCategorySlug] = useState('');

  const [file, setFile] = useState(null);
  const [sheets, setSheets] = useState([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [parsing, setParsing] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);

  const [mapping, setMapping] = useState([]);
  const [coreFields, setCoreFields] = useState([]);
  const [categoryFields, setCategoryFields] = useState([]);
  const [mappingBusy, setMappingBusy] = useState(false);

  const [preview, setPreview] = useState(null);
  const [previewProgress, setPreviewProgress] = useState(null);
  const [filter, setFilter] = useState('issues');
  const [duplicateMode, setDuplicateMode] = useState('skip');

  const [committing, setCommitting] = useState(false);
  const [commitProgress, setCommitProgress] = useState(null);
  const [result, setResult] = useState(null);

  const sheet = sheets[sheetIndex];
  const headers = sheet?.headers || [];
  const rows = useMemo(() => sheet?.rows || [], [sheet]);
  const categoryName = categories.find((c) => c.slug === categorySlug)?.name || 'Category';

  useEffect(() => {
    (async () => {
      try {
        const data = await apiClient.get('/category/list');
        setCategories(Array.isArray(data) ? data : []);
      } catch (e) {
        showError('Could not load your categories. Reload the page to try again.');
      }
    })();
    // showError identity is stable enough for a mount-only fetch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── File handling ──────────────────────────────────────────────────────────

  const handleFile = async (picked) => {
    if (!isAcceptedFile(picked)) {
      showError('That file type is not supported. Upload an .xlsx, .xls or .csv file.');
      return;
    }
    if (picked.size > MAX_FILE_BYTES) {
      showError('That file is over 15 MB. Split it into smaller files and import them one at a time.');
      return;
    }

    setParsing(true);
    try {
      const { sheets: parsed } = await readWorkbook(picked);
      const usable = parsed.filter((s) => s.headers.length > 0);
      if (!usable.length) {
        showError('We could not find any columns in that file. Check that the first row holds the headings.');
        return;
      }
      // Default to the sheet with the most rows — in a workbook with a cover
      // page, that's the data.
      const best = usable.reduce((a, b) => (b.rows.length > a.rows.length ? b : a), usable[0]);
      setFile(picked);
      setSheets(usable);
      setSheetIndex(usable.indexOf(best));
      setPreview(null);
      setResult(null);
    } catch (e) {
      showError('That file could not be read. If it is password-protected, save a plain copy and try again.');
    } finally {
      setParsing(false);
    }
  };

  const clearFile = () => {
    setFile(null);
    setSheets([]);
    setSheetIndex(0);
    setMapping([]);
    setPreview(null);
    setResult(null);
  };

  const downloadTemplate = async () => {
    setTemplateBusy(true);
    try {
      const res = await fetchWithRefresh(
        `${API_BASE_URL}/api/listing/import/template?category=${encodeURIComponent(categorySlug)}`
      );
      if (!res.ok) throw new Error('Template download failed');
      downloadBlob(`${categorySlug}-import-template.csv`, await res.blob());
    } catch (e) {
      showError('Could not download the template. Try again in a moment.');
    } finally {
      setTemplateBusy(false);
    }
  };

  // ── Step transitions ───────────────────────────────────────────────────────

  const goToMapping = async () => {
    setMappingBusy(true);
    try {
      const res = await apiClient.post('/listing/import/suggest-mapping', {
        category: categorySlug,
        headers,
      });
      const data = res?.data || {};
      setMapping(data.mapping || []);
      setCoreFields(data.coreFields || []);
      setCategoryFields(data.categoryFields || []);
      setStep(2);
    } catch (e) {
      showError(e?.message || 'Could not read your column headings.');
    } finally {
      setMappingBusy(false);
    }
  };

  const updateMapping = (column, next) => {
    setMapping((prev) =>
      prev.map((m) => {
        if (m.column === column) return { ...m, ...next };
        // A target can only be filled from one column; clear any previous holder.
        if (next.target !== 'ignore' && m.target === next.target && m.key === next.key) {
          return { ...m, target: 'ignore', key: null, confidence: 'none' };
        }
        return m;
      })
    );
    setPreview(null);
  };

  const runPreview = async () => {
    setPreviewProgress({ done: 0, total: rows.length });
    try {
      const batches = chunk(rows, CHUNK_SIZE);
      const allRows = [];
      let done = 0;

      for (let i = 0; i < batches.length; i += 1) {
        const res = await apiClient.post('/listing/import/preview', {
          category: categorySlug,
          mapping,
          rows: batches[i],
          startRow: 2 + i * CHUNK_SIZE,
        });
        allRows.push(...(res?.data?.rows || []));
        done += batches[i].length;
        setPreviewProgress({ done, total: rows.length });
      }

      // Duplicate detection runs per chunk, so a property repeated across two
      // chunks would otherwise slip through as new. Reconcile across the whole
      // file here, using the same first-wins rule the server applies.
      const seen = new Map();
      const reconciled = allRows.map((row) => {
        if (row.status === 'error') return row;
        const key = (
          row.propertyNo
            ? `no:${row.propertyNo}`
            : `na:${row.name}|${row.preview.address || ''}`
        ).toLowerCase();
        if (seen.has(key)) {
          return { ...row, status: 'duplicate_in_file', duplicateOfRow: seen.get(key) };
        }
        seen.set(key, row.rowNumber);
        return row;
      });

      const summary = {
        total: reconciled.length,
        ready: reconciled.filter((r) => r.status === 'ready').length,
        duplicates: reconciled.filter((r) => r.status === 'duplicate').length,
        duplicatesInFile: reconciled.filter((r) => r.status === 'duplicate_in_file').length,
        errors: reconciled.filter((r) => r.status === 'error').length,
        warnings: reconciled.reduce((n, r) => n + r.warnings.length, 0),
      };

      setPreview({ summary, rows: reconciled });
      setFilter(summary.errors || summary.warnings ? 'issues' : 'all');
      setStep(3);
    } catch (e) {
      showError(e?.message || 'We could not check your file. Nothing has been saved.');
    } finally {
      setPreviewProgress(null);
    }
  };

  const runImport = async () => {
    setCommitting(true);
    setCommitProgress({ done: 0, total: rows.length });
    const totals = { created: 0, updated: 0, skipped: 0, failed: 0, rows: [] };

    try {
      const batches = chunk(rows, CHUNK_SIZE);
      let done = 0;

      for (let i = 0; i < batches.length; i += 1) {
        const res = await apiClient.post('/listing/import/commit', {
          category: categorySlug,
          mapping,
          rows: batches[i],
          startRow: 2 + i * CHUNK_SIZE,
          duplicateMode,
          skipInvalid: true,
        });
        const data = res?.data || {};
        totals.created += data.created || 0;
        totals.updated += data.updated || 0;
        totals.skipped += data.skipped || 0;
        totals.failed += data.failed || 0;
        totals.rows.push(...(data.rows || []));
        done += batches[i].length;
        setCommitProgress({ done, total: rows.length });
      }

      setResult(totals);
      setStep(4);
      if (totals.created || totals.updated) {
        showSuccess(`Imported ${(totals.created + formatNumber(totals.updated))} properties.`);
        window.dispatchEvent(new Event('listing-created'));
      }
    } catch (e) {
      showError(
        e?.message ||
          'The import stopped partway. Anything already imported has been saved — re-run the file and duplicates will be skipped.'
      );
    } finally {
      setCommitting(false);
      setCommitProgress(null);
    }
  };

  const startOver = () => {
    clearFile();
    setStep(1);
  };

  // ── Downloads ──────────────────────────────────────────────────────────────

  const downloadIssues = () => {
    const problems = (preview?.rows || []).filter((r) => r.status === 'error' || r.warnings.length);
    const out = [
      ['Sheet row', 'Problem', ...headers],
      ...problems.map((r) => [
        r.rowNumber,
        [...r.errors.map((e) => e.message), ...r.warnings.map((w) => w.message)].join(' '),
        ...(rows[r.rowNumber - 2] || []),
      ]),
    ];
    downloadTextFile(`import-problems-${categorySlug}.csv`, toCsv(out));
  };

  const downloadReport = () => {
    const notImported = (result?.rows || []).filter((r) => r.outcome === 'skipped' || r.outcome === 'failed');
    const out = [
      ['Sheet row', 'Outcome', 'Reason', ...headers],
      ...notImported.map((r) => [
        r.rowNumber,
        r.outcome,
        r.reason || '',
        ...(rows[r.rowNumber - 2] || []),
      ]),
    ];
    downloadTextFile(`import-not-imported-${categorySlug}.csv`, toCsv(out));
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const canLeaveStep1 = Boolean(categorySlug && sheet && sheet.rows.length > 0);
  const importable = preview
    ? preview.summary.ready + (duplicateMode !== 'skip' ? preview.summary.duplicates : 0)
    : 0;

  return (
    <main className='flex flex-col gap-6'>
      <PageHeader
        title={t('adminImport.importProperties')}
        description={t('adminImport.bringAWholeListInFrom')}
        actions={
          <Button variant='secondary' icon={HiOutlineArrowLeft} onClick={() => navigate('/properties')}>{t('adminImport.allProperties')}</Button>
        }
      />

      <div className='bg-white border border-slate-200 rounded-xl px-5 py-4 shadow-sm'>
        <StepRail current={step} />
      </div>

      {step === 1 && (
        <SourceStep
          categories={categories}
          categorySlug={categorySlug}
          onCategoryChange={(slug) => {
            setCategorySlug(slug);
            setMapping([]);
            setPreview(null);
          }}
          file={file}
          sheets={sheets}
          sheetIndex={sheetIndex}
          onSheetChange={(i) => {
            setSheetIndex(i);
            setMapping([]);
            setPreview(null);
          }}
          onFile={handleFile}
          onClearFile={clearFile}
          onDownloadTemplate={downloadTemplate}
          templateBusy={templateBusy}
          parsing={parsing}
        />
      )}

      {step === 2 && (
        <MapStep
          headers={headers}
          rows={rows}
          mapping={mapping}
          coreFields={coreFields}
          categoryFields={categoryFields}
          categoryName={categoryName}
          onChange={updateMapping}
        />
      )}

      {step === 3 && preview && (
        <ReviewStep
          summary={preview.summary}
          rows={preview.rows}
          duplicateMode={duplicateMode}
          onDuplicateMode={setDuplicateMode}
          filter={filter}
          onFilter={setFilter}
          onDownloadIssues={downloadIssues}
        />
      )}

      {step === 4 && result && (
        <ResultStep
          result={result}
          categorySlug={categorySlug}
          onDownloadReport={downloadReport}
          onStartOver={startOver}
        />
      )}

      {/* Progress while a long run is in flight */}
      {(previewProgress || commitProgress) && (
        <div className='bg-white border border-slate-200 rounded-xl p-5 shadow-sm'>
          {(() => {
            const p = commitProgress || previewProgress;
            const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
            return (
              <>
                <div className='flex items-center justify-between text-sm'>
                  <span className='font-medium text-slate-800'>
                    {commitProgress ? 'Importing your properties…' : 'Checking your file…'}
                  </span>
                  <span className='text-slate-500 tabular-nums'>
                    {formatNumber(p.done)} of {formatNumber(p.total)}
                  </span>
                </div>
                <div className='mt-2 h-2 rounded-full bg-slate-100 overflow-hidden'>
                  <div
                    className='h-full rounded-full bg-indigo-600 transition-[width] duration-300'
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className='text-xs text-slate-400 mt-2'>
                  {commitProgress
                    ? 'Keep this tab open until it finishes.'
                    : 'Nothing is saved during this check.'}
                </p>
              </>
            );
          })()}
        </div>
      )}

      {/* Footer navigation */}
      {step < 4 && (
        <div className='flex flex-wrap items-center justify-between gap-3 sticky bottom-0 bg-slate-50/95 backdrop-blur border-t border-slate-200 py-4 -mx-4 px-4 sm:-mx-6 sm:px-6'>
          <div className='text-sm text-slate-500'>
            {step === 1 && sheet && `${formatNumber(rows.length)} rows ready to map`}
            {step === 2 && `${mapping.filter((m) => m.target !== 'ignore').length} of ${headers.length} columns will be imported`}
            {step === 3 && preview && (
              <>
                <span className='font-medium text-slate-900'>
                  {formatNumber(importable)} propert{importable === 1 ? 'y' : 'ies'}
                </span>{' '}
                will be saved
                {preview.summary.errors > 0 && `, ${formatNumber(preview.summary.errors)} skipped`}
              </>
            )}
          </div>
          <div className='flex items-center gap-2'>
            {step > 1 && (
              <Button
                variant='secondary'
                icon={HiOutlineArrowLeft}
                disabled={committing || Boolean(previewProgress)}
                onClick={() => setStep(step - 1)}
              >{t('adminImport.back')}</Button>
            )}
            {step === 1 && (
              <Button
                iconRight={HiOutlineArrowRight}
                disabled={!canLeaveStep1}
                loading={mappingBusy}
                onClick={goToMapping}
              >{t('adminImport.matchColumns')}</Button>
            )}
            {step === 2 && (
              <Button
                iconRight={HiOutlineArrowRight}
                loading={Boolean(previewProgress)}
                onClick={runPreview}
              >{t('adminImport.checkMyFile')}</Button>
            )}
            {step === 3 && (
              <Button
                icon={HiOutlineCheckCircle}
                loading={committing}
                disabled={importable === 0}
                onClick={runImport}
              >
                {importable === 0
                  ? 'Nothing to import'
                  : `Import ${formatNumber(importable)} propert${importable === 1 ? 'y' : 'ies'}`}
              </Button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

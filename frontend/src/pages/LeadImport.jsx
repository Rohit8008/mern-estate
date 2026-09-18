import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HiUpload, HiCheckCircle, HiExclamation, HiArrowRight, HiRefresh,
} from 'react-icons/hi';
import { PageHeader, Button, Select, Spinner, Badge } from '../design-system';
import { readWorkbook, isAcceptedFile, ACCEPT_ATTRIBUTE, MAX_FILE_BYTES } from '../utils/spreadsheet';
import { apiClient } from '../utils/http';
import { useNotification } from '../contexts/NotificationContext';
import usePageTitle from '../hooks/usePageTitle';

/**
 * Bringing portal enquiries in from a spreadsheet.
 *
 * 99acres, MagicBricks and Housing all export enquiries as a CSV, which is the
 * free path to portal integration: no paid API, no partner agreement. The
 * agency downloads what is already theirs and this maps it onto leads.
 *
 * Preview before commit, because an import that silently creates 400
 * duplicates is worse than one that refuses.
 */

const STATUS_STYLE = {
  new:       { variant: 'success', label: 'Will import' },
  duplicate: { variant: 'warning', label: 'Already on file' },
  error:     { variant: 'error',   label: 'Cannot import' },
};

export default function LeadImport() {
  usePageTitle('Import leads');
  const { t } = useTranslation();
  const { showSuccess, showError } = useNotification();

  const inputRef = useRef(null);
  const [step, setStep] = useState('upload'); // upload → map → review → done
  const [sheet, setSheet] = useState(null);
  const [fields, setFields] = useState([]);
  const [mapping, setMapping] = useState({});
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);

  /**
   * Which channel these leads came from.
   *
   * The reason to import a portal export at all is to know later which channel
   * pays for itself, and the ROI report divides spend by source. Leaving it as
   * a generic "Import" throws that away, so the source is asked for before the
   * write rather than inferred afterwards.
   */
  const [sources, setSources] = useState([]);
  const [defaultSource, setDefaultSource] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setStep('upload'); setSheet(null); setMapping({});
    setPreview(null); setResult(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const onFile = async (file) => {
    if (!file) return;
    if (!isAcceptedFile(file)) return showError('Use a .csv, .xlsx or .xls file');
    if (file.size > MAX_FILE_BYTES) return showError('That file is larger than 15 MB');

    setBusy(true);
    try {
      const { sheets } = await readWorkbook(file);
      const first = sheets.find((s) => s.rows.length) || sheets[0];
      if (!first?.headers?.length) throw new Error('That sheet has no column headings');

      const [fieldsRes, mapRes, sourcesRes] = await Promise.all([
        apiClient.get('/lead-import/fields'),
        apiClient.post('/lead-import/suggest-mapping', { headers: first.headers }),
        apiClient.get('/lead-sources').catch(() => null),
      ]);

      setSheet(first);
      setFields(fieldsRes?.data?.fields || []);
      setSources(sourcesRes?.data?.sources || []);
      setMapping(mapRes?.data?.mapping || {});
      setStep('map');
    } catch (err) {
      showError(err?.message || 'Could not read that file');
    }
    setBusy(false);
  };

  const runPreview = async () => {
    setBusy(true);
    try {
      const res = await apiClient.post('/lead-import/preview', { rows: sheet.rows, mapping });
      setPreview(res?.data || null);
      setStep('review');
    } catch (err) {
      showError(err?.message || 'Could not check that file');
    }
    setBusy(false);
  };

  const commit = async () => {
    setBusy(true);
    try {
      const res = await apiClient.post('/lead-import/commit', {
        rows: sheet.rows,
        mapping,
        defaultSource: defaultSource || undefined,
      });
      setResult(res?.data || null);
      setStep('done');
      showSuccess(res?.message || 'Imported');
    } catch (err) {
      showError(err?.message || 'Could not import');
    }
    setBusy(false);
  };

  /** Which field each column is mapped to, for the select controls. */
  const columnChoice = (index) => mapping[index] ?? '';

  const setColumn = (index, key) => {
    setMapping((prev) => {
      const next = { ...prev };
      // A field can only come from one column; clear any previous owner.
      Object.keys(next).forEach((i) => { if (next[i] === key) delete next[i]; });
      if (key) next[index] = key;
      else delete next[index];
      return next;
    });
  };

  const requiredMissing = useMemo(() => {
    const mapped = new Set(Object.values(mapping));
    return fields.filter((f) => f.required && !mapped.has(f.key)).map((f) => f.label);
  }, [fields, mapping]);

  return (
    <div className='min-h-screen bg-slate-50'>
      <div className='max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5'>
        <PageHeader
          title={t('leadImport.title')}
          description={t('leadImport.subtitle')}
          actions={step !== 'upload' && (
            <Button variant='secondary' icon={HiRefresh} onClick={reset}>
              {t('leadImport.startOver')}
            </Button>
          )}
        />

        {step === 'upload' && (
          <div className='bg-white border border-slate-200 rounded-xl p-8 shadow-sm'>
            <button
              type='button'
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className='w-full flex flex-col items-center justify-center py-14 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:border-indigo-300 hover:text-indigo-500 transition-colors'
            >
              {busy ? <Spinner /> : <HiUpload className='w-9 h-9 mb-3' />}
              <span className='text-sm font-medium text-slate-700'>{t('leadImport.chooseFile')}</span>
              <span className='text-xs mt-1'>{t('leadImport.fileHint')}</span>
            </button>

            <input
              ref={inputRef}
              type='file'
              accept={ACCEPT_ATTRIBUTE}
              hidden
              onChange={(e) => onFile(e.target.files?.[0])}
            />

            <p className='text-xs text-slate-500 mt-5 leading-relaxed'>
              {t('leadImport.portalHint')}
            </p>
          </div>
        )}

        {step === 'map' && sheet && (
          <div className='bg-white border border-slate-200 rounded-xl p-5 shadow-sm'>
            <h2 className='text-base font-semibold text-slate-900 mb-1'>{t('leadImport.checkColumns')}</h2>
            <p className='text-xs text-slate-500 mb-4'>{t('leadImport.checkColumnsHint')}</p>

            <div className='space-y-2 max-h-[26rem] overflow-y-auto pr-1'>
              {sheet.headers.map((header, index) => (
                <div key={index} className='flex items-center gap-3'>
                  <div className='w-1/3 min-w-0'>
                    <p className='text-sm font-medium text-slate-800 truncate'>{header || `Column ${index + 1}`}</p>
                    <p className='text-xs text-slate-400 truncate'>{String(sheet.rows[0]?.[index] ?? '')}</p>
                  </div>
                  <HiArrowRight className='w-4 h-4 text-slate-300 flex-shrink-0' />
                  <div className='flex-1'>
                    <Select value={columnChoice(index)} onChange={(e) => setColumn(index, e.target.value)}>
                      <option value=''>{t('leadImport.dontImport')}</option>
                      {fields.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}{f.required ? ' *' : ''}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
              ))}
            </div>

            {requiredMissing.length > 0 && (
              <p className='flex items-center gap-1.5 text-xs text-amber-700 mt-4'>
                <HiExclamation className='w-4 h-4 flex-shrink-0' />
                {t('leadImport.stillNeed')} {requiredMissing.join(', ')}
              </p>
            )}

            <div className='flex justify-end mt-5'>
              <Button onClick={runPreview} disabled={busy || requiredMissing.length > 0}>
                {busy ? t('common.loading') : t('leadImport.checkFile')}
              </Button>
            </div>
          </div>
        )}

        {step === 'review' && preview && (
          <div className='space-y-4'>
            <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
              {[
                ['total', preview.summary.total, 'slate'],
                ['new', preview.summary.new, 'emerald'],
                ['duplicates', preview.summary.duplicates, 'amber'],
                ['errors', preview.summary.errors, 'rose'],
              ].map(([key, value]) => (
                <div key={key} className='bg-white border border-slate-200 rounded-xl p-4 text-center'>
                  <div className='text-2xl font-semibold tabular-nums text-slate-900'>{value}</div>
                  <div className='text-xs text-slate-500 mt-0.5'>{t(`leadImport.${key}`)}</div>
                </div>
              ))}
            </div>

            <div className='bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden'>
              <ul className='divide-y divide-slate-100 max-h-[24rem] overflow-y-auto'>
                {preview.rows.slice(0, 200).map((row) => {
                  const style = STATUS_STYLE[row.status] || STATUS_STYLE.error;
                  return (
                    <li key={row.rowNumber} className='flex items-start gap-3 px-4 py-2.5'>
                      <span className='text-xs text-slate-400 tabular-nums w-10 flex-shrink-0'>
                        {row.rowNumber}
                      </span>
                      <div className='flex-1 min-w-0'>
                        <p className='text-sm text-slate-800 truncate'>
                          {row.values?.name || '—'}
                          {row.values?.phone ? ` · ${row.values.phone}` : ''}
                        </p>
                        {row.errors?.length > 0 && (
                          <p className='text-xs text-rose-600'>{row.errors.join('; ')}</p>
                        )}
                      </div>
                      <Badge variant={style.variant}>{t(`leadImport.status.${row.status}`)}</Badge>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className='bg-white border border-slate-200 rounded-xl p-4'>
              <label className='block text-sm font-medium text-slate-700 mb-1'>
                {t('leadImport.whereFrom')}
              </label>
              <p className='text-xs text-slate-500 mb-2'>{t('leadImport.whereFromHint')}</p>
              <Select value={defaultSource} onChange={(e) => setDefaultSource(e.target.value)}>
                <option value=''>{t('leadImport.sourceFromFile')}</option>
                {sources.map((s) => (
                  <option key={s._id} value={s.name}>{s.name}</option>
                ))}
              </Select>
            </div>

            <div className='flex items-center justify-between gap-3 flex-wrap'>
              <p className='text-xs text-slate-500'>{t('leadImport.skipHint')}</p>
              <Button onClick={commit} disabled={busy || preview.summary.new === 0}>
                {busy
                  ? t('common.loading')
                  : `${t('leadImport.import')} ${preview.summary.new}`}
              </Button>
            </div>
          </div>
        )}

        {step === 'done' && result && (
          <div className='bg-white border border-slate-200 rounded-xl p-8 shadow-sm text-center'>
            <HiCheckCircle className='w-12 h-12 text-emerald-500 mx-auto mb-3' />
            <h2 className='text-lg font-semibold text-slate-900'>
              {result.created} {t('leadImport.leadsImported')}
            </h2>
            <p className='text-sm text-slate-500 mt-1'>
              {result.skipped?.duplicates || 0} {t('leadImport.alreadyOnFile')} ·{' '}
              {result.skipped?.errors || 0} {t('leadImport.couldNotRead')}
            </p>
            <div className='flex items-center justify-center gap-2 mt-6'>
              <Button variant='secondary' onClick={reset}>{t('leadImport.importAnother')}</Button>
              <Button onClick={() => { window.location.href = '/clients'; }}>
                {t('leadImport.viewLeads')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

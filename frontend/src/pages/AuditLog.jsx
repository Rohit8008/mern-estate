import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiClipboardList, HiDownload, HiSearch, HiRefresh } from 'react-icons/hi';
import { PageHeader, Button, EmptyState, Spinner, Input, Select, Badge } from '../design-system';
import { apiClient, fetchWithRefresh } from '../utils/http';
import { useNotification } from '../contexts/NotificationContext';
import usePageTitle from '../hooks/usePageTitle';
import { formatDate } from '../utils/currency';

/**
 * The workspace audit trail.
 *
 * Activity was being written for eight kinds of record and the read endpoint
 * accepted two, with no workspace-wide view at all — so "who deleted that?" had
 * no answer even though the answer was in the database.
 */

/** Colour by what kind of change it was. Literal class strings only. */
const ACTION_VARIANT = (action) => {
  if (/created$/.test(action)) return 'success';
  if (/deleted|erased/.test(action)) return 'error';
  if (/assigned|stage_changed/.test(action)) return 'purple';
  if (/updated|saved/.test(action)) return 'info';
  return 'slate';
};

const PAGE_SIZE = 50;

export default function AuditLog() {
  usePageTitle('Audit log');
  const { t } = useTranslation();
  const { showError } = useNotification();

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [entityTypes, setEntityTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [filters, setFilters] = useState({ q: '', entityType: '', since: '', until: '' });

  const buildQuery = useCallback((extra = {}) => {
    const params = new URLSearchParams();
    Object.entries({ ...filters, ...extra }).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return params.toString();
  }, [filters]);

  const load = useCallback(async (nextOffset = 0, append = false) => {
    setLoading(true);
    try {
      const res = await apiClient.get(
        `/activity/search?${buildQuery({ limit: PAGE_SIZE, offset: nextOffset })}`
      );
      const data = res?.data || {};
      setItems((prev) => (append ? [...prev, ...(data.items || [])] : data.items || []));
      setTotal(Number(data.total) || 0);
      setEntityTypes(data.entityTypes || []);
      setOffset(nextOffset);
    } catch (err) {
      showError(err?.message || 'Could not load the audit log');
    }
    setLoading(false);
  }, [buildQuery, showError]);

  useEffect(() => { load(0); }, [load]);

  /**
   * Download via fetch rather than a plain link: the export needs the session
   * cookie and the refresh-on-401 path, which an <a href> would skip.
   */
  const exportCsv = async () => {
    try {
      const response = await fetchWithRefresh(`/api/activity/export?${buildQuery()}`);
      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      showError(err?.message || 'Could not export');
    }
  };

  const setFilter = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className='min-h-screen bg-slate-50'>
      <div className='max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5'>
        <PageHeader
          title={t('audit.title')}
          description={`${total} ${t('audit.description').toLowerCase()}`}
          actions={
            <>
              <Button variant='secondary' icon={HiRefresh} onClick={() => load(0)}>
                {t('common.refresh')}
              </Button>
              <Button variant='secondary' icon={HiDownload} onClick={exportCsv} disabled={!total}>
                {t('common.export')}
              </Button>
            </>
          }
        />

        <div className='bg-white border border-slate-200 rounded-xl p-4 shadow-sm'>
          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3'>
            <Input
              label={t('common.search')}
              icon={HiSearch}
              value={filters.q}
              onChange={setFilter('q')}
              placeholder={t('auditLog.actionOrMessage')}
            />
            <Select label={t('audit.entityType')} value={filters.entityType} onChange={setFilter('entityType')}>
              <option value=''>{t('common.none')}</option>
              {entityTypes.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </Select>
            <Input label={t('auditLog.from')} type='date' value={filters.since} onChange={setFilter('since')} />
            <Input label={t('auditLog.to')} type='date' value={filters.until} onChange={setFilter('until')} />
          </div>
        </div>

        <div className='bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden'>
          {loading && !items.length ? (
            <div className='py-16 flex justify-center'><Spinner /></div>
          ) : !items.length ? (
            <EmptyState
              icon={HiClipboardList}
              title={t('audit.empty')}
              body={t('auditLog.changesToClientsTasksOwnersCategories')}
            />
          ) : (
            <ul className='divide-y divide-slate-100'>
              {items.map((entry) => (
                <li key={entry._id} className='px-5 py-3.5'>
                  <div className='flex items-start justify-between gap-3 flex-wrap'>
                    <div className='min-w-0 flex-1'>
                      <div className='flex items-center gap-2 flex-wrap'>
                        <Badge variant={ACTION_VARIANT(entry.action)}>{entry.action}</Badge>
                        <span className='text-xs text-slate-400'>{entry.entityType}</span>
                      </div>
                      <p className='text-sm text-slate-800 mt-1'>{entry.message}</p>

                      {entry.changes && (
                        <ul className='mt-1.5 space-y-0.5'>
                          {Object.entries(entry.changes).map(([field, change]) => (
                            <li key={field} className='text-xs text-slate-500'>
                              <span className='font-medium text-slate-600'>{field}</span>
                              {': '}
                              <span className='line-through text-slate-400'>{String(change.from ?? '—')}</span>
                              {' → '}
                              <span className='text-slate-700'>{String(change.to ?? '—')}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className='text-right flex-shrink-0'>
                      <p className='text-xs font-medium text-slate-700'>
                        {entry.createdBy?.username || t('common.unknown')}
                      </p>
                      <p className='text-xs text-slate-400'>{formatDate(entry.createdAt, { hour: '2-digit', minute: '2-digit' })}</p>
                      {entry.ip && <p className='text-xs text-slate-300 font-mono'>{entry.ip}</p>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {items.length < total && (
          <div className='flex justify-center'>
            <Button variant='secondary' onClick={() => load(offset + PAGE_SIZE, true)} disabled={loading}>
              {loading ? t('common.loading') : t('common.loadMore')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

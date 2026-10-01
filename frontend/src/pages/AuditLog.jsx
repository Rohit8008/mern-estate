import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiClipboardList, HiDownload, HiSearch, HiRefresh, HiX } from 'react-icons/hi';
import {
  PageHeader, Button, EmptyState, Input, Select, Badge,
  Table, Thead, Th, Tbody, Tr, Td, SkeletonRows, Pagination,
} from '../design-system';
import { apiClient, fetchWithRefresh } from '../utils/http';
import { useNotification } from '../contexts/NotificationContext';
import usePageTitle from '../hooks/usePageTitle';
import { formatDate } from '../utils/currency';
import { localDateString } from '../utils/localDate';

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

const EMPTY_FILTERS = { q: '', entityType: '', action: '', userId: '', since: '', until: '' };
const COLUMNS = 5;

export default function AuditLog() {
  usePageTitle('Audit log');
  const { t } = useTranslation();
  const { showError } = useNotification();

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [options, setOptions] = useState({ entityTypes: [], actions: [], actors: [] });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  // The search box is debounced; the other filters apply at once.
  const [query, setQuery] = useState('');

  // Every filter change goes back to the first page in the same update — page 7
  // of a narrower result is usually past its end, and resetting in a separate
  // effect would fetch the stale page first.
  const applyFilters = useCallback((update) => {
    setFilters(update);
    setPage(1);
  }, []);

  useEffect(() => {
    if (filters.q === query) return undefined;
    const id = setTimeout(() => applyFilters((f) => ({ ...f, q: query })), 300);
    return () => clearTimeout(id);
  }, [query, filters.q, applyFilters]);

  const buildQuery = useCallback((extra = {}) => {
    const params = new URLSearchParams();
    Object.entries({ ...filters, ...extra }).forEach(([key, value]) => {
      if (value !== '' && value !== undefined && value !== null) params.set(key, value);
    });
    return params.toString();
  }, [filters]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(
        `/activity/search?${buildQuery({ limit: pageSize, offset: (page - 1) * pageSize })}`
      );
      const data = res?.data || {};
      setItems(data.items || []);
      setTotal(Number(data.total) || 0);
      setOptions({
        entityTypes: data.entityTypes || [],
        actions: data.actions || [],
        actors: data.actors || [],
      });
    } catch (err) {
      showError(err?.message || 'Could not load the audit log');
    }
    setLoading(false);
  }, [buildQuery, page, pageSize, showError]);

  useEffect(() => { load(); }, [load]);

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
      link.download = `audit-log-${localDateString()}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      showError(err?.message || 'Could not export');
    }
  };

  const setFilter = (key) => (e) => {
    const { value } = e.target;
    applyFilters((f) => ({ ...f, [key]: value }));
  };
  const filtered = useMemo(
    () => query !== '' || Object.entries(filters).some(([key, value]) => key !== 'q' && value !== ''),
    [filters, query]
  );
  const clearFilters = () => { setQuery(''); applyFilters(EMPTY_FILTERS); };

  return (
    <div className='min-h-screen bg-slate-50'>
      <div className='max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5'>
        <PageHeader
          title={t('audit.title')}
          description={t('audit.entriesCount', { count: total })}
          actions={
            <>
              <Button variant='secondary' icon={HiRefresh} onClick={load} disabled={loading}>
                {t('common.refresh')}
              </Button>
              <Button variant='secondary' icon={HiDownload} onClick={exportCsv} disabled={!total}>
                {t('common.export')}
              </Button>
            </>
          }
        />

        <div className='bg-card border border-border rounded-xl p-4 shadow-sm space-y-3'>
          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3'>
            <Input
              label={t('common.search')}
              icon={HiSearch}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('auditLog.actionOrMessage')}
            />
            <Select label={t('audit.person')} value={filters.userId} onChange={setFilter('userId')}>
              <option value=''>{t('audit.allPeople')}</option>
              {options.actors.map((actor) => (
                <option key={actor._id} value={actor._id}>{actor.username || actor.email}</option>
              ))}
            </Select>
            <Select label={t('audit.entityType')} value={filters.entityType} onChange={setFilter('entityType')}>
              <option value=''>{t('audit.allTypes')}</option>
              {options.entityTypes.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </Select>
            <Select label={t('audit.action')} value={filters.action} onChange={setFilter('action')}>
              <option value=''>{t('audit.allActions')}</option>
              {options.actions.map((action) => (
                <option key={action} value={action}>{action}</option>
              ))}
            </Select>
            {/* Whole days in the workspace's timezone, end date included —
                the server reads YYYY-MM-DD that way. */}
            <Input label={t('auditLog.from')} type='date' value={filters.since} max={filters.until || undefined} onChange={setFilter('since')} />
            <Input label={t('auditLog.to')} type='date' value={filters.until} min={filters.since || undefined} onChange={setFilter('until')} />
          </div>
          {filtered && (
            <div className='flex justify-end'>
              <Button variant='ghost' size='sm' icon={HiX} onClick={clearFilters}>{t('audit.clearFilters')}</Button>
            </div>
          )}
        </div>

        <div className='bg-card border border-border rounded-xl shadow-sm overflow-hidden'>
          {!loading && !items.length ? (
            filtered ? (
              <EmptyState
                icon={HiSearch}
                title={t('audit.noMatches')}
                body={t('audit.noMatchesBody')}
                action={<Button variant='secondary' size='sm' onClick={clearFilters}>{t('audit.clearFilters')}</Button>}
              />
            ) : (
              <EmptyState
                icon={HiClipboardList}
                title={t('audit.empty')}
                body={t('auditLog.changesToClientsTasksOwnersCategories')}
              />
            )
          ) : (
            <Table maxHeight='max-h-[70vh]' className='[&_td]:align-top'>
              <Thead sticky>
                <tr>
                  <Th>{t('audit.when')}</Th>
                  <Th>{t('audit.action')}</Th>
                  <Th>{t('audit.entityType')}</Th>
                  <Th>{t('audit.details')}</Th>
                  <Th>{t('audit.by')}</Th>
                </tr>
              </Thead>
              <Tbody>
                {loading && !items.length ? (
                  <SkeletonRows rows={8} columns={COLUMNS} />
                ) : (
                  items.map((entry) => (
                    <Tr key={entry._id} className={loading ? 'opacity-60' : undefined}>
                      <Td muted className='tabular-nums'>
                        {formatDate(entry.createdAt, { hour: '2-digit', minute: '2-digit' })}
                      </Td>
                      <Td><Badge variant={ACTION_VARIANT(entry.action)}>{entry.action}</Badge></Td>
                      <Td muted>{entry.entityType}</Td>
                      {/* The one column that wraps: a message and its field changes. */}
                      <Td className='!whitespace-normal min-w-[18rem]'>
                        <p className='text-sm text-foreground'>{entry.message}</p>
                        {entry.changes && (
                          <ul className='mt-1.5 space-y-0.5'>
                            {Object.entries(entry.changes).map(([field, change]) => (
                              <li key={field} className='text-xs text-muted-foreground'>
                                <span className='font-medium text-foreground/80'>{field}</span>
                                {': '}
                                <span className='line-through opacity-70'>{String(change?.from ?? '—')}</span>
                                {' → '}
                                <span className='text-foreground'>{String(change?.to ?? '—')}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </Td>
                      <Td>
                        <p className='text-xs font-medium text-foreground'>{entry.createdBy?.username || t('common.unknown')}</p>
                        {entry.ip && <p className='text-xs text-muted-foreground font-mono'>{entry.ip}</p>}
                      </Td>
                    </Tr>
                  ))
                )}
              </Tbody>
            </Table>
          )}
        </div>

        {total > 0 && (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
            pageSizes={[25, 50, 100, 200]}
          />
        )}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient, fetchWithRefresh } from '../utils/http';
import { useBuyerView } from '../contexts/BuyerViewContext';
import { useTenant } from '../contexts/TenantProvider';
import { PageHeader, Button, Skeleton } from '../design-system';
import { HiRefresh, HiPlusSm, HiDownload, HiSearch, HiX, HiOutlineInbox } from 'react-icons/hi';
import { currencySymbol, formatCurrency } from '../utils/currency';
import DealActivityFeed from '../components/DealActivityFeed';
import PrintButton from '../components/PrintButton';
import PipelineBottlenecks from '../components/crm/PipelineBottlenecks';
import { useTranslation } from 'react-i18next';
import { localDateString } from '../utils/localDate';

/**
 * Column colours by the catalogue's colour name. The pipeline itself — which
 * stages, in what order, called what — comes from the workspace's own config,
 * so an agency that never takes a token payment simply doesn't have that column.
 */
const STAGE_DOT = {
  slate: 'bg-slate-400', blue: 'bg-blue-500', indigo: 'bg-indigo-500',
  purple: 'bg-purple-500', amber: 'bg-amber-500', orange: 'bg-orange-500',
  yellow: 'bg-yellow-500', emerald: 'bg-emerald-500', rose: 'bg-rose-500',
};

/**
 * Filters over the board already in hand. The pipeline endpoint returns every
 * open card at once, so narrowing it is a client-side view — nothing here is
 * sent to the server, and a drag still moves the real deal.
 *
 * Only what the payload carries can be filtered on: the client's name, the
 * deal's value and its expected close date.
 */
const EMPTY_FILTERS = { q: '', kind: 'all', close: 'any', minValue: '' };

function matchesFilters(deal, filters, now) {
  const q = filters.q.trim().toLowerCase();
  if (q && !String(deal.clientName || '').toLowerCase().includes(q)) return false;
  if (filters.kind === 'deal' && !deal.dealId) return false;
  if (filters.kind === 'noDeal' && deal.dealId) return false;

  const min = Number(filters.minValue);
  if (filters.minValue !== '' && Number.isFinite(min) && (Number(deal.value) || 0) < min) return false;

  if (filters.close !== 'any') {
    const close = deal.expectedCloseDate ? new Date(deal.expectedCloseDate).getTime() : null;
    if (filters.close === 'none') return close === null;
    if (close === null) return false;
    if (filters.close === 'overdue') return close < now;
    if (filters.close === 'next30') return close >= now && close <= now + 30 * 24 * 60 * 60 * 1000;
  }
  return true;
}

const FILTER_INPUT = 'h-9 rounded-lg border border-border bg-card text-sm text-foreground px-3 focus:outline-none focus:ring-2 focus:ring-brand-500';

export default function DealsBoard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentUser } = useSelector((state) => state.user);
  const { isBuyerViewMode } = useBuyerView();
  const { tenant } = useTenant();
  // Memoised: a bare `|| []` creates a new array each render, which would make
  // the columns useMemo below recompute on every one.
  const stages = useMemo(() => tenant?.dealStages || [], [tenant]);
  const pipelineLabel =
    (tenant?.screens || []).find((sc) => sc.id === 'pipeline')?.label || 'Sales Pipeline';

  const [pipeline, setPipeline] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState(false);
  const [dragOverStage, setDragOverStage] = useState('');
  const [addingDealFor, setAddingDealFor] = useState(null); // clientId string
  const [quickDealValue, setQuickDealValue] = useState('');
  const [openHistory, setOpenHistory] = useState(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [bottleneckKey, setBottleneckKey] = useState(0);
  const setFilter = (key) => (e) => {
    const { value } = e.target;
    setFilters((f) => ({ ...f, [key]: value }));
  };
  const filtering = filters.q !== '' || filters.kind !== 'all' || filters.close !== 'any' || filters.minValue !== '';

  const canAccess = useMemo(() => {
    if (!currentUser) return false;
    if (isBuyerViewMode) return false;
    return currentUser.role === 'admin' || currentUser.role === 'employee';
  }, [currentUser, isBuyerViewMode]);

  useEffect(() => {
    if (!currentUser) return;
    if (!canAccess) {
      navigate('/unauthorized');
    }
  }, [canAccess, currentUser, navigate]);

  async function loadPipeline() {
    setLoading(true);
    setError('');
    try {
      const data = await apiClient.get('/crm/pipeline');
      setPipeline(data?.data || []);
    } catch (e) {
      setError(e?.message || 'Failed to load pipeline');
    } finally {
      setLoading(false);
    }
  }

  function onDragStart(e, payload) {
    try {
      e.dataTransfer.setData('application/json', JSON.stringify(payload));
      e.dataTransfer.effectAllowed = 'move';
    } catch (_) {}
  }

  function onDragOver(e, stageId) {
    e.preventDefault();
    if (dragOverStage !== stageId) setDragOverStage(stageId);
    try {
      e.dataTransfer.dropEffect = 'move';
    } catch (_) {}
  }

  async function onDrop(e, stageId) {
    e.preventDefault();
    setDragOverStage('');
    let payload = null;
    try {
      payload = JSON.parse(e.dataTransfer.getData('application/json') || 'null');
    } catch (_) {
      payload = null;
    }
    if (!payload?.clientId || !payload?.dealId) return;
    if (!stageId || payload.fromStage === stageId) return;
    await moveDeal({ clientId: payload.clientId, dealId: payload.dealId, toStage: stageId });
  }

  useEffect(() => {
    if (!canAccess) return;
    loadPipeline();
  }, [canAccess]);

  async function handleQuickAddDeal(clientId, stage) {
    setUpdating(true);
    try {
      await apiClient.post(`/crm/${clientId}/deals`, {
        stage,
        value: Number(quickDealValue) || 0,
      });
      setAddingDealFor(null);
      setQuickDealValue('');
      await loadPipeline();
    } catch (e) {
      setError(e?.message || 'Failed to add deal');
    } finally {
      setUpdating(false);
    }
  }

  async function moveDeal({ clientId, dealId, toStage }) {
    setUpdating(true);
    try {
      await apiClient.patch(`/crm/${clientId}/deals/${dealId}/stage`, { stage: toStage });
      await loadPipeline();
    } catch (e) {
      setError(e?.message || 'Failed to update deal stage');
    } finally {
      setUpdating(false);
    }
  }

  const columns = useMemo(() => {
    const map = new Map();
    for (const stage of stages) {
      map.set(stage.id, {
        id: stage.id,
        label: stage.label,
        dot: STAGE_DOT[stage.color] || 'bg-slate-400',
        count: 0,
        totalValue: 0,
        deals: [],
      });
    }

    for (const col of pipeline || []) {
      const stageId = col?._id;
      // A deal sitting in a stage this workspace has since removed still has to
      // appear somewhere — dropping the column would hide live deals, which is
      // far worse than an extra column labelled with its raw stage name.
      if (!map.has(stageId)) {
        map.set(stageId, {
          id: stageId,
          label: stageId,
          dot: 'bg-slate-300',
          retired: true,
          count: 0,
          totalValue: 0,
          deals: [],
        });
      }
      const existing = map.get(stageId);
      existing.count = col.count || 0;
      existing.totalValue = col.totalValue || 0;
      existing.deals = col.deals || [];
      map.set(stageId, existing);
    }

    // Retired stages only show while they still hold deals.
    return Array.from(map.values()).filter((col) => !col.retired || col.count > 0);
  }, [pipeline, stages]);

  // The board as filtered. Counts and totals are recomputed from the cards
  // shown, so a column header never claims deals the filter has hidden.
  const visibleColumns = useMemo(() => {
    if (!filtering) return columns;
    const now = Date.now();
    return columns.map((col) => {
      const deals = (col.deals || []).filter((d) => matchesFilters(d, filters, now));
      return {
        ...col,
        deals,
        count: deals.length,
        totalValue: deals.reduce((sum, d) => sum + (Number(d.value) || 0), 0),
      };
    });
  }, [columns, filters, filtering]);

  const boardTotals = useMemo(() => {
    const shown = visibleColumns.reduce((n, col) => n + col.count, 0);
    const all = columns.reduce((n, col) => n + col.count, 0);
    const value = visibleColumns.reduce((n, col) => n + (Number(col.totalValue) || 0), 0);
    return { shown, all, value };
  }, [visibleColumns, columns]);

  // First load: placeholder columns in the workspace's own stages, so the
  // board keeps its shape instead of flashing empty columns.
  const firstLoad = loading && pipeline.length === 0;

  if (!canAccess) return null;


  /**
   * Export the filtered set, server-side.
   *
   * Via fetch rather than a link so the session cookie and the refresh-on-401
   * path apply, and so the file reflects the whole filtered result rather than
   * the page of rows that happens to be loaded.
   */
  const exportCsv = async () => {
    try {
      const params = new URLSearchParams();
      const response = await fetchWithRefresh(`/api/crm/pipeline/export?${params}`);
      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `pipeline-${localDateString()}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className='space-y-5'>
      <PageHeader
        title={pipelineLabel}
        description={t('deals.dragDealsAcrossStagesToTrack')}
        actions={
          <>
            <Button variant='secondary' size='sm' icon={HiDownload} onClick={exportCsv}>{t('deals.export')}</Button>
            <PrintButton />
            <Link
              to='/clients'
              className='inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50 rounded-lg transition-colors'
            >{t('deals.clients')}</Link>
            <Button
              variant='primary'
              size='sm'
              icon={HiRefresh}
              onClick={() => { loadPipeline(); setBottleneckKey((k) => k + 1); }}
              disabled={loading}
              className={loading ? '[&>svg]:animate-spin' : ''}
            >{t('deals.refresh')}</Button>
          </>
        }
      />

        <div className='no-print'>
          <PipelineBottlenecks stages={stages} refreshKey={bottleneckKey} />
        </div>

        {error && (
          <div className='bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-4 py-3 text-sm'>
            {error}
          </div>
        )}

        {/* Toolbar: narrows the board in place. Not printed — the paper copy is
            the board as filtered, without the controls. */}
        <div className='no-print bg-card border border-border rounded-xl p-3 shadow-sm flex flex-wrap items-center gap-2'>
          <label className='relative flex-1 min-w-[12rem] max-w-xs'>
            <span className='sr-only'>{t('deals.searchClients')}</span>
            <HiSearch className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground' aria-hidden='true' />
            <input
              type='search'
              value={filters.q}
              onChange={setFilter('q')}
              placeholder={t('deals.searchClients')}
              className={`${FILTER_INPUT} w-full pl-9`}
            />
          </label>
          <label className='flex items-center gap-1.5'>
            <span className='sr-only'>{t('deals.filterKind')}</span>
            <select value={filters.kind} onChange={setFilter('kind')} className={FILTER_INPUT}>
              <option value='all'>{t('deals.kindAll')}</option>
              <option value='deal'>{t('deals.kindWithDeal')}</option>
              <option value='noDeal'>{t('deals.kindNoDeal')}</option>
            </select>
          </label>
          <label className='flex items-center gap-1.5'>
            <span className='sr-only'>{t('deals.filterClose')}</span>
            <select value={filters.close} onChange={setFilter('close')} className={FILTER_INPUT}>
              <option value='any'>{t('deals.closeAny')}</option>
              <option value='overdue'>{t('deals.closeOverdue')}</option>
              <option value='next30'>{t('deals.closeNext30')}</option>
              <option value='none'>{t('deals.closeNone')}</option>
            </select>
          </label>
          <label className='flex items-center gap-1.5'>
            <span className='sr-only'>{t('deals.minValue')}</span>
            <input
              type='number'
              min='0'
              inputMode='numeric'
              value={filters.minValue}
              onChange={setFilter('minValue')}
              placeholder={`${t('deals.minValue')} (${currencySymbol()})`}
              className={`${FILTER_INPUT} w-36`}
            />
          </label>
          {filtering && (
            <Button variant='ghost' size='sm' icon={HiX} onClick={() => setFilters(EMPTY_FILTERS)}>
              {t('deals.clearFilters')}
            </Button>
          )}
          <span className='ml-auto text-sm text-muted-foreground tabular-nums' aria-live='polite'>
            {filtering
              ? t('deals.showingOf', { shown: boardTotals.shown, count: boardTotals.all })
              : t('deals.cardCount', { count: boardTotals.all })}
            {' · '}
            {formatCurrency(boardTotals.value)}
          </span>
        </div>

        {/* print-stack: the columns run across on screen and stack on paper. */}
        <div className='print-stack overflow-x-auto pb-2 snap-x snap-mandatory sm:snap-none scroll-px-1' aria-busy={loading || undefined}>
          {firstLoad ? (
            <div className='flex gap-3' aria-hidden='true'>
              {(stages.length ? stages : Array.from({ length: 5 }, (_, i) => ({ id: `s${i}` }))).map((stage, i) => (
                <div key={stage.id} style={{ minWidth: '256px', width: '256px' }}>
                  <div className='flex items-center gap-2 px-1 py-2 mb-2'>
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STAGE_DOT[stage.color] || 'bg-slate-300'}`} />
                    {stage.label
                      ? <span className='text-sm font-semibold text-slate-800 truncate'>{stage.label}</span>
                      : <Skeleton className='h-3 w-24' />}
                  </div>
                  <Skeleton className='h-3 w-16 mx-1 mb-3' />
                  <div className='rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-2 space-y-2 min-h-[120px]'>
                    {Array.from({ length: (i % 3) + 1 }, (_, j) => (
                      <div key={j} className='rounded-lg border border-border bg-card p-3 space-y-2'>
                        <Skeleton className='h-3 w-3/4' />
                        <Skeleton className='h-3 w-1/3' />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
          <div className='flex gap-3' style={{ minWidth: `${visibleColumns.length * 272}px` }}>
            {visibleColumns.map((col) => (
              <div key={col.id} className='snap-start' style={{ minWidth: '256px', width: '256px' }}>
                {/* Column header */}
                <div className='flex items-center gap-2 px-1 py-2 mb-2'>
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${col.dot || 'bg-slate-400'}`} />
                  <span className='text-sm font-semibold text-slate-800 truncate flex-1'>{col.label}</span>
                  <span className='text-xs font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full'>{col.count}</span>
                </div>
                <div className='text-xs text-slate-400 px-1 mb-2'>{formatCurrency(col.totalValue)}</div>

                {/* Drop zone */}
                <div
                  className={`rounded-xl border-2 transition-colors min-h-[120px] p-2 space-y-2 ${
                    dragOverStage === col.id
                      ? 'border-indigo-300 bg-indigo-50/40'
                      : 'border-dashed border-slate-200 bg-slate-50/50'
                  }`}
                  onDragOver={(e) => onDragOver(e, col.id)}
                  onDragLeave={() => setDragOverStage('')}
                  onDrop={(e) => onDrop(e, col.id)}
                >
                  {(col.deals || []).map((d) => (
                    <div
                      key={d.dealId ? String(d.dealId) : `nodeal-${col.id}-${d.clientId}`}
                      className={`rounded-lg border border-slate-200 bg-white p-3 shadow-sm hover:shadow-md transition-shadow ${d.dealId ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
                      draggable={!!d.dealId}
                      onDragStart={d.dealId ? (e) =>
                        onDragStart(e, {
                          clientId: d.clientId,
                          dealId: d.dealId,
                          fromStage: col.id,
                        }) : undefined}
                    >
                      <div className='flex items-start justify-between gap-2 mb-2'>
                        <Link
                          to={`/clients/${d.clientId}`}
                          className='font-semibold text-slate-900 hover:text-indigo-600 text-sm leading-tight'
                        >
                          {d.clientName || 'Client'}
                        </Link>
                        {!d.dealId && (
                          <span className='text-xs bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded shrink-0'>{t('deals.noDeal')}</span>
                        )}
                      </div>
                      {d.dealId ? (
                        <>
                          <div className='text-sm font-medium text-slate-700'>{formatCurrency(d.value)}</div>
                          {d.expectedCloseDate && (
                            <div className='text-xs text-slate-400 mt-1.5'>
                              Close: {new Date(d.expectedCloseDate).toLocaleDateString()}
                            </div>
                          )}

                          {/*
                            * Drag-and-drop does not exist on most phone
                            * browsers, nor for a keyboard, so the stage is also
                            * a plain choice on the card. Same moveDeal as a drop.
                            */}
                          <label className='mt-2 flex items-center gap-2 text-[11px] text-slate-400'>
                            <span className='flex-shrink-0'>Stage</span>
                            <select
                              value={col.id}
                              disabled={updating}
                              onChange={(e) => {
                                const toStage = e.target.value;
                                if (toStage && toStage !== col.id) {
                                  moveDeal({ clientId: d.clientId, dealId: d.dealId, toStage });
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                              aria-label={`Move ${d.clientName || 'deal'} to stage`}
                              className='min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 sm:py-1 text-xs text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50'
                            >
                              {columns.map((c) => (
                                <option key={c.id} value={c.id}>{c.label}</option>
                              ))}
                            </select>
                          </label>

                          {/*
                            * Collapsed by default: a board is for scanning, and
                            * an always-open history on every card would bury
                            * the numbers people come here to read.
                            */}
                          <button
                            type='button'
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenHistory((id) => (id === String(d.dealId) ? null : String(d.dealId)));
                            }}
                            className='mt-2 py-1 text-[11px] text-slate-400 hover:text-slate-600 transition-colors'
                          >
                            {openHistory === String(d.dealId) ? 'Hide history' : 'History'}
                          </button>

                          {openHistory === String(d.dealId) && (
                            <div
                              className='mt-2 pt-2 border-t border-slate-100'
                              onClick={(e) => e.stopPropagation()}
                              role='presentation'
                            >
                              <DealActivityFeed dealId={String(d.dealId)} />
                            </div>
                          )}
                        </>
                      ) : addingDealFor === String(d.clientId) ? (
                        <div className='mt-2 space-y-2' onClick={e => e.stopPropagation()}>
                          <input
                            type='number'
                            placeholder={`Deal value (${currencySymbol()})`}
                            value={quickDealValue}
                            onChange={e => setQuickDealValue(e.target.value)}
                            className='w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400'
                            autoFocus
                          />
                          <div className='flex gap-1.5'>
                            <button
                              type='button'
                              onClick={() => handleQuickAddDeal(d.clientId, col.id)}
                              disabled={updating}
                              className='flex-1 text-xs bg-slate-900 text-white rounded px-2 py-1.5 hover:bg-slate-800 disabled:opacity-50 transition-colors'
                            >{t('deals.save')}</button>
                            <button
                              type='button'
                              onClick={() => { setAddingDealFor(null); setQuickDealValue(''); }}
                              className='text-xs border border-slate-200 rounded px-2 py-1.5 hover:bg-slate-50 transition-colors'
                            >{t('deals.cancel')}</button>
                          </div>
                        </div>
                      ) : (
                        <button type="button"
                          onClick={() => { setAddingDealFor(String(d.clientId)); setQuickDealValue(''); }}
                          className='mt-1.5 text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5 transition-colors'
                        >
                          <HiPlusSm className='w-3.5 h-3.5' />{t('deals.addDealValue')}</button>
                      )}
                    </div>
                  ))}

                  {(!col.deals || col.deals.length === 0) && (
                    <div className='flex flex-col items-center justify-center gap-1.5 py-6 text-center text-muted-foreground'>
                      <HiOutlineInbox className='w-5 h-5 opacity-60' aria-hidden='true' />
                      <span className='text-xs'>
                        {filtering ? t('deals.noMatchesInStage') : t('deals.noDealsInStage')}
                      </span>
                      {!filtering && <span className='text-[11px] opacity-80'>{t('deals.dropHere')}</span>}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          )}
        </div>

      {updating && (
        <div className='text-sm text-slate-500'>{t('deals.updatingStage')}</div>
      )}
    </div>
  );
}

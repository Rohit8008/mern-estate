import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient, fetchWithRefresh } from '../utils/http';
import { useBuyerView } from '../contexts/BuyerViewContext';
import { useTenant } from '../contexts/TenantProvider';
import { PageHeader, Button } from '../design-system';
import { HiRefresh, HiPlusSm, HiDownload } from 'react-icons/hi';
import { currencySymbol, formatCurrency } from '../utils/currency';
import DealActivityFeed from '../components/DealActivityFeed';
import PrintButton from '../components/PrintButton';
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
              onClick={loadPipeline}
              disabled={loading}
              className={loading ? '[&>svg]:animate-spin' : ''}
            >{t('deals.refresh')}</Button>
          </>
        }
      />

        {error && (
          <div className='bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-4 py-3 text-sm'>
            {error}
          </div>
        )}

        {/* print-stack: the columns run across on screen and stack on paper. */}
        <div className='print-stack overflow-x-auto pb-2'>
          <div className='flex gap-3' style={{ minWidth: `${columns.length * 272}px` }}>
            {columns.map((col) => (
              <div key={col.id} style={{ minWidth: '256px', width: '256px' }}>
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
                            className='mt-2 text-[11px] text-slate-400 hover:text-slate-600 transition-colors'
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
                        <button
                          onClick={() => { setAddingDealFor(String(d.clientId)); setQuickDealValue(''); }}
                          className='mt-1.5 text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5 transition-colors'
                        >
                          <HiPlusSm className='w-3.5 h-3.5' />{t('deals.addDealValue')}</button>
                      )}
                    </div>
                  ))}

                  {(!col.deals || col.deals.length === 0) && (
                    <div className='flex items-center justify-center py-6 text-slate-400'>
                      <span className='text-xs'>{t('deals.noDeals')}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

      {updating && (
        <div className='text-sm text-slate-500'>{t('deals.updatingStage')}</div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HiExclamationCircle, HiClock, HiChevronDown, HiChevronUp } from 'react-icons/hi';
import { apiClient } from '../../utils/http';
import { formatCurrency } from '../../utils/currency';
import { Button, Skeleton } from '../../design-system';

/**
 * Where deals wait longest (GET /crm/pipeline/bottlenecks): average days per
 * stage, the slowest one called out, and open deals idle for 14+ days.
 * `stages` is the workspace's own pipeline, for stage names.
 */
export default function PipelineBottlenecks({ stages = [], refreshKey = 0 }) {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(true);

  const label = useCallback(
    (id) => stages.find((s) => s.id === id)?.label || String(id || '').replace(/_/g, ' '),
    [stages]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/crm/pipeline/bottlenecks', { silent: true });
      setData(res?.data || null);
      setError('');
    } catch (e) {
      setError(e?.message || t('crmExtras.bottlenecksLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const rows = (data?.stages || []).filter((s) => s.stage !== 'closed_won' && s.stage !== 'closed_lost');
  const maxDays = Math.max(1, ...rows.map((s) => s.avgDays));
  const bottleneck = data?.bottleneck && rows.some((s) => s.stage === data.bottleneck.stage) ? data.bottleneck : null;

  return (
    <section className='bg-white border border-slate-200 rounded-xl shadow-sm' aria-label={t('crmExtras.bottlenecksTitle')}>
      <button
        type='button'
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className='w-full flex items-center justify-between gap-3 px-4 py-3 text-left focus:outline-none focus:ring-2 focus:ring-brand-500 rounded-xl'
      >
        <span className='flex items-center gap-2 min-w-0'>
          <HiClock className='w-5 h-5 text-amber-500 shrink-0' />
          <span className='min-w-0'>
            <span className='block text-sm font-semibold text-slate-800'>{t('crmExtras.bottlenecksTitle')}</span>
            {!loading && !error && (
              <span className='block text-xs text-slate-500 truncate'>
                {bottleneck
                  ? t('crmExtras.slowestStage', { stage: label(bottleneck.stage), days: bottleneck.avgDays })
                  : t('crmExtras.bottlenecksNone')}
                {data?.stalledCount ? ` · ${t('crmExtras.stalledCount', { count: data.stalledCount })}` : ''}
              </span>
            )}
          </span>
        </span>
        {open ? <HiChevronUp className='w-4 h-4 text-slate-400 shrink-0' /> : <HiChevronDown className='w-4 h-4 text-slate-400 shrink-0' />}
      </button>

      {open && (
        <div className='px-4 pb-4'>
          {loading ? (
            <div className='space-y-2'>{[0, 1, 2].map((i) => <Skeleton key={i} className='h-6 w-full' />)}</div>
          ) : error ? (
            <div className='flex items-center justify-between gap-3 text-sm text-slate-600'>
              <span role='alert' className='flex items-center gap-2'><HiExclamationCircle className='w-5 h-5 text-rose-400' />{error}</span>
              <Button size='xs' variant='secondary' onClick={load}>{t('clientDetail.tryAgain')}</Button>
            </div>
          ) : rows.length === 0 ? (
            <p className='text-sm text-slate-500'>{t('crmExtras.bottlenecksEmpty')}</p>
          ) : (
            <div className='grid gap-6 lg:grid-cols-2'>
              <div>
                <h4 className='text-xs font-medium text-slate-500 mb-2'>{t('crmExtras.avgDaysPerStage')}</h4>
                <ul className='space-y-2'>
                  {rows.map((s) => (
                    <li key={s.stage} className='text-sm'>
                      <div className='flex justify-between gap-2 mb-1'>
                        <span className='truncate text-slate-700'>{label(s.stage)}</span>
                        <span className='tabular-nums text-slate-500 shrink-0'>{t('crmExtras.daysShort', { days: s.avgDays })}</span>
                      </div>
                      <div className='h-1.5 rounded-full bg-slate-100'>
                        <div
                          className={`h-1.5 rounded-full ${bottleneck?.stage === s.stage ? 'bg-amber-500' : 'bg-slate-400'}`}
                          style={{ width: `${Math.max(4, (s.avgDays / maxDays) * 100)}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className='text-xs font-medium text-slate-500 mb-2'>{t('crmExtras.stalledDeals')}</h4>
                {(data?.stalledDeals || []).length === 0 ? (
                  <p className='text-sm text-slate-500'>{t('crmExtras.noStalled')}</p>
                ) : (
                  <ul className='divide-y divide-slate-100 max-h-56 overflow-y-auto'>
                    {data.stalledDeals.slice(0, 8).map((d) => (
                      <li key={d.dealId}>
                        <Link to={`/clients/${d.clientId}`} className='flex items-center justify-between gap-3 py-2 px-1 rounded-lg hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-500'>
                          <span className='min-w-0'>
                            <span className='block text-sm font-medium text-slate-800 truncate'>{d.clientName}</span>
                            <span className='block text-xs text-slate-500 truncate'>{label(d.stage)} · {formatCurrency(d.value)}</span>
                          </span>
                          <span className='text-xs font-medium text-amber-700 shrink-0'>{t('crmExtras.daysShort', { days: d.daysInStage })}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

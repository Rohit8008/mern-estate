import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HiClock, HiExclamationCircle, HiCheckCircle } from 'react-icons/hi';
import { apiClient } from '../../utils/http';
import { formatDate } from '../../utils/currency';
import { Badge, Button, Skeleton } from '../../design-system';

const when = (d) => formatDate(d, { hour: '2-digit', minute: '2-digit' });

/**
 * What is due in the next week, overdue first. Two sources: the leads'
 * follow-ups (GET /crm/follow-ups/upcoming, scoped to the caller unless admin)
 * and buyer requirements with a follow-up date (GET /dashboard/buyer-stats).
 * One failing does not blank the other.
 */
export default function DashboardFollowUps({ days = 7 }) {
  const { t } = useTranslation();
  const [leads, setLeads] = useState(null);     // { total, overdue, dueToday, followUps }
  const [buyers, setBuyers] = useState(null);   // { overdue: [], upcoming: [] }
  const [leadsError, setLeadsError] = useState('');
  const [buyersError, setBuyersError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('leads');

  const load = useCallback(async () => {
    setLoading(true);
    const [l, b] = await Promise.allSettled([
      apiClient.get(`/crm/follow-ups/upcoming?days=${days}`, { silent: true }),
      apiClient.get('/dashboard/buyer-stats', { silent: true }),
    ]);
    if (l.status === 'fulfilled') { setLeads(l.value?.data || null); setLeadsError(''); }
    else setLeadsError(l.reason?.message || t('crmExtras.followUpsLoadFailed'));
    if (b.status === 'fulfilled') {
      setBuyers({ overdue: b.value?.data?.overdueFollowUps || [], upcoming: b.value?.data?.upcomingFollowUps || [] });
      setBuyersError('');
    } else setBuyersError(b.reason?.message || t('crmExtras.followUpsLoadFailed'));
    setLoading(false);
  }, [days, t]);

  useEffect(() => { load(); }, [load]);

  const leadRows = leads?.followUps || [];
  const buyerRows = [
    ...(buyers?.overdue || []).map((x) => ({ ...x, overdue: true })),
    ...(buyers?.upcoming || []).map((x) => ({ ...x, overdue: false })),
  ];
  const error = tab === 'leads' ? leadsError : buyersError;

  const tabBtn = (id, label, count) => (
    <button
      type='button'
      onClick={() => setTab(id)}
      aria-pressed={tab === id}
      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 ${
        tab === id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
      }`}
    >
      {label}{count != null ? ` (${count})` : ''}
    </button>
  );

  return (
    <div className='bg-white border border-slate-200 rounded-xl p-5 shadow-sm'>
      <div className='flex flex-wrap items-center justify-between gap-2 mb-4'>
        <div>
          <h3 className='text-sm font-semibold text-slate-700'>{t('crmExtras.followUpsDue')}</h3>
          <p className='text-xs text-slate-500 mt-0.5'>{t('crmExtras.followUpsDueSub', { days })}</p>
        </div>
        <div className='flex gap-2'>
          {tabBtn('leads', t('crmExtras.leadsTab'), leads ? leads.total : null)}
          {tabBtn('buyers', t('crmExtras.buyersTab'), buyers ? buyerRows.length : null)}
        </div>
      </div>

      {loading ? (
        <div className='space-y-2'>{[0, 1, 2].map((i) => <Skeleton key={i} className='h-12 w-full' />)}</div>
      ) : error ? (
        <div className='text-center py-6'>
          <HiExclamationCircle className='w-6 h-6 text-rose-400 mx-auto mb-1' />
          <p role='alert' className='text-sm text-slate-600 mb-3'>{error}</p>
          <Button size='xs' variant='secondary' onClick={load}>{t('clientDetail.tryAgain')}</Button>
        </div>
      ) : tab === 'leads' ? (
        leadRows.length === 0 ? (
          <div className='text-center py-6 text-sm text-slate-500'>
            <HiCheckCircle className='w-6 h-6 text-emerald-400 mx-auto mb-1' />
            {t('crmExtras.nothingDue')}
          </div>
        ) : (
          <ul className='divide-y divide-slate-100 max-h-80 overflow-y-auto'>
            {leadRows.slice(0, 20).map((f) => (
              <li key={f.followUpId}>
                <Link to={`/clients/${f.clientId}`} className='flex items-start justify-between gap-3 py-2.5 px-1 rounded-lg hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-500'>
                  <span className='min-w-0'>
                    <span className='block text-sm font-medium text-slate-800 truncate'>{f.clientName}</span>
                    <span className='block text-xs text-slate-500 truncate'>
                      <span className='capitalize'>{String(f.type || 'call').replace('_', ' ')}</span>
                      {f.notes ? ` · ${f.notes}` : ''}
                    </span>
                  </span>
                  <span className='shrink-0 text-right'>
                    <span className='block text-xs text-slate-600'>{when(f.dueAt)}</span>
                    {f.isOverdue ? <Badge variant='error'>{t('crmExtras.overdue')}</Badge>
                      : f.isDueToday ? <Badge variant='warning'>{t('crmExtras.today')}</Badge> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : buyerRows.length === 0 ? (
        <div className='text-center py-6 text-sm text-slate-500'>
          <HiCheckCircle className='w-6 h-6 text-emerald-400 mx-auto mb-1' />
          {t('crmExtras.nothingDue')}
        </div>
      ) : (
        <ul className='divide-y divide-slate-100 max-h-80 overflow-y-auto'>
          {buyerRows.map((b) => (
            <li key={b._id}>
              <Link to='/buyers' className='flex items-start justify-between gap-3 py-2.5 px-1 rounded-lg hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-500'>
                <span className='min-w-0'>
                  <span className='block text-sm font-medium text-slate-800 truncate'>{b.buyerName}</span>
                  <span className='block text-xs text-slate-500 truncate capitalize'>{b.status}{b.buyerPhone ? ` · ${b.buyerPhone}` : ''}</span>
                </span>
                <span className='shrink-0 text-right'>
                  <span className='flex items-center gap-1 justify-end text-xs text-slate-600'><HiClock className='w-3.5 h-3.5' />{formatDate(b.followUpDate)}</span>
                  {b.overdue && <Badge variant='error'>{t('crmExtras.overdue')}</Badge>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

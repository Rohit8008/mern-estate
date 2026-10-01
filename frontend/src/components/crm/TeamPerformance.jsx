import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiExclamationCircle, HiUserGroup } from 'react-icons/hi';
import { apiClient } from '../../utils/http';
import { formatNumber } from '../../utils/currency';
import { Button, Skeleton } from '../../design-system';

/**
 * Per-employee workload and results (admin only: GET /dashboard/employee-performance).
 * Table on wide screens, stacked cards on phones.
 */
export default function TeamPerformance() {
  const { t } = useTranslation();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/dashboard/employee-performance', { silent: true });
      setRows(Array.isArray(res?.data) ? res.data : []);
      setError('');
    } catch (e) {
      setError(e?.message || t('crmExtras.teamLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const n = (v) => formatNumber(Number(v) || 0);

  return (
    <div className='bg-white border border-slate-200 rounded-xl p-5 shadow-sm'>
      <h3 className='text-sm font-semibold text-slate-700'>{t('crmExtras.teamPerformance')}</h3>
      <p className='text-xs text-slate-500 mt-0.5 mb-4'>{t('crmExtras.teamPerformanceSub')}</p>

      {loading ? (
        <div className='space-y-2'>{[0, 1, 2].map((i) => <Skeleton key={i} className='h-10 w-full' />)}</div>
      ) : error ? (
        <div className='text-center py-6'>
          <HiExclamationCircle className='w-6 h-6 text-rose-400 mx-auto mb-1' />
          <p role='alert' className='text-sm text-slate-600 mb-3'>{error}</p>
          <Button size='xs' variant='secondary' onClick={load}>{t('clientDetail.tryAgain')}</Button>
        </div>
      ) : rows.length === 0 ? (
        <div className='text-center py-6 text-sm text-slate-500'>
          <HiUserGroup className='w-6 h-6 text-slate-300 mx-auto mb-1' />
          {t('crmExtras.noEmployees')}
        </div>
      ) : (
        <div className='overflow-x-auto'>
          <table className='w-full text-sm'>
            <thead>
              <tr className='text-xs text-slate-500 text-left'>
                <th className='py-2 pr-3 font-medium'>{t('crmExtras.employee')}</th>
                <th className='py-2 px-2 font-medium text-right'>{t('crmExtras.listings')}</th>
                <th className='py-2 px-2 font-medium text-right'>{t('crmExtras.sold')}</th>
                <th className='py-2 px-2 font-medium text-right'>{t('crmExtras.buyers')}</th>
                <th className='py-2 px-2 font-medium text-right'>{t('crmExtras.closed')}</th>
                <th className='py-2 pl-2 font-medium text-right'>{t('crmExtras.rate')}</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-slate-100'>
              {rows.map((r) => (
                <tr key={r.employee?.id}>
                  <td className='py-2 pr-3 font-medium text-slate-800 max-w-[10rem] truncate'>{r.employee?.name}</td>
                  <td className='py-2 px-2 text-right tabular-nums'>{n(r.stats?.assignedListings)}</td>
                  <td className='py-2 px-2 text-right tabular-nums'>{n(r.stats?.soldListings)}</td>
                  <td className='py-2 px-2 text-right tabular-nums'>{n(r.stats?.assignedBuyers)}</td>
                  <td className='py-2 px-2 text-right tabular-nums'>{n(r.stats?.closedBuyers)}</td>
                  <td className='py-2 pl-2 text-right tabular-nums'>{Number(r.stats?.conversionRate || 0).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

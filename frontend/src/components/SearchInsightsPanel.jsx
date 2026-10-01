import { useEffect, useState } from 'react';
import { HiOutlineSearch, HiOutlineRefresh } from 'react-icons/hi';
import { apiClient } from '../utils/http';
import { Button, EmptyState } from '../design-system';
import { formatNumber } from '../utils/currency';

/**
 * What people searched for over the last 30 days, and what came back empty.
 *
 * The zero-result list is the useful half: each line is something a teammate
 * wanted and the book could not give them — a missing field, a spelling the
 * team uses that the data does not.
 */
export default function SearchInsightsPanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    setError('');
    setData(null);
    apiClient
      .get('/search/analytics', { silent: true })
      .then(setData)
      .catch((e) => setError(e?.message || 'Could not load search insights.'));
  };
  useEffect(load, []);

  if (error) {
    return (
      <div className='bg-white rounded-xl border border-slate-200 p-5'>
        <p className='text-sm text-rose-600 mb-3'>{error}</p>
        <Button variant='secondary' icon={HiOutlineRefresh} onClick={load}>Try again</Button>
      </div>
    );
  }
  if (!data) return <div className='bg-white rounded-xl border border-slate-200 p-5 text-sm text-slate-400' aria-busy='true'>Loading&hellip;</div>;

  const top = data.topQueries || [];
  const zero = data.zeroResultQueries || [];
  const entities = data.entityDist || [];

  return (
    <div className='space-y-4'>
      <div className='bg-white rounded-xl border border-slate-200 p-5'>
        <div className='flex items-center justify-between gap-3 mb-4 flex-wrap'>
          <div>
            <h2 className='text-base font-semibold text-slate-900'>Search insights</h2>
            <p className='text-xs text-slate-500'>Last 30 days &middot; average response {Math.round(data.avgResponseMs || 0)}ms</p>
          </div>
          <Button variant='secondary' icon={HiOutlineRefresh} onClick={load}>Refresh</Button>
        </div>

        {!top.length ? (
          <EmptyState icon={HiOutlineSearch} title='No searches yet' body='Once your team uses search, the most common queries show up here.' />
        ) : (
          <div className='overflow-x-auto'>
            <table className='min-w-[24rem] w-full text-sm'>
              <thead>
                <tr className='border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wide'>
                  <th className='text-left py-2 pr-3 font-semibold'>Query</th>
                  <th className='text-right py-2 px-3 font-semibold'>Searches</th>
                  <th className='text-right py-2 pl-3 font-semibold'>Opened a result</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-slate-100'>
                {top.map((q) => (
                  <tr key={q._id}>
                    <td className='py-2 pr-3 text-slate-800 break-words'>{q._id}</td>
                    <td className='py-2 px-3 text-right tabular-nums'>{formatNumber(q.count)}</td>
                    <td className='py-2 pl-3 text-right tabular-nums'>{Math.round((q.clickRate || 0) * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {zero.length > 0 && (
        <div className='bg-white rounded-xl border border-slate-200 p-5'>
          <h3 className='text-sm font-semibold text-slate-900 mb-1'>Searches that found nothing</h3>
          <p className='text-xs text-slate-500 mb-3'>Worth a look: data that is missing, or wording your team uses that the records do not.</p>
          <ul className='divide-y divide-slate-100'>
            {zero.map((q) => (
              <li key={q._id} className='flex items-center justify-between gap-3 py-2 text-sm'>
                <span className='text-slate-800 break-words min-w-0'>{q._id}</span>
                <span className='text-slate-500 tabular-nums flex-shrink-0'>{formatNumber(q.count)}&times;</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {entities.length > 0 && (
        <div className='bg-white rounded-xl border border-slate-200 p-5'>
          <h3 className='text-sm font-semibold text-slate-900 mb-3'>Where people search</h3>
          <div className='flex flex-wrap gap-2'>
            {entities.map((e) => (
              <span key={e._id} className='px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700'>
                {e._id} <span className='text-slate-500 tabular-nums'>{formatNumber(e.count)}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

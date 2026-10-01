import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HiPlusSm, HiX, HiHome } from 'react-icons/hi';
import { apiClient } from '../../utils/http';
import { formatListingPrice } from '../../utils/currency';
import { Button, Input, Skeleton } from '../../design-system';

/**
 * The listings a lead has shown interest in. Adding searches the property book
 * (the one listing search); removing asks inline first.
 * POST /api/clients/:id/interested/{add,remove} take { listingId }.
 */
export default function InterestedListings({ clientId, listings, loading, onChanged }) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [confirmId, setConfirmId] = useState('');
  const [error, setError] = useState('');
  const seq = useRef(0);

  const linked = new Set((listings || []).map((l) => String(l._id)));

  useEffect(() => {
    const term = q.trim();
    if (!adding || term.length < 2) { setResults([]); setSearchError(''); return undefined; }
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await apiClient.get(`/listing/search?q=${encodeURIComponent(term)}&limit=6`, { silent: true });
        if (mine !== seq.current) return;
        setResults(res?.data?.listings || []);
        setSearchError('');
      } catch (e) {
        if (mine === seq.current) setSearchError(e?.message || t('crmExtras.searchFailed'));
      } finally {
        if (mine === seq.current) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q, adding, t]);

  async function change(kind, listingId) {
    setBusyId(listingId);
    setError('');
    try {
      await apiClient.post(`/clients/${clientId}/interested/${kind}`, { listingId }, { silent: true });
      setConfirmId('');
      await onChanged?.();
    } catch (e) {
      setError(e?.message || t(kind === 'add' ? 'crmExtras.interestAddFailed' : 'crmExtras.interestRemoveFailed'));
    } finally {
      setBusyId('');
    }
  }

  return (
    <div>
      <div className='flex items-center justify-between mb-3'>
        <h3 className='font-semibold'>{t('crmExtras.interestedListings')}</h3>
        {!adding && (
          <Button size='xs' variant='secondary' icon={HiPlusSm} onClick={() => setAdding(true)}>{t('crmExtras.addListing')}</Button>
        )}
      </div>

      {adding && (
        <div className='mb-3 space-y-2'>
          <div className='flex gap-2 items-end'>
            <Input
              label={t('crmExtras.searchListings')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('crmExtras.searchListingsPlaceholder')}
              className='mb-0 flex-1'
              autoFocus
            />
            <Button size='sm' variant='secondary' onClick={() => { setAdding(false); setQ(''); setResults([]); }}>{t('clientDetail.cancel')}</Button>
          </div>
          {searching && <Skeleton className='h-9 w-full' />}
          {searchError && <p role='alert' className='text-xs text-rose-600'>{searchError}</p>}
          {!searching && !searchError && q.trim().length >= 2 && results.length === 0 && (
            <p className='text-xs text-slate-500'>{t('crmExtras.noListingsFound')}</p>
          )}
          <ul className='divide-y divide-slate-100 border border-slate-200 rounded-lg empty:hidden'>
            {results.map((l) => (
              <li key={l._id} className='flex items-center justify-between gap-3 px-3 py-2 text-sm'>
                <span className='min-w-0'>
                  <span className='block truncate font-medium'>{l.name}</span>
                  <span className='block truncate text-xs text-slate-500'>{[l.city, l.address].filter(Boolean).join(', ')}</span>
                </span>
                {linked.has(String(l._id)) ? (
                  <span className='text-xs text-slate-400 shrink-0'>{t('crmExtras.alreadyAdded')}</span>
                ) : (
                  <Button size='xs' onClick={() => change('add', l._id)} loading={busyId === l._id} disabled={!!busyId}>{t('crmExtras.add')}</Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p role='alert' className='text-xs text-rose-600 mb-2'>{error}</p>}

      {loading ? (
        <Skeleton className='h-10 w-full' />
      ) : (listings || []).length === 0 ? (
        <p className='text-sm text-slate-400 italic'>{t('crmExtras.noInterestedListings')}</p>
      ) : (
        <ul className='space-y-2'>
          {listings.map((l) => (
            <li key={l._id} className={`rounded-lg border px-3 py-2 text-sm ${confirmId === String(l._id) ? 'bg-rose-50 border-rose-200' : 'border-slate-200'}`}>
              <div className='flex items-center justify-between gap-3'>
                <Link to={`/listing/${l._id}`} className='min-w-0 flex items-center gap-2 hover:underline'>
                  <HiHome className='w-4 h-4 text-slate-400 shrink-0' />
                  <span className='truncate'>{l.name}</span>
                  {l.regularPrice > 0 && <span className='text-xs text-slate-500 shrink-0'>{formatListingPrice(l.regularPrice)}</span>}
                </Link>
                {confirmId !== String(l._id) && (
                  <button
                    type='button'
                    onClick={() => setConfirmId(String(l._id))}
                    className='p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-brand-500 shrink-0'
                    aria-label={t('crmExtras.removeListing', { name: l.name })}
                  >
                    <HiX className='w-4 h-4' />
                  </button>
                )}
              </div>
              {confirmId === String(l._id) && (
                <div className='flex items-center justify-between gap-2 mt-2'>
                  <span className='text-xs text-rose-700'>{t('crmExtras.removeListingConfirm')}</span>
                  <span className='flex gap-2 shrink-0'>
                    <Button size='xs' variant='secondary' onClick={() => setConfirmId('')} disabled={!!busyId}>{t('clientDetail.cancel')}</Button>
                    <Button size='xs' variant='danger' onClick={() => change('remove', l._id)} loading={busyId === l._id} disabled={!!busyId}>{t('crmExtras.remove')}</Button>
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

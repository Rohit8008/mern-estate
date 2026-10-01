import { useCallback, useEffect, useState } from 'react';
import { HiOutlineBookmark, HiStar, HiOutlineStar, HiOutlineTrash } from 'react-icons/hi';
import { apiClient } from '../utils/http';

/**
 * The searches this person saved from the command palette, pinned ones first.
 *
 * Saving existed with no way back: a saved search could be created but never
 * listed, pinned or removed. Deleting asks twice inline (a small strip in the
 * row) rather than opening a dialog on top of the palette, which is itself a
 * dialog.
 */
export default function SavedSearchesList({ onSelect, refreshKey = 0 }) {
  const [searches, setSearches] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [confirmId, setConfirmId] = useState('');

  const load = useCallback(() => {
    apiClient
      .get('/search/saved', { silent: true })
      .then((data) => { setSearches(Array.isArray(data) ? data : []); setError(''); })
      .catch(() => { setSearches((prev) => prev ?? []); setError('Could not load your saved searches.'); });
  }, []);

  useEffect(load, [load, refreshKey]);

  const togglePin = async (s) => {
    setBusyId(s._id);
    try {
      const updated = await apiClient.patch(`/search/saved/${s._id}/pin`, {}, { silent: true });
      setSearches((prev) =>
        [...prev.map((x) => (x._id === s._id ? { ...x, isPinned: updated?.isPinned ?? !x.isPinned } : x))]
          .sort((a, b) => Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned)))
      );
      setError('');
    } catch {
      setError('Could not update that search.');
    } finally {
      setBusyId('');
    }
  };

  const remove = async (s) => {
    setBusyId(s._id);
    try {
      await apiClient.delete(`/search/saved/${s._id}`, { silent: true });
      setSearches((prev) => prev.filter((x) => x._id !== s._id));
      setConfirmId('');
      setError('');
    } catch {
      setError('Could not delete that search.');
    } finally {
      setBusyId('');
    }
  };

  if (searches === null) {
    return (
      <div className='p-3' aria-busy='true'>
        <div className='h-3 w-24 bg-slate-100 rounded mb-3 animate-pulse' />
        <div className='h-8 bg-slate-50 rounded-lg animate-pulse' />
      </div>
    );
  }
  if (!searches.length && !error) return null;

  return (
    <div className='p-3'>
      <div className='mb-2 px-1 text-xs font-semibold text-slate-500 uppercase tracking-wider'>Saved searches</div>
      {error && <p role='alert' className='px-1 pb-2 text-xs text-rose-600'>{error}</p>}
      <ul className='space-y-0.5'>
        {searches.map((s) => (
          <li key={s._id} className='flex items-center gap-1 group'>
            {confirmId === s._id ? (
              <div className='flex-1 flex items-center justify-between gap-2 rounded-lg bg-rose-50 border border-rose-100 px-3 py-1.5'>
                <span className='text-xs text-rose-800 truncate'>Delete &ldquo;{s.name}&rdquo;?</span>
                <span className='flex items-center gap-1 flex-shrink-0'>
                  <button type='button' onClick={() => setConfirmId('')} className='px-2 py-1 text-xs rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'>Cancel</button>
                  <button type='button' disabled={busyId === s._id} onClick={() => remove(s)} className='px-2 py-1 text-xs rounded-md bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50'>Delete</button>
                </span>
              </div>
            ) : (
              <>
                <button
                  type='button'
                  onClick={() => onSelect(s)}
                  className='flex-1 min-w-0 flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-50 text-left transition-colors'
                >
                  <HiOutlineBookmark className='w-4 h-4 text-slate-400 flex-shrink-0' aria-hidden='true' />
                  <span className='min-w-0'>
                    <span className='block text-sm text-slate-800 truncate'>{s.name}</span>
                    <span className='block text-xs text-slate-500 truncate'>{s.query}</span>
                  </span>
                </button>
                <button
                  type='button'
                  disabled={busyId === s._id}
                  onClick={() => togglePin(s)}
                  aria-pressed={Boolean(s.isPinned)}
                  aria-label={s.isPinned ? `Unpin ${s.name}` : `Pin ${s.name}`}
                  title={s.isPinned ? 'Unpin' : 'Pin to top'}
                  className={`p-1.5 rounded-lg hover:bg-slate-100 transition-colors ${s.isPinned ? 'text-brand-600' : 'text-slate-400 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100'}`}
                >
                  {s.isPinned ? <HiStar className='w-4 h-4' aria-hidden='true' /> : <HiOutlineStar className='w-4 h-4' aria-hidden='true' />}
                </button>
                <button
                  type='button'
                  onClick={() => setConfirmId(s._id)}
                  aria-label={`Delete ${s.name}`}
                  title='Delete'
                  className='p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 transition-all'
                >
                  <HiOutlineTrash className='w-4 h-4' aria-hidden='true' />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

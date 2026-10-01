import { useCallback, useEffect, useState } from 'react';
import { HiOutlineChevronDown, HiOutlineChevronUp, HiOutlineRefresh, HiOutlineTrash } from 'react-icons/hi';
import { apiClient } from '../utils/http';
import { useNotification } from '../contexts/NotificationContext';
import { Button } from '../design-system';
import { formatNumber } from '../utils/currency';

/**
 * Deleted categories, with a way back.
 *
 * Deleting was soft all along but nothing listed the result, so a category
 * removed by mistake was gone as far as anyone using the app could tell.
 * Restoring is itself safe and reversible (delete again), so it asks for no
 * confirmation. Collapsed until opened: most days nobody needs it.
 */
export default function DeletedCategoriesPanel({ onRestored }) {
  const { showSuccess, showError } = useNotification();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(() => {
    setError('');
    apiClient
      .get('/category/deleted', { silent: true })
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch((e) => { setItems([]); setError(e?.message || 'Could not load deleted categories.'); });
  }, []);

  useEffect(() => { if (open && items === null) load(); }, [open, items, load]);

  const restore = async (c) => {
    setBusyId(c._id);
    try {
      const restored = await apiClient.post(`/category/restore/${c._id}`, {}, { silent: true });
      setItems((prev) => prev.filter((x) => x._id !== c._id));
      onRestored?.({ ...c, ...restored });
      showSuccess(`"${c.name}" restored.`);
    } catch (e) {
      // 409: another category took the address meanwhile; the server says which.
      showError(e?.message || 'Could not restore that category.');
    } finally {
      setBusyId('');
    }
  };

  const deletedOn = (d) => (d ? new Date(d).toLocaleDateString() : '');

  return (
    <section className='bg-white border border-slate-200 rounded-xl'>
      <button
        type='button'
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className='w-full flex items-center justify-between gap-3 px-5 py-3.5 text-left rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'
      >
        <span className='flex items-center gap-2 text-sm font-medium text-slate-700'>
          <HiOutlineTrash className='w-4 h-4 text-slate-400' aria-hidden='true' />
          Recently deleted
          {items && items.length > 0 && <span className='text-xs text-slate-500'>({items.length})</span>}
        </span>
        {open ? <HiOutlineChevronUp className='w-4 h-4 text-slate-400' aria-hidden='true' /> : <HiOutlineChevronDown className='w-4 h-4 text-slate-400' aria-hidden='true' />}
      </button>

      {open && (
        <div className='border-t border-slate-100 px-5 py-3'>
          {items === null ? (
            <p className='text-sm text-slate-400 py-2' aria-busy='true'>Loading&hellip;</p>
          ) : error ? (
            <div className='py-2'>
              <p className='text-sm text-rose-600 mb-2' role='alert'>{error}</p>
              <Button variant='secondary' icon={HiOutlineRefresh} onClick={() => { setItems(null); load(); }}>Try again</Button>
            </div>
          ) : items.length === 0 ? (
            <p className='text-sm text-slate-500 py-2'>Nothing has been deleted.</p>
          ) : (
            <ul className='divide-y divide-slate-100'>
              {items.map((c) => (
                <li key={c._id} className='flex items-center gap-3 py-2.5 flex-wrap sm:flex-nowrap'>
                  <div className='min-w-0 flex-1'>
                    <p className='text-sm font-medium text-slate-800 truncate'>{c.name}</p>
                    <p className='text-xs text-slate-500'>
                      {c.deletedAt ? `Deleted ${deletedOn(c.deletedAt)} · ` : ''}
                      {formatNumber(c.listingCount || 0)} {c.listingCount === 1 ? 'property' : 'properties'} still use it
                    </p>
                  </div>
                  <Button variant='secondary' icon={HiOutlineRefresh} loading={busyId === c._id} onClick={() => restore(c)}>
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

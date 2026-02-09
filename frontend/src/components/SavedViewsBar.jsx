import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { useSelector } from 'react-redux';

import { loadSavedViews, saveSavedViews } from '../utils/savedViews';

export default function SavedViewsBar({ namespace, getCurrentQueryString, onApplyQueryString }) {
  const { currentUser } = useSelector((state) => state.user);
  const userId = currentUser?._id || currentUser?.id || '';

  const [views, setViews] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setViews(loadSavedViews({ userId, namespace }));
  }, [namespace, userId]);

  const selected = useMemo(() => views.find((v) => v.id === selectedId) || null, [selectedId, views]);

  function persist(next) {
    setViews(next);
    saveSavedViews({ userId, namespace, items: next });
  }

  function handleApply(id) {
    setSelectedId(id);
    const v = views.find((x) => x.id === id);
    if (!v) return;
    onApplyQueryString(v.queryString || '');
  }

  async function handleSaveCurrent() {
    const trimmed = String(name || '').trim();
    if (!trimmed) return;

    setSaving(true);
    try {
      const qs = getCurrentQueryString() || '';
      const id = `v_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const next = [{ id, name: trimmed, queryString: qs }, ...views];
      persist(next);
      setSelectedId(id);
      setName('');
    } finally {
      setSaving(false);
    }
  }

  function handleDeleteSelected() {
    if (!selected) return;
    const next = views.filter((v) => v.id !== selected.id);
    persist(next);
    setSelectedId('');
  }

  return (
    <div className='flex flex-col lg:flex-row lg:items-center gap-2'>
      <div className='flex items-center gap-2'>
        <select
          className='px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm'
          value={selectedId}
          onChange={(e) => handleApply(e.target.value)}
        >
          <option value=''>Views</option>
          {views.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>

        <button
          type='button'
          onClick={handleDeleteSelected}
          disabled={!selected}
          className='px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-sm font-semibold disabled:opacity-50'
        >
          Delete
        </button>

        <button
          type='button'
          onClick={() => onApplyQueryString('')}
          className='px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-sm font-semibold'
        >
          Reset
        </button>
      </div>

      <div className='flex items-center gap-2'>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder='Save current as…'
          className='w-full lg:w-[220px] px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:bg-white'
        />
        <button
          type='button'
          onClick={handleSaveCurrent}
          disabled={saving || !String(name || '').trim()}
          className='px-3 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 text-sm font-semibold disabled:opacity-50'
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

SavedViewsBar.propTypes = {
  namespace: PropTypes.string.isRequired,
  getCurrentQueryString: PropTypes.func.isRequired,
  onApplyQueryString: PropTypes.func.isRequired,
};

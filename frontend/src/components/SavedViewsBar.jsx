import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { useSelector } from 'react-redux';

import { loadSavedViews, saveSavedViews } from '../utils/savedViews';
import { apiClient } from '../utils/http';
import { useTranslation } from 'react-i18next';

export default function SavedViewsBar({ namespace, getCurrentQueryString, onApplyQueryString }) {
  const { t } = useTranslation();
  const { currentUser } = useSelector((state) => state.user);
  const userId = currentUser?._id || currentUser?.id || '';

  const [views, setViews] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  // Views are kept on the account (/api/user/saved-views) so they follow the
  // agent across devices. Views saved by the old browser-only version are
  // merged up once; the browser copy stays as the offline fallback.
  useEffect(() => {
    let alive = true;
    const local = loadSavedViews({ userId, namespace });
    setViews(local);
    if (!userId) return undefined;
    (async () => {
      try {
        const res = await apiClient.get(`/user/saved-views/${namespace}`, { silent: true });
        const remote = Array.isArray(res?.data) ? res.data : [];
        const missing = local.filter((v) => !remote.some((r) => r.id === v.id));
        const merged = [...remote, ...missing].slice(0, 50);
        if (missing.length) await apiClient.put(`/user/saved-views/${namespace}`, { items: merged }, { silent: true });
        if (!alive) return;
        setViews(merged);
        saveSavedViews({ userId, namespace, items: merged });
      } catch {
        // Offline or older server: the browser copy is what we have.
      }
    })();
    return () => { alive = false; };
  }, [namespace, userId]);

  const selected = useMemo(() => views.find((v) => v.id === selectedId) || null, [selectedId, views]);

  function persist(next) {
    setViews(next);
    saveSavedViews({ userId, namespace, items: next });
    if (userId) {
      apiClient
        .put(`/user/saved-views/${namespace}`, { items: next.slice(0, 50) }, { silent: true })
        .catch(() => { /* kept locally; synced on the next load */ });
    }
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
          aria-label='Saved views'
          className='px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm'
          value={selectedId}
          onChange={(e) => handleApply(e.target.value)}
        >
          <option value=''>{t('savedViewsBar.views')}</option>
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
        >{t('savedViewsBar.delete')}</button>

        <button
          type='button'
          onClick={() => onApplyQueryString('')}
          className='px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-sm font-semibold'
        >{t('savedViewsBar.reset')}</button>
      </div>

      <div className='flex items-center gap-2'>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('savedViewsBar.saveCurrentAs')}
          aria-label='Name for the current view'
          className='w-full lg:w-[220px] px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:bg-white focus-visible:ring-2 focus-visible:ring-brand-500'
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

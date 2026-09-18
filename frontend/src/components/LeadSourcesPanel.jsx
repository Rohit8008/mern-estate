import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiTag, HiPlus, HiTrash } from 'react-icons/hi';
import { Input, Button, EmptyState } from '../design-system';
import ConfirmDialog from './ConfirmDialog';
import { apiClient } from '../utils/http';
import { useNotification } from '../contexts/NotificationContext';
import { currencySymbol, formatCurrency } from '../utils/currency';

/**
 * Lead sources and what each one costs.
 *
 * `client.source` was a free-text box, so the same channel arrived as
 * "Facebook", "facebook" and "FB ads" and could never be totalled — and with no
 * cost recorded anywhere, "which channel is worth the money?" had no answer.
 */
export default function LeadSourcesPanel() {
  const { t } = useTranslation();
  const { showSuccess, showError } = useNotification();

  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState({ name: '', monthlyCost: '' });
  const [pendingDelete, setPendingDelete] = useState(null);
  const [forcePrompt, setForcePrompt] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/lead-sources');
      setSources(res?.data?.sources || []);
    } catch {
      showError('Could not load lead sources');
    }
    setLoading(false);
  }, [showError]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!draft.name.trim()) return;
    try {
      await apiClient.post('/lead-sources', {
        name: draft.name.trim(),
        monthlyCost: Number(draft.monthlyCost) || 0,
      });
      setDraft({ name: '', monthlyCost: '' });
      load();
    } catch (err) {
      showError(err?.message || 'Could not add the source');
    }
  };

  const updateCost = async (source, monthlyCost) => {
    try {
      await apiClient.patch(`/lead-sources/${source._id}`, { monthlyCost: Number(monthlyCost) || 0 });
      setSources((prev) =>
        prev.map((s) => (s._id === source._id ? { ...s, monthlyCost: Number(monthlyCost) || 0 } : s))
      );
    } catch (err) {
      showError(err?.message || 'Could not save the cost');
    }
  };

  const remove = async (id, force = false) => {
    try {
      await apiClient.delete(`/lead-sources/${id}${force ? '?force=true' : ''}`);
      setPendingDelete(null);
      setForcePrompt(null);
      showSuccess('Source removed');
      load();
    } catch (err) {
      // 409 with a count: the source is in use, so offer the choice rather than
      // silently detaching it from historic leads.
      if (err?.status === 409 || err?.data?.canForce) {
        setPendingDelete(null);
        setForcePrompt({ id, message: err?.message || 'This source is in use.' });
        return;
      }
      showError(err?.message || 'Could not remove the source');
    }
  };

  const totalMonthly = sources.reduce((sum, s) => sum + (s.monthlyCost || 0), 0);

  return (
    <div className='space-y-4'>
      <div className='bg-white rounded-xl border border-slate-200 p-5'>
        <div className='flex items-center gap-3 mb-5'>
          <div className='w-9 h-9 rounded-xl bg-amber-50 ring-1 ring-amber-100 flex items-center justify-center flex-shrink-0'>
            <HiTag className='w-5 h-5 text-amber-600' />
          </div>
          <div>
            <h2 className='text-base font-semibold text-slate-900'>{t('leadSources.leadSources')}</h2>
            <p className='text-xs text-slate-500'>{t('leadSources.whatYouSpendPerMonthOn')}</p>
          </div>
        </div>

        <div className='flex items-end gap-2 mb-5 flex-wrap'>
          <div className='flex-1 min-w-[10rem]'>
            <Input
              label={t('common.name')}
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder={t('leadSources.propertyPortal')}
            />
          </div>
          <div className='w-40'>
            <Input
              label={`Monthly cost (${currencySymbol()})`}
              type='number'
              min={0}
              value={draft.monthlyCost}
              onChange={(e) => setDraft((d) => ({ ...d, monthlyCost: e.target.value }))}
            />
          </div>
          <Button icon={HiPlus} onClick={create} disabled={!draft.name.trim()}>{t('common.add')}</Button>
        </div>

        {loading ? (
          <p className='text-sm text-slate-400 py-4'>{t('common.loading')}</p>
        ) : !sources.length ? (
          <EmptyState icon={HiTag} title={t('leadSources.noSourcesYet')} body={t('leadSources.addTheChannelsYourLeadsCome')} />
        ) : (
          <>
            <ul className='divide-y divide-slate-100'>
              {sources.map((source) => (
                <li key={source._id} className='flex items-center gap-3 py-3'>
                  <span className='flex-1 text-sm text-slate-800'>{source.name}</span>
                  <div className='w-36'>
                    <input
                      type='number'
                      min={0}
                      defaultValue={source.monthlyCost || 0}
                      onBlur={(e) => updateCost(source, e.target.value)}
                      className='w-full px-3 py-1.5 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-100'
                    />
                  </div>
                  <button
                    type='button'
                    onClick={() => setPendingDelete(source._id)}
                    className='p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors'
                    title={t('common.delete')}
                  >
                    <HiTrash className='w-4 h-4' />
                  </button>
                </li>
              ))}
            </ul>

            <div className='flex items-center justify-between pt-4 mt-1 border-t border-slate-200'>
              <span className='text-sm text-slate-500'>{t('leadSources.totalMonthlySpend')}</span>
              <span className='text-sm font-semibold text-slate-900'>{formatCurrency(totalMonthly)}</span>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={t('leadSources.removeThisSource')}
        description={t('leadSources.leadsThatAlreadyCameFromIt')}
        confirmLabel={t('common.delete')}
        onConfirm={() => remove(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />

      <ConfirmDialog
        open={Boolean(forcePrompt)}
        title={t('leadSources.thisSourceIsInUse')}
        description={`${forcePrompt?.message || ''} Remove it anyway? Existing leads keep their recorded source.`}
        confirmLabel={t('leadSources.removeAnyway')}
        onConfirm={() => remove(forcePrompt.id, true)}
        onCancel={() => setForcePrompt(null)}
      />
    </div>
  );
}

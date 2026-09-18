import { useCallback, useEffect, useState } from 'react';
import {
  HiOutlineExclamation,
  HiOutlinePlus,
  HiOutlineRefresh,
  HiOutlineSelector,
  HiOutlineTrash,
  HiOutlineViewBoards,
} from 'react-icons/hi';
import { apiClient } from '../utils/http';
import { useNotification } from '../contexts/NotificationContext';
import { useTenant } from '../contexts/TenantProvider';
import { Button, Badge, Spinner } from '../design-system';
import { useTranslation } from 'react-i18next';

/**
 * The workspace's sales pipeline: which stages, in what order, called what.
 *
 * An agency that never takes a token payment shouldn't have a "Booking / Token"
 * column sitting empty forever, and one that calls a site visit a "viewing"
 * should see that word. Both are the difference between a CRM that fits how
 * they work and one they work around.
 */

const DOT = {
  slate: 'bg-slate-400', blue: 'bg-blue-500', indigo: 'bg-indigo-500',
  purple: 'bg-purple-500', amber: 'bg-amber-500', orange: 'bg-orange-500',
  yellow: 'bg-yellow-500', emerald: 'bg-emerald-500', rose: 'bg-rose-500',
};

function cx(...xs) {
  return xs.filter(Boolean).join(' ');
}

export default function WorkspacePipelinePanel() {
  const { t } = useTranslation();
  const { showSuccess, showError } = useNotification();
  const { refresh } = useTenant();

  const [stages, setStages] = useState(null);
  const [available, setAvailable] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/tenant/pipeline');
      setStages(res?.data?.stages || []);
      setAvailable(res?.data?.available || []);
      setDirty(false);
    } catch (err) {
      showError(err?.message || 'Could not load your pipeline.');
    } finally {
      setLoading(false);
    }
    // showError identity is stable enough for a load helper
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const move = (from, to) => {
    if (to < 0 || to >= stages.length) return;
    const next = [...stages];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setStages(next);
    setDirty(true);
  };

  const remove = (id) => {
    const stage = stages.find((s) => s.id === id);
    setStages(stages.filter((s) => s.id !== id));
    setAvailable([...available, { ...stage }].sort((a, b) => a.label.localeCompare(b.label)));
    setDirty(true);
  };

  const add = (stage) => {
    // Added before Won/Lost, since an end state belongs at the end of a board.
    const endIndex = stages.findIndex((s) => s.isWon || s.isLost);
    const next = [...stages];
    next.splice(endIndex === -1 ? next.length : endIndex, 0, { ...stage, enabled: true });
    setStages(next);
    setAvailable(available.filter((s) => s.id !== stage.id));
    setDirty(true);
  };

  const rename = (id, label) => {
    setStages(stages.map((s) => (s.id === id ? { ...s, label } : s)));
    setDirty(true);
  };

  async function save() {
    setSaving(true);
    try {
      const res = await apiClient.patch('/tenant/pipeline', {
        stages: stages.map((s) => ({ key: s.id, label: s.label, color: s.color })),
      });
      setStages(res?.data?.stages || []);
      setDirty(false);
      await refresh(); // the board reads its columns from workspace config
      showSuccess('Your pipeline has been updated.');
    } catch (err) {
      showError(err?.message || 'Could not save. Nothing has been changed.');
    } finally {
      setSaving(false);
    }
  }

  if (loading || !stages) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-10 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const hasEnd = stages.some((s) => s.isWon) && stages.some((s) => s.isLost);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 ring-1 ring-indigo-100 flex items-center justify-center flex-shrink-0">
            <HiOutlineViewBoards className="w-5 h-5 text-indigo-600" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">{t('workspacePipeline.yourSalesPipeline')}</h2>
            <p className="text-sm text-slate-500 mt-0.5 max-w-prose">
              These are the columns on the pipeline board, in order. Drag to reorder, click a name
              to change it, and remove any stage your agency doesn&apos;t use.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('workspacePipeline.inYourPipeline')}</h3>
          <Badge variant="slate">{stages.length} stages</Badge>
        </div>

        <ul className="divide-y divide-slate-100">
          {stages.map((stage, i) => (
            <li
              key={stage.id}
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null && dragIndex !== i) move(dragIndex, i);
                setDragIndex(null);
              }}
              onDragEnd={() => setDragIndex(null)}
              className={cx(
                'px-5 py-3 flex items-center gap-3 bg-white',
                dragIndex === i && 'opacity-40'
              )}
            >
              <span className="text-slate-300 cursor-grab active:cursor-grabbing" aria-hidden="true">
                <HiOutlineSelector className="w-4 h-4" />
              </span>
              <span className="text-xs text-slate-400 tabular-nums w-5">{i + 1}</span>
              <span className={cx('w-2.5 h-2.5 rounded-full flex-shrink-0', DOT[stage.color] || 'bg-slate-400')} />

              <input
                value={stage.label}
                maxLength={60}
                onChange={(e) => rename(stage.id, e.target.value)}
                className="flex-1 min-w-0 text-sm font-medium text-slate-900 bg-transparent border border-transparent hover:border-slate-200 focus:border-indigo-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                aria-label={`Name for the ${stage.defaultLabel} stage`}
              />

              {stage.label !== stage.defaultLabel && (
                <Badge variant="brand" size="xs">was {stage.defaultLabel}</Badge>
              )}
              {stage.isWon && <Badge variant="success" size="xs">{t('workspacePipeline.won')}</Badge>}
              {stage.isLost && <Badge variant="error" size="xs">{t('workspacePipeline.lost')}</Badge>}
              {stage.legacy && <Badge variant="warning" size="xs">{t('workspacePipeline.olderStage')}</Badge>}

              <button
                type="button"
                onClick={() => remove(stage.id)}
                disabled={stage.isWon || stage.isLost}
                title={
                  stage.isWon || stage.isLost
                    ? 'A pipeline needs a Won and a Lost stage — without an end state, deals never leave the board'
                    : `Remove ${stage.label}`
                }
                className={cx(
                  'p-1.5 rounded-lg transition-colors flex-shrink-0',
                  stage.isWon || stage.isLost
                    ? 'text-slate-200 cursor-not-allowed'
                    : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                )}
              >
                <HiOutlineTrash className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      {available.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">{t('workspacePipeline.availableToAdd')}</h3>
          <div className="flex flex-wrap gap-2">
            {available.map((stage) => (
              <button
                key={stage.id}
                type="button"
                onClick={() => add(stage)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 text-sm transition-colors"
              >
                <HiOutlinePlus className="w-3.5 h-3.5 text-slate-400" />
                <span className={cx('w-2 h-2 rounded-full', DOT[stage.color] || 'bg-slate-400')} />
                {stage.label}
                {stage.legacy && <span className="text-xs text-amber-600">(older)</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {!hasEnd && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <HiOutlineExclamation className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-900">{t('workspacePipeline.aPipelineNeedsBothAWon')}</p>
        </div>
      )}

      {dirty && (
        <div className="sticky bottom-4 bg-white border border-slate-200 rounded-xl shadow-lg px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-slate-600">{t('workspacePipeline.yourPipelineHasUnsavedChangesDeals')}</span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" icon={HiOutlineRefresh} disabled={saving} onClick={load}>{t('workspacePipeline.discard')}</Button>
            <Button loading={saving} disabled={!hasEnd} onClick={save}>{t('workspacePipeline.savePipeline')}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

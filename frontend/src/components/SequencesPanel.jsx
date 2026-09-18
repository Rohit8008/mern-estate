import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiLightningBolt, HiPlus, HiTrash, HiChevronUp, HiChevronDown } from 'react-icons/hi';
import { Input, Textarea, Select, Button, Modal, EmptyState, Badge } from '../design-system';
import ConfirmDialog from './ConfirmDialog';
import { apiClient } from '../utils/http';
import { useNotification } from '../contexts/NotificationContext';

/**
 * Authoring follow-up sequences.
 *
 * Steps are ordered with a delay from the previous one rather than absolute
 * dates, so a sequence can be enrolled at any time and inserting a step in the
 * middle does not require rewriting every enrollment already in flight.
 */
const EMPTY_STEP = { action: 'reminder', delayDays: 3, subject: '', body: '' };

export default function SequencesPanel() {
  const { t } = useTranslation();
  const { showSuccess, showError } = useNotification();

  const [sequences, setSequences] = useState([]);
  const [actions, setActions] = useState({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({ name: '', description: '', steps: [] });
  const [pendingDelete, setPendingDelete] = useState(null);
  const [forcePrompt, setForcePrompt] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/sequences');
      setSequences(res?.data?.sequences || []);
      setActions(res?.data?.actions || {});
    } catch {
      showError('Could not load sequences');
    }
    setLoading(false);
  }, [showError]);

  useEffect(() => { load(); }, [load]);

  const open = (sequence) => {
    setEditing(sequence || { _id: null });
    setDraft(
      sequence
        ? { name: sequence.name, description: sequence.description || '', steps: sequence.steps || [] }
        : { name: '', description: '', steps: [{ ...EMPTY_STEP, delayDays: 0 }] }
    );
  };

  const save = async () => {
    try {
      if (editing._id) await apiClient.patch(`/sequences/${editing._id}`, draft);
      else await apiClient.post('/sequences', draft);
      setEditing(null);
      showSuccess('Saved');
      load();
    } catch (err) {
      showError(err?.message || 'Could not save the sequence');
    }
  };

  const remove = async (id, force = false) => {
    try {
      await apiClient.delete(`/sequences/${id}${force ? '?force=true' : ''}`);
      setPendingDelete(null);
      setForcePrompt(null);
      showSuccess('Deleted');
      load();
    } catch (err) {
      // 409 with a count: leads are part-way through, so offer the choice.
      if (err?.status === 409 || err?.data?.canForce) {
        setPendingDelete(null);
        setForcePrompt({ id, message: err?.message || 'Leads are part-way through this.' });
        return;
      }
      showError(err?.message || 'Could not delete the sequence');
    }
  };

  const setStep = (index, patch) =>
    setDraft((d) => ({
      ...d,
      steps: d.steps.map((step, i) => (i === index ? { ...step, ...patch } : step)),
    }));

  const moveStep = (index, delta) =>
    setDraft((d) => {
      const steps = [...d.steps];
      const target = index + delta;
      if (target < 0 || target >= steps.length) return d;
      [steps[index], steps[target]] = [steps[target], steps[index]];
      return { ...d, steps };
    });

  /** Running total, so the author can see how long the whole thing takes. */
  const dayOf = (index) =>
    draft.steps.slice(0, index + 1).reduce((sum, step) => sum + (Number(step.delayDays) || 0), 0);

  return (
    <div className='space-y-4'>
      <div className='bg-white rounded-xl border border-slate-200 p-5'>
        <div className='flex items-start justify-between gap-3 mb-5 flex-wrap'>
          <div className='flex items-center gap-3'>
            <div className='w-9 h-9 rounded-xl bg-amber-50 ring-1 ring-amber-100 flex items-center justify-center flex-shrink-0'>
              <HiLightningBolt className='w-5 h-5 text-amber-600' />
            </div>
            <div>
              <h2 className='text-base font-semibold text-slate-900'>{t('sequences.followUpSequences')}</h2>
              <p className='text-xs text-slate-500'>{t('sequences.aSeriesOfTouchesThatRuns')}</p>
            </div>
          </div>
          <Button icon={HiPlus} onClick={() => open(null)}>{t('common.add')}</Button>
        </div>

        {loading ? (
          <p className='text-sm text-slate-400 py-4'>{t('common.loading')}</p>
        ) : !sequences.length ? (
          <EmptyState
            icon={HiLightningBolt}
            title={t('sequences.noSequencesYet')}
            body={t('sequences.buildOneToStopFollowUps')}
          />
        ) : (
          <ul className='divide-y divide-slate-100'>
            {sequences.map((sequence) => (
              <li key={sequence._id} className='flex items-center justify-between gap-3 py-3'>
                <div className='min-w-0'>
                  <div className='flex items-center gap-2 flex-wrap'>
                    <span className='text-sm font-medium text-slate-800'>{sequence.name}</span>
                    {!sequence.isActive && <Badge variant='slate'>{t('sequences.paused')}</Badge>}
                    {sequence.activeEnrollments > 0 && (
                      <Badge variant='brand'>{sequence.activeEnrollments} running</Badge>
                    )}
                  </div>
                  <p className='text-xs text-slate-500'>
                    {sequence.steps?.length || 0} step{sequence.steps?.length === 1 ? '' : 's'}
                    {sequence.description ? ` · ${sequence.description}` : ''}
                  </p>
                </div>

                <div className='flex items-center gap-1.5 flex-shrink-0'>
                  <Button variant='secondary' onClick={() => open(sequence)}>{t('common.edit')}</Button>
                  <button
                    type='button'
                    onClick={() => setPendingDelete(sequence._id)}
                    className='p-2 text-rose-600 hover:bg-rose-50 rounded-lg border border-rose-200 transition-colors'
                    title={t('common.delete')}
                  >
                    <HiTrash className='w-4 h-4' />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {editing && (
        <Modal
          open
          onClose={() => setEditing(null)}
          title={editing._id ? 'Edit sequence' : 'New sequence'}
          description={t('sequences.eachStepFiresASetNumber')}
          size='2xl'
          footer={
            <>
              <Button variant='secondary' onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
              <Button onClick={save} disabled={!draft.name.trim() || !draft.steps.length}>
                {t('common.save')}
              </Button>
            </>
          }
        >
          <div className='space-y-4'>
            <Input
              label={t('common.name')}
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder={t('sequences.newEnquiryNurture')}
            />
            <Input
              label={t('sequences.description')}
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              placeholder={t('sequences.whatThisIsFor')}
            />

            <div>
              <div className='flex items-center justify-between mb-2'>
                <p className='text-sm font-medium text-slate-700'>{t('sequences.steps')}</p>
                <button
                  type='button'
                  onClick={() => setDraft((d) => ({ ...d, steps: [...d.steps, { ...EMPTY_STEP }] }))}
                  className='inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 transition-colors'
                >
                  <HiPlus className='w-3.5 h-3.5' />{t('sequences.addStep')}</button>
              </div>

              <ol className='space-y-3'>
                {draft.steps.map((step, index) => (
                  <li key={index} className='border border-slate-200 rounded-xl p-3'>
                    <div className='flex items-center justify-between mb-2.5'>
                      <span className='text-xs font-medium text-slate-500'>
                        Step {index + 1} &middot; day {dayOf(index)}
                      </span>
                      <div className='flex items-center gap-0.5'>
                        <button
                          type='button'
                          onClick={() => moveStep(index, -1)}
                          disabled={index === 0}
                          className='p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 transition-colors'
                          aria-label={t('sequences.moveUp')}
                        >
                          <HiChevronUp className='w-4 h-4' />
                        </button>
                        <button
                          type='button'
                          onClick={() => moveStep(index, 1)}
                          disabled={index === draft.steps.length - 1}
                          className='p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 transition-colors'
                          aria-label={t('sequences.moveDown')}
                        >
                          <HiChevronDown className='w-4 h-4' />
                        </button>
                        <button
                          type='button'
                          onClick={() => setDraft((d) => ({
                            ...d, steps: d.steps.filter((_, i) => i !== index),
                          }))}
                          className='p-1 text-rose-500 hover:text-rose-700 transition-colors'
                          aria-label={t('sequences.removeStep')}
                        >
                          <HiTrash className='w-3.5 h-3.5' />
                        </button>
                      </div>
                    </div>

                    <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                      <Select
                        label={t('sequences.action')}
                        value={step.action}
                        onChange={(e) => setStep(index, { action: e.target.value })}
                      >
                        {Object.entries(actions).map(([key, description]) => (
                          <option key={key} value={key}>{description}</option>
                        ))}
                      </Select>
                      <Input
                        label={index === 0 ? 'Days after enrolling' : 'Days after the previous step'}
                        type='number'
                        min={0}
                        value={step.delayDays}
                        onChange={(e) => setStep(index, { delayDays: Number(e.target.value) })}
                      />
                    </div>

                    <div className='mt-3 space-y-3'>
                      <Input
                        label={step.action === 'email' ? 'Subject' : 'Title'}
                        value={step.subject}
                        onChange={(e) => setStep(index, { subject: e.target.value })}
                        placeholder={t('sequences.followingUpOnYourEnquiry')}
                      />
                      <Textarea
                        label={t('sequences.message')}
                        rows={3}
                        value={step.body}
                        onChange={(e) => setStep(index, { body: e.target.value })}
                        placeholder='Hi {{firstName}}, just checking in…'
                      />
                    </div>
                  </li>
                ))}
              </ol>

              <p className='text-xs text-slate-400 mt-2'>{t('sequences.mergeFields')}<code>{'{{firstName}}'}</code>, <code>{'{{lastName}}'}</code>,{' '}
                <code>{'{{phone}}'}</code>, <code>{'{{email}}'}</code>, <code>{'{{workspaceName}}'}</code>
              </p>
            </div>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={t('sequences.deleteThisSequence')}
        description={t('sequences.leadsPartWayThroughItWill')}
        confirmLabel={t('common.delete')}
        onConfirm={() => remove(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />

      <ConfirmDialog
        open={Boolean(forcePrompt)}
        title={t('sequences.leadsArePartWayThrough')}
        description={`${forcePrompt?.message || ''} Delete it anyway? They will stop where they are.`}
        confirmLabel={t('sequences.deleteAnyway')}
        onConfirm={() => remove(forcePrompt.id, true)}
        onCancel={() => setForcePrompt(null)}
      />
    </div>
  );
}

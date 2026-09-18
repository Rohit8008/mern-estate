import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { HiPlay, HiStop, HiClock, HiCheckCircle } from 'react-icons/hi';
import { apiClient } from '../utils/http';
import { useNotification } from '../contexts/NotificationContext';

/**
 * Which follow-up sequences this lead is on, and where each has got to.
 *
 * Progress is shown as steps completed rather than as a percentage, because a
 * sequence's steps are days apart and "40%" tells an agent nothing they can act
 * on — "step 2 of 5, next in 3 days" does.
 */
export default function SequenceEnrollments({ clientId, clientStatus }) {
  const { t } = useTranslation();
  const { showSuccess, showError } = useNotification();

  const [enrollments, setEnrollments] = useState([]);
  const [sequences, setSequences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [choosing, setChoosing] = useState(false);

  const closed = ['won', 'lost'].includes(clientStatus);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mine, all] = await Promise.all([
        apiClient.get(`/sequences/client/${clientId}`),
        apiClient.get('/sequences'),
      ]);
      setEnrollments(mine?.data?.enrollments || []);
      setSequences((all?.data?.sequences || []).filter((s) => s.isActive && s.steps?.length));
    } catch {
      // A missing panel is better than an error toast on a detail page.
    }
    setLoading(false);
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  const enroll = async (sequenceId) => {
    try {
      await apiClient.post(`/sequences/${sequenceId}/enroll`, { clientId });
      setChoosing(false);
      showSuccess('Enrolled');
      load();
    } catch (err) {
      showError(err?.message || 'Could not enroll this lead');
    }
  };

  const stop = async (sequenceId) => {
    try {
      await apiClient.delete(`/sequences/${sequenceId}/enroll/${clientId}`);
      showSuccess('Removed from the sequence');
      load();
    } catch (err) {
      showError(err?.message || 'Could not remove this lead');
    }
  };

  const active = enrollments.filter((e) => e.status === 'active');
  const activeIds = new Set(active.map((e) => String(e.sequence?._id)));
  const available = sequences.filter((s) => !activeIds.has(String(s._id)));

  if (loading) return <p className='text-xs text-slate-400'>{t('common.loading')}</p>;

  return (
    <div>
      <div className='flex items-center justify-between mb-3'>
        <h3 className='font-semibold text-sm text-slate-900'>Follow-up sequences</h3>
        {!closed && available.length > 0 && (
          <button
            type='button'
            onClick={() => setChoosing((c) => !c)}
            className='inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors'
          >
            <HiPlay className='w-3.5 h-3.5' />
            Enroll
          </button>
        )}
      </div>

      {closed && (
        <p className='text-xs text-slate-400 mb-2'>
          This lead is marked {clientStatus} — sequences stop automatically.
        </p>
      )}

      {choosing && (
        <div className='mb-3 border border-slate-200 rounded-xl overflow-hidden'>
          {available.map((sequence) => (
            <button
              key={sequence._id}
              type='button'
              onClick={() => enroll(sequence._id)}
              className='flex items-center justify-between w-full px-3 py-2 hover:bg-slate-50 transition-colors text-left border-b border-slate-100 last:border-0'
            >
              <span>
                <span className='block text-xs font-medium text-slate-800'>{sequence.name}</span>
                <span className='block text-[11px] text-slate-400'>
                  {sequence.steps.length} step{sequence.steps.length === 1 ? '' : 's'}
                </span>
              </span>
              <HiPlay className='w-3.5 h-3.5 text-slate-400' />
            </button>
          ))}
        </div>
      )}

      {!enrollments.length ? (
        <p className='text-xs text-slate-400'>Not on any sequence.</p>
      ) : (
        <ul className='space-y-2'>
          {enrollments.map((enrollment) => {
            const total = enrollment.totalSteps || 0;
            const done = Math.min(enrollment.currentStep, total);
            const isActive = enrollment.status === 'active';

            return (
              <li key={enrollment._id} className='border border-slate-200 rounded-xl p-3'>
                <div className='flex items-start justify-between gap-2'>
                  <div className='min-w-0'>
                    <p className='text-xs font-medium text-slate-800 truncate'>
                      {enrollment.sequence?.name || 'Sequence'}
                    </p>
                    <p className='text-[11px] text-slate-500 mt-0.5 flex items-center gap-1'>
                      {enrollment.status === 'completed' ? (
                        <><HiCheckCircle className='w-3.5 h-3.5 text-emerald-500' /> Finished</>
                      ) : isActive ? (
                        <>
                          <HiClock className='w-3.5 h-3.5 text-slate-400' />
                          Step {done + 1} of {total}
                          {enrollment.nextStepAt && (
                            <> &middot; next {new Date(enrollment.nextStepAt).toLocaleDateString()}</>
                          )}
                        </>
                      ) : (
                        <>Stopped{enrollment.stoppedReason ? ` — ${enrollment.stoppedReason}` : ''}</>
                      )}
                    </p>
                  </div>

                  {isActive && (
                    <button
                      type='button'
                      onClick={() => stop(enrollment.sequence._id)}
                      className='p-1.5 text-slate-400 hover:text-rose-600 transition-colors flex-shrink-0'
                      title='Stop this sequence'
                    >
                      <HiStop className='w-4 h-4' />
                    </button>
                  )}
                </div>

                {total > 0 && (
                  <div className='mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden'>
                    <div
                      className={isActive ? 'h-full bg-indigo-500' : 'h-full bg-slate-300'}
                      style={{ width: `${Math.round((done / total) * 100)}%` }}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

SequenceEnrollments.propTypes = {
  clientId: PropTypes.string.isRequired,
  clientStatus: PropTypes.string,
};

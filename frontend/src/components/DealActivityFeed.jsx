import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { HiClock, HiArrowRight } from 'react-icons/hi';
import { apiClient } from '../utils/http';
import { formatDate } from '../utils/currency';

/**
 * A deal's own history.
 *
 * `stageHistory` has been written on every stage change since the pipeline
 * shipped, and `updateDealStage` now logs an activity entry against the deal
 * itself — but nothing read either back, so a deal's history existed only in
 * the database. This is the screen for it.
 */
export default function DealActivityFeed({ dealId }) {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!dealId) return undefined;

    let alive = true;
    setLoading(true);

    apiClient
      .get(`/activity?entityType=deal&entityId=${dealId}&limit=50`)
      .then((res) => { if (alive) setItems(res?.data?.items || []); })
      .catch(() => { if (alive) setItems([]); })
      .finally(() => { if (alive) setLoading(false); });

    return () => { alive = false; };
  }, [dealId]);

  if (loading) return <p className='text-xs text-slate-400 py-2'>{t('common.loading')}</p>;

  if (!items.length) {
    return <p className='text-xs text-slate-400 py-2'>No history yet — it starts at the first stage change.</p>;
  }

  return (
    <ul className='space-y-2.5'>
      {items.map((entry) => (
        <li key={entry._id} className='flex items-start gap-2.5'>
          <span className='w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5'>
            <HiClock className='w-3.5 h-3.5 text-slate-500' />
          </span>

          <div className='min-w-0 flex-1'>
            {/* The stage change is the interesting part, so show it as a move. */}
            {entry.changes?.stage ? (
              <p className='text-xs text-slate-800 flex items-center gap-1 flex-wrap'>
                <span className='capitalize'>{String(entry.changes.stage.from || '').replace(/_/g, ' ')}</span>
                <HiArrowRight className='w-3 h-3 text-slate-400' />
                <span className='font-medium capitalize'>{String(entry.changes.stage.to || '').replace(/_/g, ' ')}</span>
              </p>
            ) : (
              <p className='text-xs text-slate-800'>{entry.message}</p>
            )}

            {entry.meta?.notes && (
              <p className='text-xs text-slate-500 mt-0.5'>{entry.meta.notes}</p>
            )}

            <p className='text-[11px] text-slate-400 mt-0.5'>
              {entry.createdBy?.username || t('common.unknown')}
              {' · '}
              {formatDate(entry.createdAt, { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

DealActivityFeed.propTypes = {
  dealId: PropTypes.string,
};

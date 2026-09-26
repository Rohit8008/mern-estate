import { useState } from 'react';
import { HiOutlineBan } from 'react-icons/hi';
import { apiClient } from '../utils/http';
import { useNotification } from '../contexts/NotificationContext';
import { formatDate } from '../utils/currency';
import { useTranslation } from 'react-i18next';

/**
 * Whether automated follow-up email may go to this lead, and the controls for it.
 *
 * The state comes from the workspace suppression list, via `client.emailOptOut`.
 * An agent can record that someone asked to stop (on the phone, say); only an
 * admin can undo it, and only when the agency recorded it — a person's own
 * unsubscribe is theirs to reverse, not the agency's. The server enforces both.
 */
export default function EmailOptOut({ client, isAdmin, onChange }) {
  const { t } = useTranslation();
  const { showSuccess, showError } = useNotification();
  const [busy, setBusy] = useState(false);
  const optOut = client.emailOptOut;

  const run = async (request, message) => {
    setBusy(true);
    try {
      const res = await request();
      onChange(res?.data?.emailOptOut ?? null);
      showSuccess(message);
    } catch (err) {
      showError(err?.message || t('emailOptOut.failed'));
    } finally {
      setBusy(false);
    }
  };

  if (!optOut) {
    return (
      <div>
        <button
          type='button'
          disabled={busy}
          onClick={() => run(() => apiClient.post(`/clients/${client._id}/email-opt-out`, {}), t('emailOptOut.stopped'))}
          className='text-xs font-medium text-slate-600 underline underline-offset-2 hover:text-slate-900 disabled:opacity-50 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'
        >
          {t('emailOptOut.stopAction')}
        </button>
      </div>
    );
  }

  const bySelf = optOut.source !== 'agent';
  return (
    <div className='flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900'>
      <HiOutlineBan className='w-4 h-4 flex-shrink-0' aria-hidden='true' />
      <span>
        {bySelf ? t('emailOptOut.unsubscribedSelf') : t('emailOptOut.unsubscribedAgent')}
        {optOut.at ? ` · ${formatDate(optOut.at)}` : ''}
      </span>
      {!bySelf && isAdmin && (
        <button
          type='button'
          disabled={busy}
          onClick={() => run(() => apiClient.delete(`/clients/${client._id}/email-opt-out`), t('emailOptOut.undone'))}
          className='ml-auto font-medium underline underline-offset-2 hover:text-amber-950 disabled:opacity-50 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'
        >
          {t('emailOptOut.undoAction')}
        </button>
      )}
    </div>
  );
}

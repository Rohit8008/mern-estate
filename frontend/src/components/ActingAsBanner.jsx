import { useState } from 'react';
import { HiOutlineEye, HiOutlineLogout } from 'react-icons/hi';
import { useActingAs } from '../hooks/useActingAs';
import { useNotification } from '../contexts/NotificationContext';
import { useTranslation } from 'react-i18next';

/**
 * "You are not where you think you are."
 *
 * A platform operator inside a customer's workspace sees that agency's name,
 * that agency's colours and that agency's data — the product is doing its job
 * of looking like theirs. That is exactly what makes this banner necessary: the
 * usual cues all point the wrong way, so the correction has to be loud,
 * permanent, and impossible to dismiss.
 *
 * Amber rather than red: this is a state to be aware of, not an error. It also
 * states the read-only rule up front, so a blocked save is never a surprise.
 */
export default function ActingAsBanner({ top = 'top-0' }) {
  const { t } = useTranslation();
  const { actingAs, isActing, leave } = useActingAs();
  const { showError } = useNotification();
  const [leaving, setLeaving] = useState(false);

  if (!isActing) return null;

  async function exit() {
    setLeaving(true);
    try {
      await leave();
    } catch (err) {
      showError(err?.message || 'Could not leave that workspace.');
      setLeaving(false);
    }
  }

  return (
    <div className={`sticky ${top} z-40 bg-amber-500 text-amber-950`}>
      <div className="flex items-center gap-3 px-4 lg:px-6 h-10">
        <HiOutlineEye className="w-4 h-4 flex-shrink-0" />
        <p className="text-sm font-medium truncate">{t('actingAsBanner.viewing')}<span className="font-bold">{actingAs.name}</span>{t('actingAsBanner.asAPlatformOperator')}<span className="hidden sm:inline font-normal">{t('actingAsBanner.readOnlyAndYourVisitIs')}</span>
        </p>
        <button
          type="button"
          onClick={exit}
          disabled={leaving}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-950/10 hover:bg-amber-950/20 text-sm font-semibold flex-shrink-0 disabled:opacity-60 transition-colors"
        >
          <HiOutlineLogout className="w-4 h-4" />
          {leaving ? 'Leaving…' : 'Leave workspace'}
        </button>
      </div>
    </div>
  );
}

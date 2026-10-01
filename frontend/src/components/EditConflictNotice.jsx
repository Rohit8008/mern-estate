import { useTranslation } from 'react-i18next';
import { HiOutlineExclamation } from 'react-icons/hi';
import { Button } from '../design-system';

/**
 * Shown when a save is refused because someone else saved the same record
 * after this form loaded it (409 VERSION_CONFLICT).
 *
 * An inline strip rather than a modal: the listing form carries a Leaflet map,
 * whose panes sit at z-index 400–800, and CLAUDE.md asks for inline
 * confirmation on map pages. The same strip is used in the client forms so
 * the choice looks the same everywhere.
 *
 * Two ways out, and nothing happens until one is chosen: take their version
 * (this form's edits are discarded) or keep mine (their edit is replaced).
 */
export default function EditConflictNotice({ currentUpdatedAt, onReload, onOverwrite, busy = false }) {
  const { t, i18n } = useTranslation();
  const when = currentUpdatedAt
    ? new Date(currentUpdatedAt).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' })
    : null;

  return (
    <div
      role='alert'
      className='flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-500/40 dark:bg-amber-500/10'
    >
      <HiOutlineExclamation className='w-5 h-5 flex-shrink-0 text-amber-600 dark:text-amber-400' aria-hidden='true' />
      <div className='flex-1 min-w-0 text-sm'>
        <p className='font-semibold text-amber-900 dark:text-amber-200'>{t('editConflict.title')}</p>
        <p className='text-amber-800 dark:text-amber-300/90'>
          {when ? t('editConflict.bodyAt', { when }) : t('editConflict.body')}
        </p>
      </div>
      <div className='flex items-center gap-2 flex-shrink-0'>
        <Button type='button' size='sm' variant='secondary' onClick={onReload} disabled={busy}>
          {t('editConflict.reload')}
        </Button>
        <Button type='button' size='sm' variant='primary' onClick={onOverwrite} loading={busy}>
          {t('editConflict.overwrite')}
        </Button>
      </div>
    </div>
  );
}

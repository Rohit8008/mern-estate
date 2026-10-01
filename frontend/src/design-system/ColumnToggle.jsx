import { useTranslation } from 'react-i18next';
import { HiOutlineViewBoards } from 'react-icons/hi';
import Dropdown, { DropdownCheckboxItem, DropdownLabel, DropdownSeparator } from './Dropdown';

/**
 * "Which columns do I want to see" — pair with useColumnPrefs.
 *
 * `columns` is [{ key, label, locked }]. A locked column (the record's name,
 * usually) cannot be hidden, because a table with no way to tell rows apart is
 * not a table anyone can use.
 */
export default function ColumnToggle({ columns, isVisible, onToggle, onReset }) {
  const { t } = useTranslation();
  const hidden = columns.filter((c) => !isVisible(c.key)).length;

  return (
    <Dropdown
      label={t('ds.columns')}
      trigger={(props) => (
        <button
          {...props}
          className='inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-border bg-card text-foreground/80 hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'
        >
          <HiOutlineViewBoards className='w-4 h-4' aria-hidden='true' />
          {t('ds.columns')}
          {hidden > 0 && (
            <span className='ml-0.5 text-xs text-muted-foreground tabular-nums'>
              {t('ds.hiddenCount', { count: hidden })}
            </span>
          )}
        </button>
      )}
    >
      <DropdownLabel>{t('ds.showColumns')}</DropdownLabel>
      {columns.map((col) => (
        <DropdownCheckboxItem
          key={col.key}
          checked={isVisible(col.key)}
          disabled={col.locked}
          onCheckedChange={() => onToggle(col.key)}
        >
          {col.label}
        </DropdownCheckboxItem>
      ))}
      {onReset && hidden > 0 && (
        <>
          <DropdownSeparator />
          <button
            type='button'
            role='menuitem'
            tabIndex={-1}
            onClick={onReset}
            className='w-full px-3 py-2 text-sm text-left text-muted-foreground hover:bg-accent hover:text-foreground focus:outline-none focus-visible:bg-accent'
          >
            {t('ds.resetColumns')}
          </button>
        </>
      )}
    </Dropdown>
  );
}

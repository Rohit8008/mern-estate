import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { HiX } from 'react-icons/hi';

/**
 * The bar that appears once rows are selected.
 *
 * No list screen had checkboxes, so reassigning a departing agent's forty leads
 * meant forty trips through a dropdown.
 *
 * Fixed to the bottom rather than pushed into the toolbar: the selection is
 * made by scrolling a long list, and a bar at the top would be off-screen by
 * the time anyone wants it.
 */
export default function BulkActionBar({ count, onClear, children }) {
  const { t } = useTranslation();
  if (!count) return null;

  return (
    <div className='fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-3xl'>
      <div className='flex items-center gap-3 px-4 py-3 bg-slate-900 text-white rounded-2xl shadow-2xl flex-wrap'>
        <span className='text-sm font-medium whitespace-nowrap'>
          {t('common.selected', { count })}
        </span>

        <div className='h-5 w-px bg-white/20' />

        <div className='flex items-center gap-2 flex-wrap flex-1'>{children}</div>

        <button
          type='button'
          onClick={onClear}
          className='p-1.5 text-white/60 hover:text-white transition-colors flex-shrink-0'
          aria-label={t('common.clear')}
        >
          <HiX className='w-4 h-4' aria-hidden='true' />
        </button>
      </div>
    </div>
  );
}

BulkActionBar.propTypes = {
  count: PropTypes.number.isRequired,
  onClear: PropTypes.func.isRequired,
  children: PropTypes.node,
};

/** A select styled for the dark bar. */
export function BulkSelect({ value, onChange, children, ...rest }) {
  return (
    <select
      value={value}
      onChange={onChange}
      className='px-3 py-1.5 rounded-lg bg-white/10 border border-white/10 text-white text-sm hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white transition-colors [&>option]:text-slate-900'
      {...rest}
    >
      {children}
    </select>
  );
}

BulkSelect.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  children: PropTypes.node,
};

/** A button styled for the dark bar. `danger` marks a destructive action. */
export function BulkButton({ onClick, danger = false, children, ...rest }) {
  return (
    <button
      type='button'
      onClick={onClick}
      className={
        danger
          ? 'px-3 py-1.5 rounded-lg bg-rose-500/90 hover:bg-rose-500 text-white text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white'
          : 'px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-white text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white'
      }
      {...rest}
    >
      {children}
    </button>
  );
}

BulkButton.propTypes = {
  onClick: PropTypes.func.isRequired,
  danger: PropTypes.bool,
  children: PropTypes.node,
};

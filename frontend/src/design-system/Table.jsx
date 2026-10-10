import { HiChevronUp, HiChevronDown, HiSelector } from 'react-icons/hi';

function cx(...xs) { return xs.filter(Boolean).join(' '); }

/**
 * Consistent table primitives used across all CRM list views.
 * Wraps the table in an overflow-x-auto container by default.
 *
 * `maxHeight` (a class such as 'max-h-[70vh]') turns the wrapper into the
 * scroll box, which is what lets `<Thead sticky>` stay put — a sticky header
 * sticks to its nearest scrolling ancestor, and without one it scrolls away.
 */
export function Table({ children, className, maxHeight }) {
  return (
    // `relative`: an absolutely positioned child (a visually-hidden header label)
    // is clipped by the scroll box only when the box is its containing block.
    // bg-white + shadow-sm make the table read as a data card floating on the
    // slate-50 page rather than dissolving into it.
    <div className={cx('relative rounded-2xl border border-slate-200 bg-white shadow-sm', maxHeight ? cx('overflow-auto', maxHeight) : 'overflow-x-auto')}>
      <table className={cx('w-full text-sm text-left', className)}>
        {children}
      </table>
    </div>
  );
}

export function Thead({ children, sticky = false }) {
  return (
    <thead className={cx('bg-slate-50 border-b border-slate-200', sticky && 'sticky top-0 z-10 shadow-[0_1px_0_0_hsl(var(--border))]')}>
      {children}
    </thead>
  );
}

/**
 * A header cell. Pass `sortKey`, the table's current `sort` ({ key, dir }) and
 * `onSort` to make it sortable — see useTableSort. The cell carries aria-sort
 * so a screen reader announces the order, and the control inside is a real
 * button so the keyboard can reach it.
 */
export function Th({ children, className, right, sortKey, sort, onSort }) {
  const sortable = sortKey && onSort;
  const active = sortable && sort?.key === sortKey;
  const ariaSort = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : sortable ? 'none' : undefined;
  const Icon = active ? (sort.dir === 'asc' ? HiChevronUp : HiChevronDown) : HiSelector;

  return (
    <th
      aria-sort={ariaSort}
      className={cx(
        'px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap',
        right && 'text-right',
        className
      )}
    >
      {sortable ? (
        <button
          type='button'
          onClick={() => onSort(sortKey)}
          className={cx(
            'group inline-flex items-center gap-1 uppercase tracking-wider font-semibold rounded',
            'hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
            right && 'flex-row-reverse',
            active && 'text-slate-800'
          )}
        >
          {children}
          <Icon
            aria-hidden='true'
            className={cx('w-3.5 h-3.5 flex-shrink-0', active ? 'opacity-100' : 'opacity-40 group-hover:opacity-80')}
          />
        </button>
      ) : children}
    </th>
  );
}

export function Tbody({ children }) {
  return <tbody className='divide-y divide-slate-100'>{children}</tbody>;
}

// A clickable row is reachable by keyboard too: focusable, and Enter/Space
// act like a click. Keys pressed on a control inside the row (a button, a link,
// an input) belong to that control, so they are left alone. No role="button":
// on a <tr> it would strip the row out of the table for a screen reader.
// `selected` tints a row picked by its checkbox. Visual only — the checkbox in
// the row is what carries the state for assistive technology.
export function Tr({ children, onClick, className, selected = false }) {
  const onKeyDown = onClick
    ? (e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(e);
        }
      }
    : undefined;
  return (
    <tr
      onClick={onClick}
      onKeyDown={onKeyDown}
      tabIndex={onClick ? 0 : undefined}
      className={cx(
        'transition-colors',
        selected && 'bg-brand-50/60 dark:bg-brand-950/40',
        onClick ? 'cursor-pointer hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500' : 'hover:bg-slate-50/50',
        className
      )}
    >
      {children}
    </tr>
  );
}

export function Td({ children, className, right, muted }) {
  return (
    <td className={cx(
      'px-4 py-3 whitespace-nowrap',
      muted ? 'text-slate-500' : 'text-slate-700',
      right && 'text-right',
      className
    )}>
      {children}
    </td>
  );
}

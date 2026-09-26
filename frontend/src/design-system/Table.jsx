function cx(...xs) { return xs.filter(Boolean).join(' '); }

/**
 * Consistent table primitives used across all CRM list views.
 * Wraps the table in an overflow-x-auto container by default.
 */

export function Table({ children, className }) {
  return (
    <div className='overflow-x-auto rounded-xl border border-slate-200'>
      <table className={cx('w-full text-sm text-left', className)}>
        {children}
      </table>
    </div>
  );
}

export function Thead({ children }) {
  return (
    <thead className='bg-slate-50 border-b border-slate-200'>
      {children}
    </thead>
  );
}

export function Th({ children, className, right }) {
  return (
    <th className={cx(
      'px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap',
      right && 'text-right',
      className
    )}>
      {children}
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
export function Tr({ children, onClick, className }) {
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

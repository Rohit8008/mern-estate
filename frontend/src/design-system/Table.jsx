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

export function Tr({ children, onClick, className }) {
  return (
    <tr
      onClick={onClick}
      className={cx(
        'transition-colors',
        onClick ? 'cursor-pointer hover:bg-slate-50' : 'hover:bg-slate-50/50',
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
      muted ? 'text-slate-400' : 'text-slate-700',
      right && 'text-right',
      className
    )}>
      {children}
    </td>
  );
}

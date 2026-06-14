function cx(...xs) { return xs.filter(Boolean).join(' '); }

export default function Card({ children, className, padding = true, hover = false, ...props }) {
  return (
    <div
      {...props}
      className={cx(
        'bg-white border border-slate-200 rounded-xl shadow-sm',
        padding && 'p-5',
        hover && 'hover:shadow-md transition-shadow',
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className, action }) {
  return (
    <div className={cx('flex items-center justify-between mb-4', className)}>
      <div className='min-w-0 flex-1'>{children}</div>
      {action && <div className='flex-shrink-0 ml-3'>{action}</div>}
    </div>
  );
}

export function CardTitle({ children, className }) {
  return <h3 className={cx('text-sm font-semibold text-slate-700 leading-tight', className)}>{children}</h3>;
}

export function CardDescription({ children, className }) {
  return <p className={cx('text-xs text-slate-400 mt-0.5', className)}>{children}</p>;
}

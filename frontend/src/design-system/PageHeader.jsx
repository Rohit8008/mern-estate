function cx(...xs) { return xs.filter(Boolean).join(' '); }

/**
 * Standard CRM page header.
 *
 * Props:
 *   title      — page title (string)
 *   description — subtitle (string, optional)
 *   actions    — ReactNode rendered on the right (buttons, etc.)
 *   dark       — renders gradient dark banner (for dashboard-style headers)
 *   children   — extra content below title row (e.g. tabs, filters)
 */
export default function PageHeader({ title, description, actions, dark = false, children, className }) {
  if (dark) {
    return (
      <div className={cx(
        'relative bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl px-6 py-5 overflow-hidden',
        className
      )}>
        <div className='absolute inset-0 crm-banner-dots pointer-events-none' aria-hidden='true' />
        <div className='relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
          <div className='min-w-0'>
            <h1 className='text-xl font-bold text-white tracking-tight'>{title}</h1>
            {description && <p className='text-slate-400 text-sm mt-0.5'>{description}</p>}
          </div>
          {actions && <div className='flex items-center gap-2 flex-shrink-0'>{actions}</div>}
        </div>
        {children && <div className='relative mt-4'>{children}</div>}
      </div>
    );
  }

  return (
    <div className={cx('flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3', className)}>
      <div className='min-w-0'>
        <h1 className='text-xl font-bold text-slate-900 tracking-tight'>{title}</h1>
        {description && <p className='text-slate-500 text-sm mt-0.5'>{description}</p>}
      </div>
      {actions && <div className='flex items-center gap-2 flex-shrink-0'>{actions}</div>}
      {children && <div className='w-full mt-2'>{children}</div>}
    </div>
  );
}

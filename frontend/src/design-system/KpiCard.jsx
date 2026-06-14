function cx(...xs) { return xs.filter(Boolean).join(' '); }

const ACCENT_COLORS = {
  blue:    { bar: 'border-t-blue-500',    icon: 'bg-blue-50 ring-blue-100',    text: 'text-blue-600'    },
  amber:   { bar: 'border-t-amber-500',   icon: 'bg-amber-50 ring-amber-100',  text: 'text-amber-600'   },
  emerald: { bar: 'border-t-emerald-500', icon: 'bg-emerald-50 ring-emerald-100', text: 'text-emerald-600' },
  purple:  { bar: 'border-t-purple-500',  icon: 'bg-purple-50 ring-purple-100', text: 'text-purple-600'  },
  rose:    { bar: 'border-t-rose-500',    icon: 'bg-rose-50 ring-rose-100',    text: 'text-rose-600'    },
  indigo:  { bar: 'border-t-indigo-500',  icon: 'bg-indigo-50 ring-indigo-100', text: 'text-indigo-600'  },
  slate:   { bar: 'border-t-slate-500',   icon: 'bg-slate-100 ring-slate-200', text: 'text-slate-600'   },
};

/**
 * Standard KPI metric card used throughout dashboards.
 *
 * Props:
 *   title      — label above the number (e.g. "Total Properties")
 *   value      — primary number (already formatted string or number)
 *   icon       — HeroIcon component
 *   color      — one of the accent color keys above
 *   sub        — optional subtitle/secondary stat (ReactNode)
 *   trend      — optional { value: number, label: string } for trend indicator
 *   onClick    — optional click handler
 */
export default function KpiCard({ title, value, icon: Icon, color = 'blue', sub, trend, onClick, className }) {
  const c = ACCENT_COLORS[color] || ACCENT_COLORS.blue;
  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      onClick={onClick}
      className={cx(
        'bg-white border border-slate-200 rounded-xl p-5 shadow-sm',
        'border-t-2', c.bar,
        'hover:shadow-md transition-shadow',
        onClick && 'cursor-pointer text-left w-full',
        className
      )}
    >
      <div className='flex items-center justify-between mb-3'>
        <span className='text-xs font-semibold text-slate-500 uppercase tracking-wider leading-tight'>{title}</span>
        {Icon && (
          <div className={cx('w-9 h-9 rounded-xl flex items-center justify-center ring-1', c.icon)}>
            <Icon className={cx('w-5 h-5', c.text)} />
          </div>
        )}
      </div>

      <div className='text-3xl font-bold text-slate-900 mb-2 tabular-nums'>
        {value ?? '—'}
      </div>

      {trend && (
        <div className={cx(
          'inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded mb-1',
          trend.value >= 0
            ? 'bg-emerald-50 text-emerald-700'
            : 'bg-rose-50 text-rose-700'
        )}>
          {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
        </div>
      )}

      {sub && <div className='text-xs text-slate-500 leading-relaxed'>{sub}</div>}
    </Tag>
  );
}

function cx(...xs) { return xs.filter(Boolean).join(' '); }

/**
 * Per-accent class strings. Every value is a COMPLETE literal — Tailwind scans
 * source as plain text, so an interpolated `from-${color}-500` is never emitted
 * and the element renders colourless. Keyed lookup only.
 *
 *   tile  — gradient fill for the icon chip (used with bg-gradient-to-br)
 *   glow  — coloured drop-shadow under the icon chip (used with shadow-lg)
 *   blob  — the soft corner aurora bloom behind the chip
 *   hover — card border tint on hover
 */
const ACCENT_COLORS = {
  blue:    { tile: 'from-blue-500 to-blue-600',       glow: 'shadow-blue-500/30',    blob: 'bg-blue-400/20',    hover: 'hover:border-blue-200/80' },
  amber:   { tile: 'from-amber-500 to-amber-600',     glow: 'shadow-amber-500/30',   blob: 'bg-amber-400/20',   hover: 'hover:border-amber-200/80' },
  emerald: { tile: 'from-emerald-500 to-emerald-600', glow: 'shadow-emerald-500/30', blob: 'bg-emerald-400/20', hover: 'hover:border-emerald-200/80' },
  purple:  { tile: 'from-purple-500 to-purple-600',   glow: 'shadow-purple-500/30',  blob: 'bg-purple-400/20',  hover: 'hover:border-purple-200/80' },
  rose:    { tile: 'from-rose-500 to-rose-600',       glow: 'shadow-rose-500/30',    blob: 'bg-rose-400/20',    hover: 'hover:border-rose-200/80' },
  indigo:  { tile: 'from-indigo-500 to-indigo-600',   glow: 'shadow-indigo-500/30',  blob: 'bg-indigo-400/20',  hover: 'hover:border-indigo-200/80' },
  slate:   { tile: 'from-slate-600 to-slate-700',     glow: 'shadow-slate-500/30',   blob: 'bg-slate-400/20',   hover: 'hover:border-slate-300' },
};

/**
 * Standard KPI metric card used throughout dashboards and analytics.
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
        'group relative overflow-hidden bg-white border border-slate-200 rounded-2xl p-5 shadow-sm',
        'transition-[box-shadow,transform,border-color] duration-200 hover:shadow-lg',
        c.hover,
        onClick && 'cursor-pointer text-left w-full hover:-translate-y-1 active:translate-y-0 active:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2',
        className
      )}
    >
      {/* Soft corner aurora — carries the accent hue without a hard border. */}
      <div
        aria-hidden='true'
        className={cx(
          'pointer-events-none absolute -top-10 -right-10 w-28 h-28 rounded-full blur-2xl opacity-70 transition-opacity duration-300 group-hover:opacity-100',
          c.blob
        )}
      />

      <div className='relative flex items-start justify-between mb-4 gap-3'>
        <span className='text-xs font-semibold text-slate-500 uppercase tracking-wider leading-tight pt-1'>{title}</span>
        {Icon && (
          <div className={cx(
            'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg ring-1 ring-white/20',
            'bg-gradient-to-br transition-transform duration-200 group-hover:scale-105',
            c.tile, c.glow
          )}>
            <Icon className='w-5 h-5 text-white' />
          </div>
        )}
      </div>

      <div className='relative text-[1.75rem] leading-none font-bold text-slate-900 mb-2.5 tabular-nums tracking-tight'>
        {value ?? '—'}
      </div>

      {trend && (
        <div className={cx(
          'relative inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full mb-1.5',
          trend.value >= 0
            ? 'bg-emerald-50 text-emerald-700'
            : 'bg-rose-50 text-rose-700'
        )}>
          {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
        </div>
      )}

      {sub && <div className='relative text-xs text-slate-500 leading-relaxed'>{sub}</div>}
    </Tag>
  );
}

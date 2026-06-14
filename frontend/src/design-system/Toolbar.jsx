function cx(...xs) { return xs.filter(Boolean).join(' '); }

/**
 * Standard action toolbar used above list/board pages.
 * Renders a white rounded container with consistent padding.
 *
 * Usage:
 *   <Toolbar left={<SearchBar ... />} right={<Button>Add</Button>} />
 */
export default function Toolbar({ left, right, children, className }) {
  return (
    <div className={cx(
      'flex flex-wrap items-center justify-between gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2.5 shadow-sm',
      className
    )}>
      <div className='flex flex-wrap items-center gap-2 flex-1 min-w-0'>{left}</div>
      {right && <div className='flex items-center gap-2 flex-shrink-0'>{right}</div>}
      {children}
    </div>
  );
}

export function ToolbarDivider() {
  return <span className='w-px h-5 bg-slate-200 hidden sm:block' />;
}

export function ViewToggle({ view, onChange, options }) {
  return (
    <div className='flex items-center rounded-lg border border-slate-200 overflow-hidden bg-slate-50'>
      {options.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          type='button'
          title={label}
          onClick={() => onChange(value)}
          className={`p-2 transition-colors ${view === value
            ? 'bg-slate-900 text-white'
            : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
          }`}
        >
          <Icon className='w-4 h-4' />
        </button>
      ))}
    </div>
  );
}

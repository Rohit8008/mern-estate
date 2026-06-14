function cx(...xs) { return xs.filter(Boolean).join(' '); }

const VARIANT = {
  default:  'bg-slate-100 text-slate-700 ring-1 ring-slate-200/80',
  success:  'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80',
  warning:  'bg-amber-50 text-amber-700 ring-1 ring-amber-200/80',
  error:    'bg-rose-50 text-rose-700 ring-1 ring-rose-200/80',
  info:     'bg-blue-50 text-blue-700 ring-1 ring-blue-200/80',
  brand:    'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200/80',
  purple:   'bg-purple-50 text-purple-700 ring-1 ring-purple-200/80',
  slate:    'bg-slate-100 text-slate-600 ring-1 ring-slate-200/80',
};

const SIZE = {
  xs: 'px-1.5 py-0.5 text-[10px] rounded-md',
  sm: 'px-2 py-0.5 text-xs rounded-md',
  md: 'px-2.5 py-1 text-xs rounded-lg',
};

export default function Badge({ children, variant = 'default', size = 'sm', dot, className }) {
  function cx2(...xs) { return xs.filter(Boolean).join(' '); }
  return (
    <span className={cx2('inline-flex items-center gap-1 font-medium', SIZE[size], VARIANT[variant], className)}>
      {dot && <span className={cx2('w-1.5 h-1.5 rounded-full flex-shrink-0',
        variant === 'success' ? 'bg-emerald-500' :
        variant === 'warning' ? 'bg-amber-500' :
        variant === 'error'   ? 'bg-rose-500' :
        variant === 'info'    ? 'bg-blue-500' :
        variant === 'brand'   ? 'bg-indigo-500' :
        variant === 'purple'  ? 'bg-purple-500' : 'bg-slate-400'
      )} />}
      {children}
    </span>
  );
}

import { forwardRef } from 'react';

function cx(...xs) { return xs.filter(Boolean).join(' '); }

const SIZE = {
  xs: 'px-2.5 py-1 text-xs rounded-md gap-1.5',
  sm: 'px-3 py-1.5 text-sm rounded-lg gap-1.5',
  md: 'px-4 py-2 text-sm rounded-lg gap-2',
  lg: 'px-5 py-2.5 text-base rounded-xl gap-2',
};

const VARIANT = {
  primary:   'bg-slate-900 text-white hover:bg-slate-800 active:bg-slate-950 disabled:bg-slate-400',
  secondary: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50',
  ghost:     'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50',
  danger:    'bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800 disabled:bg-rose-300',
  brand:     'bg-indigo-600 text-white hover:bg-indigo-500 active:bg-indigo-700 disabled:bg-indigo-300',
  // For use on dark backgrounds
  dark:      'bg-white/10 text-white border border-white/10 hover:bg-white/20 disabled:opacity-50',
  darkBrand: 'bg-indigo-600 text-white hover:bg-indigo-500 disabled:bg-indigo-800',
};

const Button = forwardRef(function Button(
  { children, size = 'md', variant = 'primary', icon: Icon, iconRight: IconRight, loading = false, className, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      {...props}
      disabled={props.disabled || loading}
      className={cx(
        'inline-flex items-center font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed select-none',
        SIZE[size],
        VARIANT[variant],
        className
      )}
    >
      {loading ? (
        <svg className='animate-spin w-4 h-4 flex-shrink-0' fill='none' viewBox='0 0 24 24'>
          <circle className='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' strokeWidth='4' />
          <path className='opacity-75' fill='currentColor' d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z' />
        </svg>
      ) : Icon ? (
        <Icon className='w-4 h-4 flex-shrink-0' />
      ) : null}
      {children}
      {!loading && IconRight && <IconRight className='w-4 h-4 flex-shrink-0' />}
    </button>
  );
});

export default Button;

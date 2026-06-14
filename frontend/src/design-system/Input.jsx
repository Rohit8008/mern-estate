import { forwardRef } from 'react';

function cx(...xs) { return xs.filter(Boolean).join(' '); }

export const Input = forwardRef(function Input(
  { label, hint, error, icon: Icon, iconRight: IconRight, className, ...props },
  ref
) {
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      {label && (
        <label className='text-sm font-medium text-slate-700'>
          {label}
          {props.required && <span className='text-rose-500 ml-0.5'>*</span>}
        </label>
      )}
      <div className='relative'>
        {Icon && (
          <span className='absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none'>
            <Icon className='w-4 h-4' />
          </span>
        )}
        <input
          ref={ref}
          {...props}
          className={cx(
            'w-full border rounded-lg text-sm text-slate-900 placeholder:text-slate-400 bg-white transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400',
            error ? 'border-rose-400 focus:ring-rose-500/20 focus:border-rose-400' : 'border-slate-300',
            Icon ? 'pl-9' : 'pl-3',
            IconRight ? 'pr-9' : 'pr-3',
            'py-2',
            props.disabled && 'opacity-50 cursor-not-allowed bg-slate-50'
          )}
        />
        {IconRight && (
          <span className='absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none'>
            <IconRight className='w-4 h-4' />
          </span>
        )}
      </div>
      {error && <p className='text-xs text-rose-600'>{error}</p>}
      {hint && !error && <p className='text-xs text-slate-400'>{hint}</p>}
    </div>
  );
});

export const Select = forwardRef(function Select(
  { label, hint, error, className, children, ...props },
  ref
) {
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      {label && (
        <label className='text-sm font-medium text-slate-700'>
          {label}
          {props.required && <span className='text-rose-500 ml-0.5'>*</span>}
        </label>
      )}
      <select
        ref={ref}
        {...props}
        className={cx(
          'w-full border rounded-lg text-sm text-slate-900 bg-white px-3 py-2 transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400',
          error ? 'border-rose-400' : 'border-slate-300',
          props.disabled && 'opacity-50 cursor-not-allowed bg-slate-50'
        )}
      >
        {children}
      </select>
      {error && <p className='text-xs text-rose-600'>{error}</p>}
      {hint && !error && <p className='text-xs text-slate-400'>{hint}</p>}
    </div>
  );
});

export const Textarea = forwardRef(function Textarea(
  { label, hint, error, className, ...props },
  ref
) {
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      {label && (
        <label className='text-sm font-medium text-slate-700'>
          {label}
          {props.required && <span className='text-rose-500 ml-0.5'>*</span>}
        </label>
      )}
      <textarea
        ref={ref}
        {...props}
        className={cx(
          'w-full border rounded-lg text-sm text-slate-900 placeholder:text-slate-400 bg-white px-3 py-2 transition-colors resize-none',
          'focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400',
          error ? 'border-rose-400' : 'border-slate-300',
          props.disabled && 'opacity-50 cursor-not-allowed'
        )}
      />
      {error && <p className='text-xs text-rose-600'>{error}</p>}
      {hint && !error && <p className='text-xs text-slate-400'>{hint}</p>}
    </div>
  );
});

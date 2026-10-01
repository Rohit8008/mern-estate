import { forwardRef, useEffect, useRef } from 'react';

function cx(...xs) { return xs.filter(Boolean).join(' '); }

/**
 * A native checkbox, styled. Native so forms, labels and screen readers get
 * the real thing for free. `indeterminate` is a DOM property with no HTML
 * attribute, hence the effect — it is what a "select all" box shows when only
 * some rows are selected.
 */
export const Checkbox = forwardRef(function Checkbox({ indeterminate = false, className, ...props }, ref) {
  const inner = useRef(null);
  const setRef = (el) => {
    inner.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  };
  useEffect(() => {
    if (inner.current) inner.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={setRef}
      type='checkbox'
      {...props}
      className={cx(
        // accent-color, not border/bg utilities: there is no forms plugin, so a
        // native checkbox ignores those and only takes its tint from accent-color.
        'w-4 h-4 accent-brand-600 cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded disabled:opacity-50 disabled:cursor-not-allowed',
        className
      )}
    />
  );
});

/**
 * An on/off setting that takes effect immediately — a preference, a feature
 * flag. For a choice that is submitted with a form, use Checkbox.
 */
export function Switch({ checked, onChange, disabled, label, className, ...rest }) {
  return (
    <button
      type='button'
      role='switch'
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        checked ? 'bg-brand-600' : 'bg-input dark:bg-secondary',
        className
      )}
      {...rest}
    >
      <span
        aria-hidden='true'
        className={cx(
          'inline-block h-4 w-4 rounded-full bg-white shadow ring-1 ring-black/5 transition-transform motion-reduce:transition-none',
          checked ? 'translate-x-[18px]' : 'translate-x-0.5'
        )}
      />
    </button>
  );
}

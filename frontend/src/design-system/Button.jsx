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

/**
 * Renders a <button> by default, or whatever `as` names.
 *
 * Call sites that wanted a button-looking link were writing
 * `<Link to={...}><Button/></Link>`, which puts a <button> inside an <a>.
 * That is invalid HTML (a button is not permitted inside a link), and it gives
 * assistive technology two nested interactive controls for one action, which
 * is a WCAG 4.1.2 failure. Browsers also disagree about which of the two
 * handles a click, Enter and Space.
 *
 * `<Button as={Link} to='/somewhere'>` renders one <a> carrying the button's
 * styling, so there is exactly one control and the keyboard contract is the
 * anchor's.
 *
 * `disabled` is only forwarded when the element actually supports it: an <a>
 * has no disabled attribute, so a disabled link is expressed with
 * aria-disabled plus the pointer-events/opacity the class list already carries.
 */
const Button = forwardRef(function Button(
  { children, as: Component = 'button', size = 'md', variant = 'primary', icon: Icon, iconRight: IconRight, loading = false, className, ...props },
  ref
) {
  const isNativeButton = Component === 'button';
  const isDisabled = props.disabled || loading;

  // Strip `disabled` from the spread so it never lands on a non-button element.
  const { disabled: _disabled, ...rest } = props;

  // Deliberately NOT defaulting `type` here. Every submitting Button in the
  // codebase already passes type="submit" explicitly, but silently switching
  // the implicit default to "button" would be a behaviour change across every
  // form in the CRM for no benefit to the bug being fixed. `as` is additive.
  const behaviour = isNativeButton
    ? { disabled: isDisabled }
    : {
        'aria-disabled': isDisabled || undefined,
        tabIndex: isDisabled ? -1 : undefined,
      };

  return (
    <Component
      ref={ref}
      {...rest}
      {...behaviour}
      className={cx(
        // active:scale gives the button a physical press. Transitioning the
        // specific properties rather than `all` keeps it off the compositor's
        // slow path — `transition-all` here animated colour, shadow, border and
        // transform together on every hover across the whole CRM.
        'inline-flex items-center font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1',
        'active:scale-[0.98] disabled:active:scale-100 disabled:cursor-not-allowed select-none',
        SIZE[size],
        VARIANT[variant],
        !isNativeButton && isDisabled && 'pointer-events-none opacity-50',
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
    </Component>
  );
});

export default Button;

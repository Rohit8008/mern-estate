import { cloneElement, useCallback, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

function cx(...xs) { return xs.filter(Boolean).join(' '); }

const GAP = 8;

/**
 * A short label shown on hover and on keyboard focus.
 *
 * Portalled and fixed-positioned rather than absolute: the main use is the
 * collapsed sidebar, whose nav scrolls, and an absolutely-positioned tooltip
 * inside a scrolling box is clipped by it.
 *
 * The tooltip only describes; the child must still carry its own accessible
 * name. It is wired up with aria-describedby, so it is read as a description,
 * never instead of a name.
 */
export default function Tooltip({ content, side = 'top', disabled = false, children }) {
  const id = useId();
  const triggerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);

  const show = useCallback(() => { if (!disabled) setOpen(true); }, [disabled]);
  const hide = useCallback(() => setOpen(false), []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const placements = {
      top:    { top: r.top - GAP,                left: r.left + r.width / 2, transform: 'translate(-50%, -100%)' },
      bottom: { top: r.bottom + GAP,             left: r.left + r.width / 2, transform: 'translate(-50%, 0)' },
      right:  { top: r.top + r.height / 2,       left: r.right + GAP,        transform: 'translate(0, -50%)' },
      left:   { top: r.top + r.height / 2,       left: r.left - GAP,         transform: 'translate(-100%, -50%)' },
    };
    setPos(placements[side] || placements.top);
  }, [open, side]);

  if (!content) return children;

  const child = cloneElement(children, {
    ref: triggerRef,
    'aria-describedby': open && !disabled ? id : children.props['aria-describedby'],
    onMouseEnter: (e) => { children.props.onMouseEnter?.(e); show(); },
    onMouseLeave: (e) => { children.props.onMouseLeave?.(e); hide(); },
    onFocus: (e) => { children.props.onFocus?.(e); show(); },
    onBlur: (e) => { children.props.onBlur?.(e); hide(); },
  });

  return (
    <>
      {child}
      {open && !disabled && pos && createPortal(
        <span
          id={id}
          role='tooltip'
          style={{ position: 'fixed', ...pos }}
          className={cx(
            'z-[1100] pointer-events-none whitespace-nowrap rounded-md px-2 py-1',
            'text-xs font-medium bg-slate-900 text-white shadow-lg ring-1 ring-white/10',
            'dark:bg-slate-700'
          )}
        >
          {content}
        </span>,
        document.body
      )}
    </>
  );
}

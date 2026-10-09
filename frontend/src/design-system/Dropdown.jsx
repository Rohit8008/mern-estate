import { createContext, forwardRef, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

function cx(...xs) { return xs.filter(Boolean).join(' '); }

const MenuContext = createContext(null);

// The menu is positioned `fixed` (coordinates computed from the trigger) AND
// rendered through a portal on document.body. Fixed alone is not enough: an
// ancestor with `transform`, `filter`, `backdrop-filter` (the header's
// backdrop-blur!) or `contain` becomes the containing block for a fixed child,
// so the menu resolves against that 56px-tall header and gets clipped instead of
// floating over the viewport. The portal lifts it out of every such ancestor.
// `GAP` is the 8px offset the old `mt-2`/`mb-2` gave.
const GAP = 8;
const VALID_PLACEMENTS = new Set(['bottom-end', 'bottom-start', 'top-end', 'top-start']);

// Keep the menu off the very edge of the viewport, and never let it run off the
// page: cap its height to the room on whichever side it opens (the menu itself
// scrolls past that), and flip to the roomier side when the preferred one is too
// cramped — otherwise a tall menu near the top or bottom spills off-screen with
// no way to reach the last items.
const EDGE_MARGIN = 8;
const MIN_MENU_HEIGHT = 140;

function computeMenuStyle(rect, placement) {
  const end = placement.endsWith('end');
  const spaceBelow = window.innerHeight - rect.bottom - GAP - EDGE_MARGIN;
  const spaceAbove = rect.top - GAP - EDGE_MARGIN;

  let openUp = placement.startsWith('top');
  if (openUp && spaceAbove < MIN_MENU_HEIGHT && spaceBelow > spaceAbove) openUp = false;
  if (!openUp && spaceBelow < MIN_MENU_HEIGHT && spaceAbove > spaceBelow) openUp = true;

  const style = { position: 'fixed' };
  if (openUp) {
    style.bottom = Math.round(window.innerHeight - rect.top + GAP);
    style.maxHeight = Math.max(MIN_MENU_HEIGHT, Math.round(spaceAbove));
  } else {
    style.top = Math.round(rect.bottom + GAP);
    style.maxHeight = Math.max(MIN_MENU_HEIGHT, Math.round(spaceBelow));
  }
  if (end) style.right = Math.round(window.innerWidth - rect.right);
  else style.left = Math.round(rect.left);
  return style;
}

const ITEM_SELECTOR = '[role^="menuitem"]:not([aria-disabled="true"])';

/**
 * A menu button: the header's profile menu, row actions, column pickers.
 *
 * The CRM had three hand-rolled versions of this, each with a full-screen
 * invisible button as its click-catcher and none reachable by arrow key. This
 * one follows the WAI-ARIA menu-button pattern: the trigger announces the
 * menu, arrows move between items, Home/End jump, a letter jumps to the next
 * item starting with it, Escape closes and hands focus back to the trigger, and
 * Tab leaves the menu altogether.
 *
 * `trigger` is a render function receiving the props the trigger must spread,
 * so any element — an avatar, an icon button — can open a menu without
 * becoming a wrapper inside a wrapper.
 */
export default function Dropdown({ trigger, children, placement = 'bottom-end', className, label }) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);
  const menuId = useId();

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  const items = () => Array.from(menuRef.current?.querySelectorAll(ITEM_SELECTOR) || []);

  useEffect(() => {
    if (!open) return undefined;
    // Position from the trigger, then keep it aligned while open.
    const reposition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) setMenuStyle(computeMenuStyle(rect, VALID_PLACEMENTS.has(placement) ? placement : 'bottom-end'));
    };
    reposition();
    // Focus the first item once the menu is painted.
    items()[0]?.focus();
    const onDown = (e) => {
      // The menu is portaled out of rootRef, so an outside-click check must
      // exempt BOTH the trigger (rootRef) and the menu itself (menuRef).
      const inTrigger = rootRef.current?.contains(e.target);
      const inMenu = menuRef.current?.contains(e.target);
      if (!inTrigger && !inMenu) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    // Capture-phase scroll catches scrolling inside any ancestor, not just the
    // window, so the menu tracks the trigger instead of drifting.
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      setMenuStyle(null);
    };
  }, [open, placement]);

  const onMenuKeyDown = (e) => {
    const list = items();
    const index = list.indexOf(document.activeElement);
    const focusAt = (i) => list[(i + list.length) % list.length]?.focus();

    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); focusAt(index + 1); break;
      case 'ArrowUp':   e.preventDefault(); focusAt(index - 1); break;
      case 'Home':      e.preventDefault(); focusAt(0); break;
      case 'End':       e.preventDefault(); focusAt(list.length - 1); break;
      case 'Escape':    e.preventDefault(); close(true); break;
      case 'Tab':       setOpen(false); break;
      default:
        if (e.key.length === 1 && /\S/.test(e.key)) {
          const ch = e.key.toLowerCase();
          const order = [...list.slice(index + 1), ...list.slice(0, index + 1)];
          order.find((el) => el.textContent.trim().toLowerCase().startsWith(ch))?.focus();
        }
    }
  };

  const triggerProps = {
    ref: triggerRef,
    type: 'button',
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-controls': open ? menuId : undefined,
    onClick: () => setOpen((o) => !o),
    onKeyDown: (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); }
    },
  };

  return (
    <MenuContext.Provider value={{ close }}>
      <div ref={rootRef} className='relative'>
        {trigger(triggerProps, open)}
      </div>
      {open && createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role='menu'
          aria-label={label}
          tabIndex={-1}
          onKeyDown={onMenuKeyDown}
          style={menuStyle || undefined}
          className={cx(
            'z-50 min-w-[12rem] py-1.5 rounded-xl border border-border bg-popover text-popover-foreground shadow-xl',
            // maxHeight is set in computeMenuStyle; scroll past it rather than
            // spilling off the page.
            'overflow-y-auto overflow-x-hidden overscroll-contain',
            'origin-top animate-menu-in motion-reduce:animate-none focus:outline-none',
            // Hidden until positioned, so it never flashes at the top-left for
            // a frame before the fixed coordinates are measured.
            menuStyle ? 'visible' : 'invisible',
            className
          )}
        >
          {children}
        </div>,
        document.body
      )}
    </MenuContext.Provider>
  );
}

const itemClass = (danger) => cx(
  'w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors',
  'focus:outline-none focus-visible:bg-accent hover:bg-accent',
  danger ? 'text-rose-600 dark:text-rose-400' : 'text-foreground/80 hover:text-foreground'
);

/**
 * One action in a menu. Renders a <button> by default, or whatever `as` names —
 * `<DropdownItem as={Link} to='/profile'>` is one anchor, not a button in a link.
 */
export const DropdownItem = forwardRef(function DropdownItem(
  { as: Component = 'button', icon: Icon, danger = false, onSelect, onClick, disabled, children, className, ...rest },
  ref
) {
  const menu = useContext(MenuContext);
  const handle = (e) => {
    if (disabled) { e.preventDefault(); return; }
    onClick?.(e);
    onSelect?.(e);
    // A link navigates, which unmounts the trigger's page section anyway;
    // handing focus back to a trigger that is about to vanish would be noise.
    menu?.close(Component === 'button');
  };
  return (
    <Component
      ref={ref}
      role='menuitem'
      tabIndex={-1}
      aria-disabled={disabled || undefined}
      {...(Component === 'button' ? { type: 'button' } : {})}
      {...rest}
      onClick={handle}
      className={cx(itemClass(danger), disabled && 'opacity-50 cursor-not-allowed', className)}
    >
      {Icon && <Icon className='w-4 h-4 flex-shrink-0 opacity-70' aria-hidden='true' />}
      <span className='flex-1 min-w-0 truncate'>{children}</span>
    </Component>
  );
});

/** A toggle in a menu — stays open, so several can be flipped in one go. */
export function DropdownCheckboxItem({ checked, onCheckedChange, disabled, children }) {
  return (
    <button
      type='button'
      role='menuitemcheckbox'
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      tabIndex={-1}
      onClick={() => { if (!disabled) onCheckedChange(!checked); }}
      className={cx(itemClass(false), disabled && 'opacity-50 cursor-not-allowed')}
    >
      <span
        aria-hidden='true'
        className={cx(
          'w-4 h-4 flex-shrink-0 rounded border flex items-center justify-center',
          checked ? 'bg-brand-600 border-brand-600 text-white' : 'border-border bg-card'
        )}
      >
        {checked && (
          <svg viewBox='0 0 16 16' className='w-3 h-3' fill='none' stroke='currentColor' strokeWidth='2.5'>
            <path d='M3.5 8.5l3 3 6-7' strokeLinecap='round' strokeLinejoin='round' />
          </svg>
        )}
      </span>
      <span className='flex-1 min-w-0 truncate'>{children}</span>
    </button>
  );
}

export function DropdownSeparator() {
  return <div role='separator' className='my-1.5 h-px bg-border' />;
}

/** A non-interactive heading inside a menu — a user's name and role, a group title. */
export function DropdownLabel({ children, className }) {
  return <div className={cx('px-3 py-2 text-xs text-muted-foreground', className)}>{children}</div>;
}

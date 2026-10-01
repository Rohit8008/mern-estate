import { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { HiX } from 'react-icons/hi';
import { useDialog } from './useDialog';

function cx(...xs) { return xs.filter(Boolean).join(' '); }

const WIDTH = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
};

/**
 * A panel that slides in from the edge — a record's quick view, the
 * notification feed, a filter set — for when leaving the list would lose
 * someone's place in it. Same keyboard contract as Modal (see useDialog).
 *
 * Not for pages with a Leaflet map: its panes sit at z-index 400–800 and an
 * overlay over a map is the case CLAUDE.md asks to avoid.
 */
export default function Drawer({ open, onClose, title, description, children, footer, side = 'right', size = 'md' }) {
  const panelRef = useRef(null);
  const titleId = useId();
  const descId = useId();
  useDialog(open, onClose, panelRef);

  if (!open) return null;

  return createPortal(
    <div className='fixed inset-0 !mt-0 z-[1000] flex'>
      <div className='absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-overlay-in' onClick={onClose} aria-hidden='true' />
      <div
        ref={panelRef}
        role='dialog'
        aria-modal='true'
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cx(
          'relative h-full w-full flex flex-col bg-card text-card-foreground shadow-2xl focus:outline-none',
          'motion-reduce:animate-none',
          side === 'left' ? 'mr-auto animate-drawer-in-left border-r' : 'ml-auto animate-drawer-in-right border-l',
          'border-border',
          WIDTH[size]
        )}
      >
        <div className='flex items-start justify-between gap-3 px-5 py-4 border-b border-border flex-shrink-0'>
          <div className='min-w-0'>
            {title && <h2 id={titleId} className='text-base font-semibold text-foreground leading-tight'>{title}</h2>}
            {description && <p id={descId} className='text-sm text-muted-foreground mt-0.5'>{description}</p>}
          </div>
          <button
            type='button'
            onClick={onClose}
            aria-label='Close'
            className='flex-shrink-0 p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'
          >
            <HiX className='w-4 h-4' aria-hidden='true' />
          </button>
        </div>
        <div className='flex-1 min-h-0 overflow-y-auto'>{children}</div>
        {footer && (
          <div className='flex-shrink-0 px-5 py-4 border-t border-border flex items-center justify-end gap-3'>{footer}</div>
        )}
      </div>
    </div>,
    document.body
  );
}

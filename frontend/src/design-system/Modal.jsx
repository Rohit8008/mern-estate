import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { HiX } from 'react-icons/hi';

function cx(...xs) { return xs.filter(Boolean).join(' '); }

const SIZE_CLS = {
  sm:  'max-w-sm',
  md:  'max-w-md',
  lg:  'max-w-lg',
  xl:  'max-w-xl',
  '2xl': 'max-w-2xl',
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Every CRM modal goes through here, so its keyboard behaviour is everyone's.
 *
 * It closed on Escape and that was all: no dialog role, so a screen reader
 * announced nothing; focus stayed on the page behind, so Tab walked through
 * content the backdrop was hiding; and closing dropped focus at the top of the
 * document. Now it is announced as a dialog named by its title, focus moves
 * into it, Tab stays inside it, and focus returns to whatever opened it.
 */
export default function Modal({ open, onClose, title, description, children, footer, size = 'md', className }) {
  const panelRef = useRef(null);
  const titleId = useId();
  const descId = useId();
  // Held in a ref so a parent re-rendering with a new onClose does not re-run
  // the effect and yank focus back to the first field mid-typing.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;

    const handler = (e) => {
      if (e.key === 'Escape') { onCloseRef.current?.(); return; }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll(FOCUSABLE);
      if (!focusable.length) { e.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && (document.activeElement === first || !panelRef.current.contains(document.activeElement))) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', handler);

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    // First field if there is one, else the panel itself — not the close
    // button, which would make Enter dismiss the form someone came to fill.
    const panel = panelRef.current;
    const firstField = panel?.querySelector('input:not([disabled]), select:not([disabled]), textarea:not([disabled])');
    (firstField || panel)?.focus();

    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = overflow;
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus();
    };
  }, [open]);

  if (!open) return null;

  // Portalled to <body>: rendered in place, the modal sat inside the page's
  // stacking context, so the CRM top bar painted over its backdrop and header.
  return createPortal(
    <div className='fixed inset-0 !mt-0 z-[1000] flex items-center justify-center p-4'>
      {/* Backdrop: a mouse affordance only. Keyboard users have Escape and the
          close button; as a tab stop it was an unlabeled extra stop. */}
      <div
        className='absolute inset-0 bg-black/40 backdrop-blur-[2px]'
        onClick={onClose}
        aria-hidden='true'
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role='dialog'
        aria-modal='true'
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cx(
          // Capped at the viewport so the body scrolls. Without the cap a long form
          // grew past the screen and centring pushed its title and footer off both ends.
          'relative bg-white rounded-2xl shadow-2xl w-full flex flex-col overflow-hidden max-h-[calc(100dvh-2rem)] focus:outline-none',
          SIZE_CLS[size],
          className
        )}
      >
        {/* Header */}
        {(title || onClose) && (
          <div className='flex items-start justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0'>
            <div className='min-w-0 pr-3'>
              {title && <h2 id={titleId} className='text-base font-semibold text-slate-900 leading-tight'>{title}</h2>}
              {description && <p id={descId} className='text-sm text-slate-600 mt-0.5'>{description}</p>}
            </div>
            {onClose && (
              <button
                type='button'
                onClick={onClose}
                aria-label='Close'
                className='flex-shrink-0 p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'
              >
                <HiX className='w-4 h-4' aria-hidden='true' />
              </button>
            )}
          </div>
        )}

        {/* Body */}
        <div className='flex-1 min-h-0 overflow-y-auto px-6 py-5'>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className='flex-shrink-0 px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3'>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

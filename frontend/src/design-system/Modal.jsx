import { useEffect } from 'react';
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

export default function Modal({ open, onClose, title, description, children, footer, size = 'md', className }) {
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  // Portalled to <body>: rendered in place, the modal sat inside the page's
  // stacking context, so the CRM top bar painted over its backdrop and header.
  return createPortal(
    <div className='fixed inset-0 !mt-0 z-[1000] flex items-center justify-center p-4'>
      {/* Backdrop */}
      <button
        type='button'
        className='absolute inset-0 bg-black/40 backdrop-blur-[2px]'
        onClick={onClose}
        aria-label='Close modal'
      />

      {/* Panel */}
      <div className={cx(
        // Capped at the viewport so the body scrolls. Without the cap a long form
        // grew past the screen and centring pushed its title and footer off both ends.
        'relative bg-white rounded-2xl shadow-2xl w-full flex flex-col overflow-hidden max-h-[calc(100dvh-2rem)]',
        SIZE_CLS[size],
        className
      )}>
        {/* Header */}
        {(title || onClose) && (
          <div className='flex items-start justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0'>
            <div className='min-w-0 pr-3'>
              {title && <h2 className='text-base font-semibold text-slate-900 leading-tight'>{title}</h2>}
              {description && <p className='text-sm text-slate-500 mt-0.5'>{description}</p>}
            </div>
            {onClose && (
              <button
                type='button'
                onClick={onClose}
                className='flex-shrink-0 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors'
              >
                <HiX className='w-4 h-4' />
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

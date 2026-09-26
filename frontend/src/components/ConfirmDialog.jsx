import { useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';

export default function ConfirmDialog({
  open,
  title = 'Are you sure?',
  description = 'This action cannot be undone.',
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
}) {
  const { t } = useTranslation();
  // Per instance: a page can hold several of these, and a fixed id made every
  // dialog's aria-labelledby point at the first one's title.
  const titleId = useId();
  const descId = useId();
  const cancelRef = useRef(null);
  const confirmRef = useRef(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    const handleKey = (e) => {
      if (e.key === 'Escape') { onCancelRef.current?.(); return; }
      // Two buttons; Tab moves between them and nowhere else.
      if (e.key === 'Tab') {
        e.preventDefault();
        (document.activeElement === cancelRef.current ? confirmRef.current : cancelRef.current)?.focus();
      }
    };
    window.addEventListener('keydown', handleKey);
    // Cancel, not the destructive button, has focus first: Enter on an
    // unexpected dialog should never delete anything.
    cancelRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', handleKey);
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 !mt-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-sm p-6 flex flex-col gap-4">
        <div>
          <h2
            id={titleId}
            className="text-base font-semibold text-slate-900"
          >
            {title}
          </h2>
          {description && (
            <p id={descId} className="mt-1 text-sm text-slate-600">{description}</p>
          )}
        </div>

        <div className="flex gap-3 justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >{t('confirm.cancel')}</button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

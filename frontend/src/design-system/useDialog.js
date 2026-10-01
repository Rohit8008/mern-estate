import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The keyboard contract every overlay panel shares — Modal and Drawer both.
 *
 * Escape closes; Tab stays inside the panel; the page behind stops scrolling;
 * focus moves to the first field (or the panel itself) on open and goes back to
 * whatever opened it on close. It lived inside Modal alone, and a second panel
 * type would otherwise have grown its own, slightly different copy.
 */
export function useDialog(open, onClose, panelRef) {
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
  }, [open, panelRef]);
}

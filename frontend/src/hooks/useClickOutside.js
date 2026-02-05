import { useEffect } from 'react';

export function useClickOutside({ enabled, selector, onOutsideClick }) {
  useEffect(() => {
    if (!enabled) return;

    const handleClickOutside = (event) => {
      if (!event.target.closest(selector)) {
        onOutsideClick?.(event);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [enabled, selector, onOutsideClick]);
}

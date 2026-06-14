import { useEffect } from 'react';
import { useSearchContext } from '../contexts/SearchContext';

// Listens for Cmd+K (Mac) / Ctrl+K (Windows/Linux) anywhere in the app
// and toggles the global search modal.
export default function CmdKListener() {
  const { isOpen, open, close } = useSearchContext();

  useEffect(() => {
    const handleKeyDown = (e) => {
      const isMac  = navigator.platform.toUpperCase().includes('MAC');
      const isCombo = isMac ? e.metaKey && e.key === 'k' : e.ctrlKey && e.key === 'k';

      if (!isCombo) return;
      e.preventDefault();
      isOpen ? close() : open();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, open, close]);

  return null;
}

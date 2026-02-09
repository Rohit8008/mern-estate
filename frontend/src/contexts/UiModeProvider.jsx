import { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';

import { UiModeContext } from './uiModeContext';

const STORAGE_KEY = 'app:uiMode';

export function UiModeProvider({ children }) {
  const [mode, setMode] = useState('minimal');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      if (parsed?.mode === 'minimal' || parsed?.mode === 'legacy') {
        setMode(parsed.mode);
      }
    } catch (error) {
      console.error(error);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode }));
    } catch (error) {
      console.error(error);
    }

    try {
      document.documentElement.dataset.ui = mode;
    } catch (_) {}
  }, [mode]);

  const setUiMode = useCallback((next) => {
    setMode(next);
  }, []);

  const value = useMemo(
    () => ({
      mode,
      isMinimal: mode === 'minimal',
      setUiMode,
      toggleMode: () => setMode((m) => (m === 'minimal' ? 'legacy' : 'minimal')),
    }),
    [mode, setUiMode]
  );

  return <UiModeContext.Provider value={value}>{children}</UiModeContext.Provider>;
}

UiModeProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

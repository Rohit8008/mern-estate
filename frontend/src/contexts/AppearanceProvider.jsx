import { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';

import { AppearanceContext } from './appearanceContext';
import { applyCompactClass, applyThemeClass, getSystemTheme } from './appearanceUtils';

const STORAGE_KEY = 'app:appearance';

export function AppearanceProvider({ children }) {
  const [themePreference, setThemePreference] = useState('light');
  const [compactMode, setCompactMode] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      if (parsed?.theme) setThemePreference(parsed.theme);
      if (typeof parsed?.compactMode === 'boolean') setCompactMode(parsed.compactMode);
    } catch (error) {
      console.error(error);
    }
  }, []);

  const resolvedTheme = themePreference === 'system' ? getSystemTheme() : themePreference;

  useEffect(() => {
    applyThemeClass(resolvedTheme);
    applyCompactClass(compactMode);

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: themePreference, compactMode }));
    } catch (error) {
      console.error(error);
    }
  }, [compactMode, resolvedTheme, themePreference]);

  useEffect(() => {
    if (themePreference !== 'system') return;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyThemeClass(getSystemTheme());

    if (media.addEventListener) media.addEventListener('change', onChange);
    else media.addListener(onChange);

    return () => {
      if (media.removeEventListener) media.removeEventListener('change', onChange);
      else media.removeListener(onChange);
    };
  }, [themePreference]);

  const setTheme = useCallback((pref) => {
    setThemePreference(pref);
  }, []);

  const value = useMemo(
    () => ({
      themePreference,
      resolvedTheme,
      compactMode,
      setTheme,
      setCompactMode,
    }),
    [compactMode, resolvedTheme, setTheme, themePreference]
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

AppearanceProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

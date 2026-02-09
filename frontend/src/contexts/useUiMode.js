import { useContext } from 'react';

import { UiModeContext } from './uiModeContext';

export function useUiMode() {
  const ctx = useContext(UiModeContext);
  if (!ctx) throw new Error('useUiMode must be used within a UiModeProvider');
  return ctx;
}

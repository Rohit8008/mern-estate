import { useContext } from 'react';

import { AppearanceContext } from './appearanceContext';

export function useAppearance() {
  const ctx = useContext(AppearanceContext);
  if (!ctx) throw new Error('useAppearance must be used within an AppearanceProvider');
  return ctx;
}

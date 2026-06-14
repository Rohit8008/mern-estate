export function getSystemTheme() {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyThemeClass(theme) {
  const root = document.documentElement;
  // Add transition class for smooth switch
  root.classList.add('theme-transitioning');
  root.classList.remove('dark');
  if (theme === 'dark') root.classList.add('dark');
  // Remove transition class after animation completes
  const cleanup = setTimeout(() => root.classList.remove('theme-transitioning'), 300);
  return cleanup;
}

export function applyCompactClass(compactMode) {
  const root = document.documentElement;
  if (compactMode) root.classList.add('compact');
  else root.classList.remove('compact');
}

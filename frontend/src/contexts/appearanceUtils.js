export function getSystemTheme() {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyThemeClass(theme) {
  const root = document.documentElement;
  root.classList.remove('dark');
  if (theme === 'dark') root.classList.add('dark');
}

export function applyCompactClass(compactMode) {
  const root = document.documentElement;
  if (compactMode) root.classList.add('compact');
  else root.classList.remove('compact');
}

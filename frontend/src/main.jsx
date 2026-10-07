import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { persistor, store } from './redux/store.js';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { TenantProvider } from './contexts/TenantProvider.jsx';
import { initSentry } from './utils/sentry.js';
// Side-effect import: initialises i18next before the first render, so no
// screen paints in English and then swaps.
import './i18n/index.js';

// Initialize error tracking before rendering
initSentry();

// A deploy renames the hashed JS files. A tab (or service worker) still on the
// previous build then asks for a chunk that no longer exists. Recover by
// dropping the stale caches and reloading once; the guard stops a loop if the
// file is genuinely missing.
function recoverFromStaleBuild() {
  try {
    const last = Number(sessionStorage.getItem('rv-stale-reload') || 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem('rv-stale-reload', String(Date.now()));
  } catch { /* storage blocked: still try once below */ }
  const reload = () => window.location.reload();
  const clear = async () => {
    try {
      const regs = (await navigator.serviceWorker?.getRegistrations?.()) || [];
      await Promise.all(regs.map((r) => r.unregister()));
      if (window.caches) await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
    } catch { /* reload anyway */ }
  };
  clear().then(reload, reload);
}
window.addEventListener('vite:preloadError', (e) => { e.preventDefault(); recoverFromStaleBuild(); });
window.addEventListener('unhandledrejection', (e) => {
  const msg = String(e.reason?.message || e.reason || '');
  if (/dynamically imported module|Importing a module script failed|error loading dynamically imported/i.test(msg)) {
    e.preventDefault();
    recoverFromStaleBuild();
  }
});

// Intercept fetch to prepend API URL for /api and /uploads paths in production
const API_BASE_URL = import.meta.env.VITE_API_URL || '';
if (API_BASE_URL) {
  const originalFetch = window.fetch;
  window.fetch = (url, options) => {
    if (typeof url === 'string' && (url.startsWith('/api') || url.startsWith('/uploads'))) {
      url = `${API_BASE_URL}${url}`;
    }
    return originalFetch(url, options);
  };
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <Provider store={store}>
    <PersistGate loading={null} persistor={persistor}>
      {/* Outside the router: the workspace's branding applies to the login
          screen and error pages too, not just to signed-in views. */}
      <TenantProvider>
        <App />
      </TenantProvider>
    </PersistGate>
  </Provider>
);

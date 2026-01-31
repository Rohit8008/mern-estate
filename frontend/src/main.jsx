import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { persistor, store } from './redux/store.js';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { initSentry } from './utils/sentry.js';

// Initialize error tracking before rendering
initSentry();

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
      <App />
    </PersistGate>
  </Provider>
);

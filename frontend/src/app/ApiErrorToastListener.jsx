import { useEffect } from 'react';
import { useNotification } from '../contexts/NotificationContext';

export default function ApiErrorToastListener() {
  const { showError } = useNotification();

  useEffect(() => {
    const handler = (event) => {
      const detail = event?.detail || {};
      const msg = detail.message || 'An error occurred';
      const code = detail.statusCode ? ` (code ${detail.statusCode})` : '';
      showError(`${msg}${code}`);
    };

    window.addEventListener('api-error', handler);
    return () => window.removeEventListener('api-error', handler);
  }, [showError]);

  return null;
}

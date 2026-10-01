import { useEffect } from 'react';
import { useNotification } from '../contexts/NotificationContext';

export default function ApiErrorToastListener() {
  const { showError } = useNotification();

  useEffect(() => {
    const handler = (event) => {
      const detail = event?.detail || {};
      // 401 is handled by the auth flow (redirect to sign-in)
      if (detail.statusCode === 401) return;
      const message = detail.message || 'An unexpected error occurred.';
      // A server fault is ours to find, and the request id is how: a short
      // reference the user can read out finds the exact log line.
      const ref = detail.statusCode >= 500 && detail.requestId ? ` (ref ${String(detail.requestId).slice(0, 8)})` : '';
      showError(`${message}${ref}`);
    };

    window.addEventListener('api-error', handler);
    return () => window.removeEventListener('api-error', handler);
  }, [showError]);

  return null;
}

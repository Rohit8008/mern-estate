import { useEffect } from 'react';
import { useNotification } from '../contexts/NotificationContext';

export default function ApiErrorToastListener() {
  const { showError } = useNotification();

  useEffect(() => {
    const handler = (event) => {
      const detail = event?.detail || {};
      // 401 is handled by the auth flow (redirect to sign-in)
      if (detail.statusCode === 401) return;
      showError(detail.message || 'An unexpected error occurred.');
    };

    window.addEventListener('api-error', handler);
    return () => window.removeEventListener('api-error', handler);
  }, [showError]);

  return null;
}

import { useEffect, useState } from 'react';

export function useUnreadCount() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const handler = (e) => {
      const n = Number(e?.detail?.unread) || 0;
      setUnread(n);
    };

    window.addEventListener('app:unread', handler);
    return () => window.removeEventListener('app:unread', handler);
  }, []);

  return unread;
}

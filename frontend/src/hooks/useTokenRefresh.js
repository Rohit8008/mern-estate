import { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { refreshAccessToken } from '../utils/http';

// Access token lifetime is 15 minutes. Only refresh on tab focus if the tab
// was hidden for long enough that the token might have expired.
const TOKEN_TTL_MS = 15 * 60 * 1000;

export const useTokenRefresh = () => {
  const { currentUser } = useSelector((state) => state.user);
  const hiddenAtRef = useRef(null);

  useEffect(() => {
    if (!currentUser) return;

    const handleVisibilityChange = () => {
      if (window.location.pathname.includes('/sign-in')) return;

      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
        return;
      }

      // Tab became visible — only refresh if away long enough to risk expiry
      const awayMs = hiddenAtRef.current ? Date.now() - hiddenAtRef.current : 0;
      hiddenAtRef.current = null;
      if (awayMs < TOKEN_TTL_MS * 0.8) return; // less than 12 min — skip

      refreshAccessToken(false).catch(() => {});
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [currentUser]);
};

import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { signOutUserSuccess } from '../redux/user/userSlice';
import { refreshAccessToken, parseJsonSafely } from '../utils/http';

export const useTokenRefresh = () => {
  const dispatch = useDispatch();
  const { currentUser } = useSelector((state) => state.user);
  const refreshIntervalRef = useRef(null);

  useEffect(() => {
    // Don't run token refresh on sign-in page
    if (window.location.pathname.includes('/sign-in')) {
      return;
    }

    if (!currentUser) {
      // Clear any existing refresh interval if user logs out
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
      return;
    }

    // Set up automatic token refresh every 10 minutes (before 15min expiry)
    refreshIntervalRef.current = setInterval(async () => {
      try {
        const refreshData = await refreshAccessToken(false); // Don't redirect on periodic refresh
        if (!refreshData) {
          // Refresh failed, but don't logout immediately
          // Let the user continue working until they make an API call
          console.warn('Periodic token refresh failed, but continuing...');
        }
      } catch (error) {
        console.error('Automatic token refresh failed:', error);
        // Don't logout on periodic refresh failures
      }
    }, 10 * 60 * 1000); // 10 minutes

    // Cleanup on unmount
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [currentUser, dispatch]);

  // Also refresh token on page visibility change (user comes back to tab)
  useEffect(() => {
    const handleVisibilityChange = async () => {
      // Don't run token refresh on sign-in page
      if (window.location.pathname.includes('/sign-in')) {
        return;
      }
      
      if (document.visibilityState === 'visible' && currentUser) {
        // Add a small delay to avoid immediate refresh when switching tabs quickly
        setTimeout(async () => {
          try {
            const refreshData = await refreshAccessToken(false);
            if (refreshData) {
              console.log('Token refreshed successfully on visibility change');
            } else {
              console.warn('Token refresh failed on visibility change, but continuing...');
            }
          } catch (error) {
            console.error('Token refresh on visibility change failed:', error);
            // Don't redirect on visibility change failures
          }
        }, 1000); // 1 second delay
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentUser]);
};

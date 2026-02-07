import { useEffect } from 'react';
import { useDispatch } from 'react-redux';

import { signInSuccess, signOutUserSuccess } from '../redux/user/userSlice';
import { apiClient } from '../utils/http';
import { useTokenRefresh } from '../hooks/useTokenRefresh';

export default function AuthBootstrap() {
  const dispatch = useDispatch();

  useTokenRefresh();

  useEffect(() => {
    (async () => {
      try {
        const data = await apiClient.get('/user/me');
        if (data && data._id) {
          dispatch(signInSuccess(data));
          return;
        }
        dispatch(signOutUserSuccess());
      } catch (error) {
        console.error('Auth bootstrap error:', error);
        dispatch(signOutUserSuccess());
      }
    })();
  }, [dispatch]);

  useEffect(() => {
    const handleAuthError = (event) => {
      if (event.detail?.type === 'AUTH_ERROR') {
        dispatch(signOutUserSuccess());
        localStorage.removeItem('persist:root');
        sessionStorage.clear();
        window.location.href = '/sign-in';
      }
    };

    window.addEventListener('auth-error', handleAuthError);
    return () => window.removeEventListener('auth-error', handleAuthError);
  }, [dispatch]);

  return null;
}

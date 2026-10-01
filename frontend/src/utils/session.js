import { apiClient, setUserSignedOut } from './http';
import { signOutUserStart, signOutUserSuccess } from '../redux/user/userSlice';

/**
 * Sign out and leave the app: revoke the session on the server, drop the
 * persisted Redux state, and do a full page load so nothing from this session
 * survives in memory.
 *
 * The local half runs even when the request fails — someone who pressed "Sign
 * out" on a flaky connection must not be left looking signed in.
 */
export async function signOutAndLeave(dispatch) {
  setUserSignedOut(true);
  try {
    dispatch(signOutUserStart());
    await apiClient.post('/auth/signout');
  } catch {
    // Fall through: the local session is cleared regardless.
  } finally {
    dispatch(signOutUserSuccess());
    localStorage.removeItem('persist:root');
    sessionStorage.clear();
    window.location.href = '/';
  }
}

import { useSelector } from 'react-redux';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useScreens } from '../hooks/useScreens';

/**
 * Role gate for admin-area routes, plus the same screen-catalogue check
 * PermissionRoute applies — so a workspace with, say, bulk import switched off
 * cannot reach /admin/import by typing it.
 */
export default function AdminRoute() {
  const { currentUser } = useSelector((state) => state.user);
  const { canSeePath, ready } = useScreens();
  const location = useLocation();

  if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'employee')) {
    return <Navigate to='/unauthorized' />;
  }

  if (!ready) return null;
  if (!canSeePath(location.pathname)) return <Navigate to='/unauthorized' replace />;

  return <Outlet />;
}

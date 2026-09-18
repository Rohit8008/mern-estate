import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { usePermissions } from '../contexts/PermissionsContext';
import { useScreens } from '../hooks/useScreens';
import { useTranslation } from 'react-i18next';

/**
 * Wraps a group of <Route> children behind a permission gate, and behind the
 * workspace's screen catalogue.
 *
 * Usage:
 *   <Route element={<PermissionRoute requires="viewClients" />}>
 *     <Route path="/clients" element={<Clients />} />
 *   </Route>
 *
 * If `requires` is omitted the route is accessible to any authenticated
 * admin/employee (role check only, no specific permission needed).
 *
 * The screen check is derived from the path rather than declared per route, so
 * turning a module off for a workspace hides it from the menu AND makes its URL
 * unreachable, without touching the route table. A hidden menu item that still
 * loads when you type the address is not a disabled feature — it is a feature
 * with a hidden door.
 *
 * Neither check is the security boundary. The API enforces access; this stops
 * the app from rendering a screen the workspace has not been given.
 */
export default function PermissionRoute({ requires }) {
  const { t } = useTranslation();
  const { currentUser } = useSelector((s) => s.user);
  const { can, ready } = usePermissions();
  const { canSeePath, ready: screensReady } = useScreens();
  const location = useLocation();

  if (!currentUser) return <Navigate to='/sign-in' replace />;

  // Wait until permissions AND the workspace catalogue have been resolved before
  // making any redirect decision. Without this, employees get sent to
  // /unauthorized on first render before the API call completes (old bug:
  // loading initialised as false with empty permissions).
  if (!ready || !screensReady) return null;

  if (!can(requires)) return <Navigate to='/unauthorized' replace />;

  if (!canSeePath(location.pathname)) return <Navigate to='/unauthorized' replace />;

  return <Outlet />;
}

import { Outlet, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { usePermissions } from '../contexts/PermissionsContext';

/**
 * Wraps a group of <Route> children behind a permission gate.
 *
 * Usage:
 *   <Route element={<PermissionRoute requires="viewClients" />}>
 *     <Route path="/clients" element={<Clients />} />
 *   </Route>
 *
 * If `requires` is omitted the route is accessible to any authenticated
 * admin/employee (role check only, no specific permission needed).
 */
export default function PermissionRoute({ requires }) {
  const { currentUser } = useSelector((s) => s.user);
  const { can, ready } = usePermissions();

  if (!currentUser) return <Navigate to='/sign-in' replace />;

  // Wait until permissions have been resolved before making any redirect decision.
  // Without this, employees get sent to /unauthorized on first render before the
  // API call completes (old bug: loading initialised as false with empty permissions).
  if (!ready) return null;

  if (!can(requires)) return <Navigate to='/unauthorized' replace />;

  return <Outlet />;
}

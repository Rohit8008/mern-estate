import { useSelector } from 'react-redux';
import { Outlet, Navigate } from 'react-router-dom';

export default function AdminRoute() {
  const { currentUser } = useSelector((state) => state.user);
  return currentUser && (currentUser.role === 'admin' || currentUser.role === 'employee') ? <Outlet /> : <Navigate to='/unauthorized' />;
}



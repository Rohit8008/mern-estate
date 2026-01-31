import { useSelector } from 'react-redux';
import { Outlet, Navigate } from 'react-router-dom';

export default function SellerRoute() {
  const { currentUser } = useSelector((state) => state.user);
  return currentUser && (currentUser.role === 'admin' || currentUser.role === 'employee' || currentUser.role === 'seller') ? <Outlet /> : <Navigate to='/unauthorized' />;
}

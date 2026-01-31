import { useSelector } from 'react-redux';
import { Navigate } from 'react-router-dom';
import { useBuyerView } from '../contexts/BuyerViewContext';

export default function BuyerRequirementsRoute({ children }) {
  const { currentUser } = useSelector((state) => state.user);
  const { isBuyerViewMode } = useBuyerView();

  console.log('BuyerRequirementsRoute - currentUser:', currentUser);
  console.log('BuyerRequirementsRoute - isBuyerViewMode:', isBuyerViewMode);

  // If user is not logged in, redirect to sign in
  if (!currentUser) {
    console.log('BuyerRequirementsRoute - No user, redirecting to sign-in');
    return <Navigate to="/sign-in" replace />;
  }

  // Allow access to buyer requirements for:
  // - Admin users (always)
  // - Employee users (always) 
  // - Seller users (always)
  // - Buyer users (when not in buyer view mode)
  
  // If user is a buyer and in buyer view mode, redirect to home
  if (currentUser.role === 'buyer' && isBuyerViewMode) {
    console.log('BuyerRequirementsRoute - Buyer in buyer view mode, redirecting to home');
    return <Navigate to="/" replace />;
  }

  console.log('BuyerRequirementsRoute - Allowing access to buyer requirements');
  return children;
}

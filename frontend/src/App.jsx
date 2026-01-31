import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useNotification } from './contexts/NotificationContext';
import Home from './pages/Home';
import SignIn from './pages/SignIn';
import SignUp from './pages/SignUp';
import Profile from './pages/Profile';
import Header from './components/Header';
import Footer from './components/Footer';
import PrivateRoute from './components/PrivateRoute';
import SellerRoute from './components/SellerRoute';
import CreateListing from './pages/CreateListing';
import UpdateListing from './pages/UpdateListing';
import Listing from './pages/Listing';
import Search from './pages/Search';
import Categories from './pages/Categories';
import CategoryListings from './pages/CategoryListings';
import AdminRoute from './components/AdminRoute';
import Admin from './pages/Admin';
import UserProfile from './pages/UserProfile';
import Messages from './pages/Messages';
import AdminCategoryFields from './pages/AdminCategoryFields';
import AdminImport from './pages/AdminImport';
import DynamicListings from './pages/DynamicListings';
import PasswordReset from './pages/PasswordReset';
import Unauthorized from './pages/Unauthorized';
import NotFound from './pages/NotFound';
import BuyerRequirements from './pages/BuyerRequirements';
import Clients from './pages/Clients';
import ClientDetail from './pages/ClientDetail';
import AdminDashboard from './pages/AdminDashboard';
import TeamDashboard from './pages/TeamDashboard';
import Analytics from './pages/Analytics';
import { signInSuccess, signOutUserSuccess } from './redux/user/userSlice';
import { parseJsonSafely, fetchWithRefresh } from './utils/http';
import { useTokenRefresh } from './hooks/useTokenRefresh';
import { BuyerViewProvider } from './contexts/BuyerViewContext';
import { NotificationProvider } from './contexts/NotificationContext';
import ErrorBoundary from './components/ErrorBoundary';
import DevDashboard from './components/DevDashboard';

export default function App() {
  return (
    <ErrorBoundary>
      <NotificationProvider>
        <BuyerViewProvider>
          <BrowserRouter>
            <AppContent />
          </BrowserRouter>
        </BuyerViewProvider>
      </NotificationProvider>
    </ErrorBoundary>
  );
}

function AppContent() {
  const location = useLocation();
  const { showError } = useNotification();
  
  // Pages where footer should not be shown
  const noFooterPages = ['/sign-in', '/unauthorized'];
  const showFooter = !noFooterPages.includes(location.pathname);
  
  return (
    <>
      <AuthBootstrap />
      {/* Global API error toast listener */}
      {(() => {
        // Hook into api-error events once
        // eslint-disable-next-line react-hooks/rules-of-hooks
        useEffect(() => {
          const handler = (event) => {
            const detail = event?.detail || {};
            const msg = detail.message || 'An error occurred';
            const code = detail.statusCode ? ` (code ${detail.statusCode})` : '';
            showError(`${msg}${code}`);
          };
          window.addEventListener('api-error', handler);
          return () => window.removeEventListener('api-error', handler);
        }, [showError]);
        return null;
      })()}
      <Header />
      <div className='pt-16'> {/* Add padding-top to account for fixed header */}
      <Routes>
      <Route path='/' element={<Home />} />
      <Route path='/sign-in' element={<div className='-mt-16'><SignIn /></div>} />
      <Route path='/sign-up' element={<div className='-mt-16'><SignUp /></div>} />
      {/* Sign up is disabled */}
      <Route path='/listing/:listingId' element={<Listing />} />
      <Route path='/unauthorized' element={<Unauthorized />} />
        <Route element={<PrivateRoute />}>
          <Route path='/search' element={<Search />} />
          <Route path='/categories' element={<Categories />} />
          <Route path='/category/:slug' element={<CategoryListings />} />
          <Route path='/dynamic-listings/:categorySlug' element={<DynamicListings />} />
          <Route path='/dashboard' element={<TeamDashboard />} />
          <Route path='/analytics' element={<Analytics />} />
          <Route path='/clients' element={<Clients />} />
          <Route path='/clients/:id' element={<ClientDetail />} />
        </Route>
        <Route path='/buyer-requirements' element={<BuyerRequirements />} />
      <Route path='/user/:userId' element={<UserProfile />} />
      <Route element={<PrivateRoute />}>
        <Route path='/messages' element={<Messages />} />
      </Route>
      <Route element={<AdminRoute />}>
        <Route path='/admin' element={<Admin />} />
        <Route path='/admin/dashboard' element={<AdminDashboard />} />
        <Route path='/admin/categories/:slug/fields' element={<AdminCategoryFields />} />
        <Route path='/admin/import' element={<AdminImport />} />
      </Route>

      <Route element={<PrivateRoute />}>
        <Route path='/profile' element={<Profile />} />
        <Route path='/password-reset' element={<PasswordReset />} />
      </Route>
      <Route element={<SellerRoute />}>
        <Route path='/create-listing' element={<CreateListing />} />
        <Route
          path='/update-listing/:listingId'
          element={<UpdateListing />}
        />
      </Route>
      <Route path='*' element={<NotFound />} />
      </Routes>
      </div>
      {showFooter && <Footer />}
      
      {/* Development Dashboard - Only show in development */}
      {/* {import.meta.env.DEV && <DevDashboard />} */}
    </>
  );
}

function AuthBootstrap() {
  const dispatch = useDispatch();

  // Set up automatic token refresh
  useTokenRefresh();

  useEffect(() => {
    (async () => {
      try {
        // Silent auth check - don't trigger error toasts for initial auth check
        const res = await fetch('/api/user/me', { credentials: 'include' });

        if (res.ok) {
          const data = await parseJsonSafely(res);
          if (data && data._id) {
            dispatch(signInSuccess(data));
            return;
          }
        }

        // User not logged in - this is normal, just ensure logged out state
        dispatch(signOutUserSuccess());
      } catch (error) {
        // Network error during initial check - silently log out
        console.error('Auth bootstrap error:', error);
        dispatch(signOutUserSuccess());
      }
    })();
  }, [dispatch]);

  // Global error handler for authentication failures
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

// Removed global CallListener and call UI

import { HiMenu, HiX } from 'react-icons/hi';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { useEffect, useState } from 'react';
import { signOutUserSuccess } from '../redux/user/userSlice';
import { useBuyerView } from '../contexts/BuyerViewContext';
import { useNotification } from '../contexts/NotificationContext';
import { fetchWithRefresh, handleApiResponse } from '../utils/http';
import { useClickOutside } from '../hooks/useClickOutside';
import { useScrollThreshold } from '../hooks/useScrollThreshold';
import { useUnreadCount } from '../hooks/useUnreadCount';
import DesktopNav from './header/DesktopNav';
import MobileMenu from './header/MobileMenu';
import UserMenu from './header/UserMenu';

export default function Header() {
  const { currentUser } = useSelector((state) => state.user);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const { isBuyerViewMode, toggleBuyerViewMode } = useBuyerView();
  const { showError, showSuccess } = useNotification();
  const unread = useUnreadCount();
  const isScrolled = useScrollThreshold(20);
  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };
 
  useClickOutside({
    enabled: showUserMenu,
    selector: '.user-menu',
    onOutsideClick: () => setShowUserMenu(false),
  });

  // Close menus on route change
  useEffect(() => {
    setMenuOpen(false);
    setShowUserMenu(false);
  }, [location.pathname]);

  const handleSignOut = async () => {
    try {
      // Call the signout API (GET)
      const res = await fetchWithRefresh('/api/auth/signout', { method: 'GET' });
      // Even if backend returns plain text, we only care about status
      if (!res.ok) {
        await handleApiResponse(res); // will throw and be caught
      }
      // Clear Redux state
      dispatch(signOutUserSuccess());
      
      // Clear any stored data
      localStorage.removeItem('persist:root');
      sessionStorage.clear();
      
      // Navigate to home
      navigate('/');
      try {
        showSuccess('Signed out');
      } catch (error) {
        console.error(error);
      }
    } catch (error) {
      console.error('Logout error:', error);
      // Even if API call fails, clear local state
      dispatch(signOutUserSuccess());
      localStorage.removeItem('persist:root');
      sessionStorage.clear();
      navigate('/');
      try {
        showError(error.message || 'Sign out failed');
      } catch (err) {
        console.error(err);
      }
    }
  };

  return (
    <>
      
      <header className={`${isScrolled ? 'bg-white/95 backdrop-blur-md shadow-lg' : 'bg-white/90 backdrop-blur-sm'} border-b border-gray-100/50 fixed top-0 left-0 right-0 z-40 transition-all duration-300`}>
        <div className='max-w-6xl mx-auto px-4'>
        <div className='flex items-center justify-between h-16'>
          {/* Logo */}
          <div className='flex items-center space-x-4'>
            <Link to='/' className='flex items-center space-x-3 group'>
              <div className='w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-105'>
                <span className='text-white font-bold text-lg'>R</span>
              </div>
              <span className='text-2xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors'>
                RealVista
              </span>
            </Link>
          </div>

          <DesktopNav currentUser={currentUser} isBuyerViewMode={isBuyerViewMode} isActive={isActive} />

          {/* User Actions */}
          <div className='flex items-center space-x-3'>
            {currentUser && (
              <Link 
                to='/messages' 
                className={`${isActive('/messages') ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'} px-3 py-2 rounded-lg font-medium transition-colors relative`}
              >
                Messages
                {unread > 0 && (
                  <span className='absolute -top-1 -right-1 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full'>{unread}</span>
                )}
              </Link>
            )}
            
            {(currentUser?.role === 'admin' || currentUser?.role === 'employee') && !isBuyerViewMode && (
              <Link 
                to='/admin' 
                className={`${isActive('/admin') ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'} px-3 py-2 rounded-lg font-medium transition-colors`}
              >
                {currentUser?.role === 'admin' ? 'Admin' : 'Employee'}
              </Link>
            )}


            <UserMenu
              currentUser={currentUser}
              unread={unread}
              showUserMenu={showUserMenu}
              setShowUserMenu={setShowUserMenu}
              isBuyerViewMode={isBuyerViewMode}
              toggleBuyerViewMode={toggleBuyerViewMode}
              onSignOut={handleSignOut}
            />

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className='lg:hidden p-3 rounded-xl text-gray-700 hover:bg-gray-100 transition-all duration-300 hover:shadow-md'
            >
              {menuOpen ? <HiX className='w-6 h-6' /> : <HiMenu className='w-6 h-6' />}
            </button>
          </div>
        </div>
      </div>
      <MobileMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        currentUser={currentUser}
        isBuyerViewMode={isBuyerViewMode}
        isActive={isActive}
        unread={unread}
      />
    </header>
    </>
  );
}

import { FaHome, FaUser, FaMapMarkerAlt, FaShieldAlt, FaHandshake, FaCog } from 'react-icons/fa';
import { HiMenu, HiX } from 'react-icons/hi';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { useEffect, useState } from 'react';
import { signOutUserSuccess } from '../redux/user/userSlice';
import { useBuyerView } from '../contexts/BuyerViewContext';
import HealthStatus from './HealthStatus';
import { useNotification } from '../contexts/NotificationContext';
import { fetchWithRefresh, handleApiResponse } from '../utils/http';

export default function Header() {
  const { currentUser } = useSelector((state) => state.user);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [isScrolled, setIsScrolled] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const { isBuyerViewMode, toggleBuyerViewMode } = useBuyerView();
  const { showError, showSuccess } = useNotification();
  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };
  useEffect(() => {
    const handler = (e) => {
      const n = Number(e?.detail?.unread) || 0;
      setUnread(n);
    };
    window.addEventListener('app:unread', handler);
    return () => window.removeEventListener('app:unread', handler);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showUserMenu && !event.target.closest('.user-menu')) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showUserMenu]);

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
      try { showSuccess('Signed out'); } catch (_) {}
    } catch (error) {
      console.error('Logout error:', error);
      // Even if API call fails, clear local state
      dispatch(signOutUserSuccess());
      localStorage.removeItem('persist:root');
      sessionStorage.clear();
      navigate('/');
      try { showError(error.message || 'Sign out failed'); } catch (_) {}
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
            
            {/* Health Status - Only show in development or for admins */}
            {(import.meta.env.DEV || currentUser?.role === 'admin') && (
              <HealthStatus showDetails={currentUser?.role === 'admin'} />
            )}
          </div>

          {/* Navigation Links */}
          <nav className='hidden lg:flex items-center space-x-1'>
            <Link 
              to='/search' 
              className={`${isActive('/search') ? 'bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 border border-blue-200' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'} px-4 py-2 rounded-xl font-semibold transition-all duration-200 hover:shadow-md`}
            >
              Properties
            </Link>
            {(currentUser?.role === 'admin' || currentUser?.role === 'employee' || currentUser?.role === 'seller') && !isBuyerViewMode && (
              <Link 
                to='/create-listing' 
                className={`${isActive('/create-listing') ? 'bg-gradient-to-r from-green-50 to-emerald-50 text-green-700 border border-green-200' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'} px-4 py-2 rounded-xl font-semibold transition-all duration-200 hover:shadow-md`}
              >
                Add Property
              </Link>
            )}
            {(currentUser?.role === 'admin' || currentUser?.role === 'employee') && !isBuyerViewMode && (
              <Link 
                to='/clients' 
                className={`${isActive('/clients') ? 'bg-gradient-to-r from-teal-50 to-emerald-50 text-emerald-700 border border-emerald-200' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'} px-4 py-2 rounded-xl font-semibold transition-all duration-200 hover:shadow-md`}
              >
                Clients
              </Link>
            )}
            {(currentUser?.role === 'admin' || currentUser?.role === 'employee') && !isBuyerViewMode && (
              <Link 
                to='/buyer-requirements' 
                className={`${isActive('/buyer-requirements') ? 'bg-gradient-to-r from-purple-50 to-violet-50 text-purple-700 border border-purple-200' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'} px-4 py-2 rounded-xl font-semibold transition-all duration-200 hover:shadow-md`}
              >
                Buyers
              </Link>
            )}
            {currentUser && (
              <Link 
                to='/categories' 
                className={`${isActive('/categories') ? 'bg-gradient-to-r from-orange-50 to-amber-50 text-orange-700 border border-orange-200' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'} px-4 py-2 rounded-xl font-semibold transition-all duration-200 hover:shadow-md`}
              >
                Categories
              </Link>
            )}
          </nav>

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


            {currentUser ? (
              <div className='relative user-menu'>
                <button 
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className='flex items-center space-x-2 hover:bg-gray-50 rounded-lg p-2 transition-colors'
                >
                  <img
                    className='w-8 h-8 rounded-full object-cover'
                    src={currentUser.avatar || 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png'}
                    alt='profile'
                  />
                  <span className='hidden sm:block text-sm font-medium text-gray-700'>{currentUser.username}</span>
                </button>
                
                {/* User Dropdown Menu */}
                {showUserMenu && (
                  <div className='absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-gray-200 py-2 z-50'>
                    <div className='px-4 py-3 border-b border-gray-100'>
                      <div className='flex items-center space-x-3'>
                        <img
                          className='w-10 h-10 rounded-full object-cover border-2 border-gray-200'
                          src={currentUser.avatar || 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png'}
                          alt='profile'
                        />
                        <div>
                          <div className='font-semibold text-gray-900'>{currentUser.username}</div>
                          <div className='text-sm text-gray-500'>{currentUser.email}</div>
                        </div>
                      </div>
                    </div>
                    <div className='py-2'>
                      <Link 
                        to='/profile' 
                        onClick={() => setShowUserMenu(false)}
                        className='flex items-center space-x-3 px-4 py-3 text-gray-700 hover:bg-gray-50 transition-colors'
                      >
                        <FaUser className='w-4 h-4' />
                        <span>Profile</span>
                      </Link>
                      <Link 
                        to='/messages' 
                        onClick={() => setShowUserMenu(false)}
                        className='flex items-center space-x-3 px-4 py-3 text-gray-700 hover:bg-gray-50 transition-colors'
                      >
                        <FaHandshake className='w-4 h-4' />
                        <span>Messages</span>
                        {unread > 0 && (
                          <span className='ml-auto bg-red-500 text-white text-xs px-2 py-1 rounded-full font-bold'>{unread}</span>
                        )}
                      </Link>
                      <Link 
                        to='/settings' 
                        onClick={() => setShowUserMenu(false)}
                        className='flex items-center space-x-3 px-4 py-3 text-gray-700 hover:bg-gray-50 transition-colors'
                      >
                        <FaCog className='w-4 h-4' />
                        <span>Settings</span>
                      </Link>
                      {/* Buyer View Mode Toggle for Employees */}
                      {currentUser?.role === 'employee' && (
                        <button
                          onClick={() => {
                            setShowUserMenu(false);
                            toggleBuyerViewMode();
                          }}
                          className={`flex items-center space-x-3 px-4 py-3 transition-colors w-full text-left ${
                            isBuyerViewMode 
                              ? 'text-orange-600 hover:bg-orange-50' 
                              : 'text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          <span>{isBuyerViewMode ? 'Exit Buyer View' : 'View as Buyer'}</span>
                        </button>
                      )}
                      
                      <div className='border-t border-gray-100 my-2'></div>
                      <button 
                        onClick={() => {
                          setShowUserMenu(false);
                          handleSignOut();
                        }}
                        className='flex items-center space-x-3 px-4 py-3 text-red-600 hover:bg-red-50 transition-colors w-full text-left'
                      >
                        <FaShieldAlt className='w-4 h-4' />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Link to='/sign-in' className='flex items-center space-x-3 group hover:bg-gray-50 rounded-xl p-2 transition-all duration-300'>
                <div className='w-10 h-10 bg-gradient-to-br from-gray-200 to-gray-300 rounded-full flex items-center justify-center shadow-lg'>
                  <span className='text-gray-600 text-sm font-bold'>?</span>
                </div>
                <span className='text-gray-700 hover:text-gray-900 transition-colors font-semibold hidden sm:inline'>Sign In</span>
              </Link>
            )}

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
      {/* Mobile Menu */}
      {menuOpen && (
        <div className='lg:hidden border-t border-gray-200 bg-white/95 backdrop-blur-md shadow-lg'>
          <div className='px-6 py-6 space-y-6'>
            {/* Mobile Navigation */}
            <nav className='space-y-3'>
              <Link 
                onClick={() => setMenuOpen(false)} 
                to='/' 
                className={`${isActive('/') ? 'bg-gradient-to-r from-blue-50 to-blue-100 text-blue-700 border-blue-300' : 'text-gray-700 hover:bg-gray-50'} flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all duration-300 border border-transparent`}
              >
                <FaHome className='w-5 h-5' />
                Home
              </Link>
              <Link 
                onClick={() => setMenuOpen(false)} 
                to='/search' 
                className={`${isActive('/search') ? 'bg-gradient-to-r from-blue-50 to-blue-100 text-blue-700 border-blue-300' : 'text-gray-700 hover:bg-gray-50'} flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all duration-300 border border-transparent`}
              >
                <FaHome className='w-5 h-5' />
                Properties
              </Link>
              {(currentUser?.role === 'admin' || currentUser?.role === 'employee' || currentUser?.role === 'seller') && !isBuyerViewMode && (
                <Link 
                  onClick={() => setMenuOpen(false)} 
                  to='/create-listing' 
                  className={`${isActive('/create-listing') ? 'bg-gradient-to-r from-green-50 to-green-100 text-green-700 border-green-300' : 'text-gray-700 hover:bg-gray-50'} flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all duration-300 border border-transparent`}
                >
                  <FaHome className='w-5 h-5' />
                  Add Property
                </Link>
              )}
              {(currentUser?.role === 'admin' || currentUser?.role === 'employee') && !isBuyerViewMode && (
                <Link 
                  onClick={() => setMenuOpen(false)} 
                  to='/clients' 
                  className={`${isActive('/clients') ? 'bg-gradient-to-r from-teal-50 to-teal-100 text-teal-700 border-teal-300' : 'text-gray-700 hover:bg-gray-50'} flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all duration-300 border border-transparent`}
                >
                  <FaUser className='w-5 h-5' />
                  Clients
                </Link>
              )}
              {(currentUser?.role === 'admin' || currentUser?.role === 'employee') && !isBuyerViewMode && (
                <Link 
                  onClick={() => setMenuOpen(false)} 
                  to='/buyer-requirements' 
                  className={`${isActive('/buyer-requirements') ? 'bg-gradient-to-r from-purple-50 to-purple-100 text-purple-700 border-purple-300' : 'text-gray-700 hover:bg-gray-50'} flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all duration-300 border border-transparent`}
                >
                  <FaUser className='w-5 h-5' />
                  Buyers
                </Link>
              )}
              {currentUser && (
                <Link 
                  onClick={() => setMenuOpen(false)} 
                  to='/categories' 
                  className={`${isActive('/categories') ? 'bg-gradient-to-r from-orange-50 to-orange-100 text-orange-700 border-orange-300' : 'text-gray-700 hover:bg-gray-50'} flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all duration-300 border border-transparent`}
                >
                  <FaMapMarkerAlt className='w-5 h-5' />
                  Categories
                </Link>
              )}
              {currentUser && (
                <Link 
                  onClick={() => setMenuOpen(false)} 
                  to='/messages' 
                  className={`${isActive('/messages') ? 'bg-gradient-to-r from-blue-50 to-blue-100 text-blue-700 border-blue-300' : 'text-gray-700 hover:bg-gray-50'} flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all duration-300 border border-transparent relative`}
                >
                  <FaHandshake className='w-5 h-5' />
                  Messages
                  {unread > 0 && (
                    <span className='ml-auto bg-red-500 text-white text-xs px-2 py-1 rounded-full font-bold animate-pulse'>{unread}</span>
                  )}
                </Link>
              )}
              {(currentUser?.role === 'admin' || currentUser?.role === 'employee') && !isBuyerViewMode && (
                <Link 
                  onClick={() => setMenuOpen(false)} 
                  to='/admin' 
                  className={`${isActive('/admin') ? 'bg-gradient-to-r from-red-50 to-red-100 text-red-700 border-red-300' : 'text-gray-700 hover:bg-gray-50'} flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all duration-300 border border-transparent`}
                >
                  <FaShieldAlt className='w-5 h-5' />
                  {currentUser?.role === 'admin' ? 'Admin' : 'Employee'}
                </Link>
              )}
            </nav>
          </div>
        </div>
      )}
    </header>
    </>
  );
}

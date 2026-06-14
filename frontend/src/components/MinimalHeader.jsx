import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { FaBuilding } from 'react-icons/fa';
import {
  HiMenu,
  HiX,
  HiSearch,
  HiViewGrid,
  HiHome,
  HiChevronRight,
} from 'react-icons/hi';
import { normalizeImageUrl } from '../utils/http';

function classNames(...xs) {
  return xs.filter(Boolean).join(' ');
}

export default function MinimalHeader() {
  const location = useLocation();
  const { currentUser } = useSelector((state) => state.user);
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const isCrmUser = currentUser?.role === 'admin' || currentUser?.role === 'employee';
  const username = currentUser?.username || currentUser?.name || 'User';
  const initials = username.slice(0, 2).toUpperCase();

  return (
    <header className='bg-white border-b border-slate-200 fixed top-0 left-0 right-0 z-40'>
      <div className='max-w-7xl mx-auto px-4 sm:px-6'>
        <div className='h-14 flex items-center justify-between gap-4'>

          {/* Logo */}
          <Link to='/' className='flex items-center gap-2.5 flex-shrink-0 group'>
            <div className='w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-600 to-blue-500 shadow flex items-center justify-center'>
              <FaBuilding className='w-4 h-4 text-white' />
            </div>
            <span className='text-base font-bold text-slate-900 group-hover:text-indigo-700 transition-colors'>
              Real Vista
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className='hidden md:flex items-center gap-1 flex-1 justify-center'>
            <Link
              to='/'
              className={classNames(
                'flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors',
                isActive('/')
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              )}
            >
              <HiHome className='w-4 h-4' />
              Home
            </Link>

            {currentUser && (
              <Link
                to='/search'
                className={classNames(
                  'flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors',
                  isActive('/search')
                    ? 'bg-slate-100 text-slate-900'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                )}
              >
                <HiSearch className='w-4 h-4' />
                Search
              </Link>
            )}

            {/* CRM shortcut for admin/employee */}
            {isCrmUser && (
              <Link
                to='/dashboard'
                className={classNames(
                  'flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors',
                  isActive('/dashboard')
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                )}
              >
                <HiViewGrid className='w-4 h-4' />
                Dashboard
              </Link>
            )}
          </nav>

          {/* Right actions */}
          <div className='flex items-center gap-2 flex-shrink-0'>
            {currentUser ? (
              <Link
                to={isCrmUser ? '/dashboard' : '/profile'}
                className='flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors group'
              >
                <div className='w-6 h-6 rounded-full overflow-hidden bg-indigo-100 flex items-center justify-center flex-shrink-0'>
                  {currentUser.avatar ? (
                    <img
                      src={normalizeImageUrl(currentUser.avatar)}
                      alt={username}
                      className='w-full h-full object-cover'
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  ) : (
                    <span className='text-[10px] font-bold text-indigo-700'>{initials}</span>
                  )}
                </div>
                <span className='text-sm font-medium text-slate-700 hidden sm:block'>{username.split(' ')[0]}</span>
                {isCrmUser && (
                  <span className='hidden sm:flex items-center gap-1 text-xs font-semibold text-indigo-600'>
                    CRM
                    <HiChevronRight className='w-3 h-3' />
                  </span>
                )}
              </Link>
            ) : (
              <Link
                to='/sign-in'
                className='px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors'
              >
                Sign In
              </Link>
            )}

            {/* Mobile menu toggle */}
            <button
              type='button'
              onClick={() => setMenuOpen((o) => !o)}
              className='md:hidden p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors'
              aria-label='Toggle menu'
            >
              {menuOpen ? <HiX className='w-5 h-5' /> : <HiMenu className='w-5 h-5' />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className='md:hidden border-t border-slate-200 bg-white px-4 py-4 space-y-1'>
          <Link
            to='/'
            onClick={() => setMenuOpen(false)}
            className={classNames(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
              isActive('/') ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'
            )}
          >
            <HiHome className='w-4 h-4' />
            Home
          </Link>
          {currentUser && (
            <Link
              to='/search'
              onClick={() => setMenuOpen(false)}
              className={classNames(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                isActive('/search') ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'
              )}
            >
              <HiSearch className='w-4 h-4' />
              Search Properties
            </Link>
          )}
          {isCrmUser && (
            <Link
              to='/dashboard'
              onClick={() => setMenuOpen(false)}
              className={classNames(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors',
                isActive('/dashboard') ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'
              )}
            >
              <HiViewGrid className='w-4 h-4' />
              Open Dashboard
            </Link>
          )}
          {currentUser && !isCrmUser && (
            <Link
              to='/profile'
              onClick={() => setMenuOpen(false)}
              className='flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors'
            >
              Profile
            </Link>
          )}
          {!currentUser && (
            <div className='pt-2'>
              <Link
                to='/sign-in'
                onClick={() => setMenuOpen(false)}
                className='flex items-center justify-center w-full px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors'
              >
                Sign In
              </Link>
            </div>
          )}
        </div>
      )}
    </header>
  );
}

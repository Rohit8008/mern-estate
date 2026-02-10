import { useMemo, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { HiMenuAlt2, HiOutlineBell, HiOutlineSearch, HiX } from 'react-icons/hi';
import { FaChartLine, FaClipboardList, FaCalendarAlt, FaUsers, FaUser } from 'react-icons/fa';

import { useBuyerView } from '../contexts/BuyerViewContext';

function classNames(...xs) {
  return xs.filter(Boolean).join(' ');
}

export default function CrmShell() {
  const location = useLocation();
  const { currentUser } = useSelector((state) => state.user);
  const { isBuyerViewMode } = useBuyerView();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [q, setQ] = useState('');

  const canAccess = useMemo(() => {
    if (!currentUser) return false;
    if (isBuyerViewMode) return false;
    return currentUser.role === 'admin' || currentUser.role === 'employee';
  }, [currentUser, isBuyerViewMode]);

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const nav = [
    { to: '/dashboard', label: 'Dashboard', icon: FaChartLine, active: isActive('/dashboard') },
    { to: '/properties', label: 'Properties', icon: FaClipboardList, active: isActive('/properties') },
    { to: '/contacts', label: 'Contacts', icon: FaUsers, active: isActive('/contacts') },
    { to: '/clients', label: 'Clients', icon: FaUser, active: isActive('/clients') && !isActive('/contacts') },
    { to: '/deals', label: 'Pipeline', icon: FaChartLine, active: isActive('/deals') },
    { to: '/tasks', label: 'Tasks', icon: FaCalendarAlt, active: isActive('/tasks') },
    { to: '/calendar', label: 'Calendar', icon: FaCalendarAlt, active: isActive('/calendar') },
    { to: '/buyer-requirements', label: 'Buyers', icon: FaUser, active: isActive('/buyer-requirements') },
  ];

  if (!canAccess) return <Outlet />;

  return (
    <div className='min-h-screen bg-slate-50'>
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <button
          type='button'
          onClick={() => setSidebarOpen(false)}
          className='fixed inset-0 bg-black/30 z-40 lg:hidden'
          aria-label='Close sidebar'
        />
      )}

      {/* Sidebar */}
      <aside
        className={classNames(
          'fixed top-0 left-0 h-full w-72 bg-white border-r border-slate-200 z-50 lg:z-30',
          'transform transition-transform duration-200',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className='h-16 px-4 flex items-center justify-between border-b border-slate-200'>
          <Link to='/dashboard' className='flex items-center gap-3'>
            <div className='w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-600 shadow-md flex items-center justify-center'>
              <span className='text-white font-bold'>R</span>
            </div>
            <div>
              <div className='text-sm font-bold text-slate-900 leading-tight'>Real estate CRM</div>
              <div className='text-[11px] text-slate-500 leading-tight'>Workspace</div>
            </div>
          </Link>
          <button
            type='button'
            onClick={() => setSidebarOpen(false)}
            className='lg:hidden p-2 rounded-xl hover:bg-slate-100'
            aria-label='Close sidebar'
          >
            <HiX className='w-5 h-5 text-slate-700' />
          </button>
        </div>

        <div className='p-3'>
          <div className='px-2 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide'>CRM</div>
          <nav className='space-y-1'>
            {nav.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={classNames(
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors',
                    item.active
                      ? 'bg-slate-100 text-slate-900'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  )}
                >
                  <Icon className={classNames('w-4 h-4', item.active ? 'text-indigo-600' : 'text-slate-400')} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className='absolute bottom-0 left-0 right-0 border-t border-slate-200 bg-white p-3'>
          <div className='flex items-center gap-3 px-2 py-2'>
            <div className='w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-slate-700 font-bold'>
              {(currentUser?.username || currentUser?.name || 'U').slice(0, 1).toUpperCase()}
            </div>
            <div className='min-w-0'>
              <div className='text-sm font-semibold text-slate-900 truncate'>
                {currentUser?.username || currentUser?.name || 'User'}
              </div>
              <div className='text-[11px] text-slate-500 truncate capitalize'>
                {currentUser?.role || ''}
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className='lg:pl-72'>
        {/* Top bar */}
        <div className='h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-20'>
          <div className='flex items-center gap-2 min-w-0'>
            <button
              type='button'
              className='lg:hidden p-2 rounded-xl hover:bg-slate-100'
              onClick={() => setSidebarOpen(true)}
              aria-label='Open sidebar'
            >
              <HiMenuAlt2 className='w-6 h-6 text-slate-700' />
            </button>

            <div className='hidden md:flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 w-[420px] max-w-full'>
              <HiOutlineSearch className='w-5 h-5 text-slate-400' />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder='Search (clients, deals, tasks)'
                className='bg-transparent outline-none text-sm w-full text-slate-700 placeholder:text-slate-400'
              />
            </div>
          </div>

          <div className='flex items-center gap-2'>
            <button
              type='button'
              className='p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50'
              aria-label='Notifications'
            >
              <HiOutlineBell className='w-5 h-5 text-slate-600' />
            </button>
            <Link
              to='/messages'
              className='px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700'
            >
              Messages
            </Link>
            <Link
              to='/profile'
              className='px-3 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 text-sm font-semibold'
            >
              Profile
            </Link>
          </div>
        </div>

        {/* Content */}
        <div className='px-4 lg:px-6 py-6'>
          <Outlet />
        </div>
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  HiMenuAlt2,
  HiOutlineBell,
  HiOutlineSearch,
  HiX,
  HiChevronRight,
} from 'react-icons/hi';
import {
  FaChartLine,
  FaClipboardList,
  FaCalendarAlt,
  FaUsers,
  FaUser,
  FaChartPie,
  FaMoneyBillWave,
  FaFileAlt,
  FaBuilding,
  FaThList,
  FaPlusCircle,
  FaShieldAlt,
} from 'react-icons/fa';

import { useBuyerView } from '../contexts/BuyerViewContext';
import { normalizeImageUrl } from '../utils/http';

function classNames(...xs) {
  return xs.filter(Boolean).join(' ');
}

const ROLE_BADGE = {
  admin: 'bg-rose-100 text-rose-700',
  employee: 'bg-indigo-100 text-indigo-700',
  seller: 'bg-amber-100 text-amber-700',
};

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

  const crmNav = [
    { to: '/properties', label: 'Properties', icon: FaBuilding, active: isActive('/properties') },
    {
      to: '/categories',
      label: 'Categories',
      icon: FaThList,
      active: isActive('/categories') || isActive('/category/') || isActive('/dynamic-listings/'),
    },
    { to: '/create-listing', label: 'Create Listing', icon: FaPlusCircle, active: isActive('/create-listing') },
    { to: '/contacts', label: 'Contacts', icon: FaUsers, active: isActive('/contacts') },
    { to: '/tasks', label: 'Tasks', icon: FaClipboardList, active: isActive('/tasks') },
    { to: '/portfolio', label: 'Portfolio Dashboard', icon: FaChartPie, active: isActive('/portfolio') },
    { to: '/dashboard', label: 'Agency Dashboard', icon: FaChartLine, active: isActive('/dashboard') },
  ];

  const managementNav = [
    { to: '/transactions', label: 'Transactions', icon: FaMoneyBillWave, active: isActive('/transactions') },
    { to: '/client-reports', label: 'Client Reports', icon: FaFileAlt, active: isActive('/client-reports') },
    { to: '/deals', label: 'Pipeline', icon: FaChartLine, active: isActive('/deals') },
    { to: '/clients', label: 'Clients', icon: FaUser, active: isActive('/clients') && !isActive('/contacts') },
    { to: '/calendar', label: 'Calendar', icon: FaCalendarAlt, active: isActive('/calendar') },
    { to: '/buyer-requirements', label: 'Buyers', icon: FaUser, active: isActive('/buyer-requirements') },
  ];

  const username = currentUser?.username || currentUser?.name || 'User';
  const initials = username.slice(0, 2).toUpperCase();
  const roleBadge = ROLE_BADGE[currentUser?.role] || 'bg-slate-100 text-slate-600';

  if (!canAccess) return <Outlet />;

  const NavItem = ({ item }) => {
    const Icon = item.icon;
    return (
      <Link
        key={item.to}
        to={item.to}
        onClick={() => setSidebarOpen(false)}
        className={classNames(
          'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 relative group',
          item.active
            ? 'bg-indigo-50 text-indigo-700'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
        )}
      >
        {/* Active left bar */}
        {item.active && (
          <span className='absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-indigo-600 rounded-r-full' />
        )}
        <Icon
          className={classNames(
            'w-4 h-4 flex-shrink-0 transition-colors',
            item.active ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600'
          )}
        />
        <span className='flex-1 truncate'>{item.label}</span>
        {item.active && <HiChevronRight className='w-3.5 h-3.5 text-indigo-400 flex-shrink-0' />}
      </Link>
    );
  };

  return (
    <div className='min-h-screen bg-slate-50'>
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <button
          type='button'
          onClick={() => setSidebarOpen(false)}
          className='fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden'
          aria-label='Close sidebar'
        />
      )}

      {/* Sidebar */}
      <aside
        className={classNames(
          'fixed top-0 left-0 h-full w-64 bg-white border-r border-slate-200 z-50 lg:z-30 flex flex-col',
          'transform transition-transform duration-200 ease-in-out',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Logo / Brand */}
        <div className='h-16 px-4 flex items-center justify-between border-b border-slate-100 flex-shrink-0'>
          <Link to='/dashboard' className='flex items-center gap-2.5 min-w-0' onClick={() => setSidebarOpen(false)}>
            <div className='w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-600 to-blue-500 shadow flex items-center justify-center flex-shrink-0'>
              <FaBuilding className='w-4 h-4 text-white' />
            </div>
            <div className='min-w-0'>
              <div className='text-sm font-bold text-slate-900 leading-tight truncate'>Real Estate CRM</div>
              <div className='text-[10px] text-slate-400 leading-tight font-medium tracking-wide uppercase'>Workspace</div>
            </div>
          </Link>
          <button
            type='button'
            onClick={() => setSidebarOpen(false)}
            className='lg:hidden p-1.5 rounded-lg hover:bg-slate-100 text-slate-500'
            aria-label='Close sidebar'
          >
            <HiX className='w-4 h-4' />
          </button>
        </div>

        {/* Navigation */}
        <div className='flex-1 overflow-y-auto px-3 py-4 space-y-5'>
          {/* CRM Section */}
          <div>
            <div className='px-2 mb-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest'>CRM</div>
            <nav className='space-y-0.5'>
              {crmNav.map((item) => (
                <NavItem key={item.to} item={item} />
              ))}
            </nav>
          </div>

          {/* Divider */}
          <div className='border-t border-slate-100' />

          {/* Management Section */}
          <div>
            <div className='px-2 mb-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest'>Management</div>
            <nav className='space-y-0.5'>
              {managementNav.map((item) => (
                <NavItem key={item.to} item={item} />
              ))}
            </nav>
          </div>

          {/* Admin link */}
          {currentUser?.role === 'admin' && (
            <>
              <div className='border-t border-slate-100' />
              <div>
                <div className='px-2 mb-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest'>Admin</div>
                <nav className='space-y-0.5'>
                  <NavItem
                    item={{
                      to: '/admin',
                      label: 'Admin Panel',
                      icon: FaShieldAlt,
                      active: isActive('/admin'),
                    }}
                  />
                </nav>
              </div>
            </>
          )}
        </div>

        {/* User footer */}
        <div className='flex-shrink-0 border-t border-slate-100 p-3'>
          <Link
            to='/profile'
            onClick={() => setSidebarOpen(false)}
            className='flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-slate-50 transition-colors group'
          >
            <div className='w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-indigo-100 flex items-center justify-center'>
              {currentUser?.avatar ? (
                <img
                  src={normalizeImageUrl(currentUser.avatar)}
                  alt={username}
                  className='w-full h-full object-cover'
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              ) : (
                <span className='text-xs font-bold text-indigo-700'>{initials}</span>
              )}
            </div>
            <div className='min-w-0 flex-1'>
              <div className='text-sm font-semibold text-slate-800 truncate leading-tight'>{username}</div>
              <span className={classNames('inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize leading-tight mt-0.5', roleBadge)}>
                {currentUser?.role || 'user'}
              </span>
            </div>
            <HiChevronRight className='w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0' />
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <div className='lg:pl-64'>
        {/* Top bar */}
        <div className='h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-20 gap-4'>
          <div className='flex items-center gap-3 min-w-0 flex-1'>
            <button
              type='button'
              className='lg:hidden p-2 rounded-xl hover:bg-slate-100 flex-shrink-0'
              onClick={() => setSidebarOpen(true)}
              aria-label='Open sidebar'
            >
              <HiMenuAlt2 className='w-5 h-5 text-slate-700' />
            </button>

            <div className='hidden md:flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 max-w-sm w-full'>
              <HiOutlineSearch className='w-4 h-4 text-slate-400 flex-shrink-0' />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder='Search clients, deals, tasks…'
                className='bg-transparent outline-none text-sm w-full text-slate-700 placeholder:text-slate-400'
              />
            </div>
          </div>

          <div className='flex items-center gap-2 flex-shrink-0'>
            <button
              type='button'
              className='relative p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors'
              aria-label='Notifications'
            >
              <HiOutlineBell className='w-5 h-5 text-slate-600' />
              <span className='absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full border-2 border-white' />
            </button>

            <Link
              to='/messages'
              className='hidden sm:flex items-center px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-medium text-slate-700 transition-colors'
            >
              Messages
            </Link>

            <Link
              to='/profile'
              className='flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 text-white hover:bg-slate-800 text-sm font-semibold transition-colors'
            >
              <div className='w-5 h-5 rounded-full overflow-hidden bg-indigo-400 flex items-center justify-center flex-shrink-0'>
                {currentUser?.avatar ? (
                  <img
                    src={normalizeImageUrl(currentUser.avatar)}
                    alt={username}
                    className='w-full h-full object-cover'
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                ) : (
                  <span className='text-[9px] font-bold text-white'>{initials}</span>
                )}
              </div>
              <span className='hidden sm:block'>{username.split(' ')[0]}</span>
            </Link>
          </div>
        </div>

        {/* Page content */}
        <div className='px-4 lg:px-6 py-6'>
          <Outlet />
        </div>
      </div>
    </div>
  );
}

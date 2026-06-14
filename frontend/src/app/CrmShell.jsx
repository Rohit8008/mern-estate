import { useMemo, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  HiMenuAlt2, HiX, HiOutlineSearch, HiOutlineBell,
  HiOutlineHome, HiOutlineOfficeBuilding, HiOutlineTag,
  HiOutlinePlus, HiOutlineUsers, HiOutlineClipboardList,
  HiOutlineChartBar, HiOutlineCurrencyDollar,
  HiOutlineDocumentReport, HiOutlineViewBoards, HiOutlineCalendar,
  HiOutlineUserGroup, HiOutlineShieldCheck, HiOutlineChat,
  HiOutlineUser, HiOutlineLogout, HiChevronDown,
  HiOutlineCollection, HiOutlineCog,
} from 'react-icons/hi';
import { HiOutlineSun, HiOutlineMoon } from 'react-icons/hi2';
import { useBuyerView } from '../contexts/BuyerViewContext';
import { useAppearance } from '../contexts/useAppearance';
import { useNotification } from '../contexts/NotificationContext';
import { usePermissions } from '../contexts/PermissionsContext';
import { useSearchContext } from '../contexts/SearchContext';
import { normalizeImageUrl } from '../utils/http';
import OfflineIndicator from '../components/OfflineIndicator';

function cx(...xs) { return xs.filter(Boolean).join(' '); }

const NOTIF_ICONS = {
  success: <span className='w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0 mt-1' />,
  error:   <span className='w-2 h-2 rounded-full bg-rose-500 flex-shrink-0 mt-1' />,
  warning: <span className='w-2 h-2 rounded-full bg-amber-500 flex-shrink-0 mt-1' />,
  info:    <span className='w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1' />,
};

const ROLE_COLORS = {
  admin:    'bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/30',
  employee: 'bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/30',
  seller:   'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30',
};

const PAGE_TITLES = {
  '/dashboard':         'Dashboard',
  '/analytics':         'Analytics',
  '/properties':        'Properties',
  '/create-listing':    'Add Property',
  '/update-listing':    'Edit Property',
  '/categories':        'Categories',
  '/owners':            'Property Owners',
  '/clients':           'Clients',
  '/pipeline':          'Sales Pipeline',
  '/tasks':             'Tasks',
  '/calendar':          'Calendar',
  '/transactions':      'Transactions',
  '/client-reports':    'Client Reports',
  '/reports':           'Reports',
  '/buyer-requirements':'Buyer Requirements',
  '/buyers':            'Buyer Requirements',
  '/admin':             'Admin Panel',
  '/profile':           'My Profile',
  '/settings':          'Settings',
};

function getPageTitle(pathname) {
  for (const [prefix, title] of Object.entries(PAGE_TITLES)) {
    if (pathname.startsWith(prefix)) return title;
  }
  return 'Real Vista';
}

// ── Nav item component ────────────────────────────────────────────────────────
function NavItem({ item, isActive, onNavigate }) {
  const Icon = item.icon;
  const active = item.active !== undefined ? item.active : isActive(item.to);

  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      className={cx(
        'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 group',
        active
          ? 'crm-nav-active text-white'
          : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
      )}
    >
      <Icon className={cx(
        'w-[15px] h-[15px] flex-shrink-0',
        active ? 'text-indigo-300' : 'text-slate-500 group-hover:text-slate-400'
      )} />
      <span className='flex-1 truncate leading-none'>{item.label}</span>
    </Link>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function CrmShell() {
  const location = useLocation();
  const { currentUser } = useSelector((s) => s.user);
  const { isBuyerViewMode } = useBuyerView();

  const { resolvedTheme, setTheme } = useAppearance();
  const { notifications, clearAll } = useNotification();
  const { can } = usePermissions();

  const { open: openSearch } = useSearchContext();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const canAccess = useMemo(() => {
    if (!currentUser) return false;
    if (isBuyerViewMode) return false;
    return currentUser.role === 'admin' || currentUser.role === 'employee';
  }, [currentUser, isBuyerViewMode]);

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const username  = currentUser?.username || currentUser?.name || 'User';
  const initials  = username.slice(0, 2).toUpperCase();
  const roleBadge = ROLE_COLORS[currentUser?.role] || 'bg-slate-700 text-slate-300';
  const pageTitle = getPageTitle(location.pathname);
  const closeSidebar = () => setSidebarOpen(false);

  // ── Navigation structure ──────────────────────────────────────────────────
  const allNavSections = [
    {
      label: 'Overview',
      items: [
        { to: '/dashboard',  label: 'Dashboard',  icon: HiOutlineHome,     requires: 'viewAnalytics' },
        { to: '/analytics',  label: 'Analytics',  icon: HiOutlineChartBar, requires: 'viewAnalytics' },
      ],
    },
    {
      label: 'Properties',
      items: [
        {
          to: '/properties', label: 'All Properties', icon: HiOutlineOfficeBuilding, requires: 'viewListings',
          active: isActive('/properties') || isActive('/update-listing'),
        },
        {
          to: '/categories', label: 'Categories', icon: HiOutlineTag, requires: 'viewCategories',
          active: isActive('/categories') || isActive('/category/') || isActive('/dynamic-listings/'),
        },
        { to: '/create-listing', label: 'Add Property', icon: HiOutlinePlus, requires: 'createListing' },
      ],
    },
    {
      label: 'CRM',
      items: [
        {
          to: '/clients',  label: 'Clients',          icon: HiOutlineUsers,     requires: 'viewClients',
          active: isActive('/clients'),
        },
        {
          // Property owners — was incorrectly called "Contacts" before
          to: '/owners',   label: 'Property Owners',  icon: HiOutlineUserGroup, requires: 'viewOwners',
        },
        { to: '/pipeline', label: 'Sales Pipeline',   icon: HiOutlineViewBoards, requires: 'viewClients' },
        { to: '/buyers',   label: 'Buyer Requirements',icon: HiOutlineCollection, requires: 'viewBuyerRequirements' },
        { to: '/tasks',    label: 'Tasks',            icon: HiOutlineClipboardList },
        { to: '/calendar', label: 'Calendar',         icon: HiOutlineCalendar },
      ],
    },
    {
      label: 'Finance & Reports',
      items: [
        { to: '/transactions',   label: 'Transactions',   icon: HiOutlineCurrencyDollar, requires: 'viewAnalytics' },
        { to: '/reports',        label: 'Client Reports', icon: HiOutlineDocumentReport, requires: 'exportData' },
      ],
    },
    ...(currentUser?.role === 'admin' ? [{
      label: 'Admin',
      items: [
        { to: '/admin',    label: 'Admin Panel', icon: HiOutlineShieldCheck },
        { to: '/settings', label: 'Settings',   icon: HiOutlineCog },
      ],
    }] : []),
  ];

  const navSections = allNavSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => can(item.requires)),
    }))
    .filter((section) => section.items.length > 0);

  // Non-CRM users get the page content without the shell
  if (!canAccess) return <Outlet />;

  return (
    <div className='min-h-screen bg-slate-50 flex'>

      {/* ── Mobile overlay ── */}
      {sidebarOpen && (
        <button
          type='button'
          onClick={closeSidebar}
          className='fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden'
          aria-label='Close sidebar'
        />
      )}

      {/* ── Sidebar ── */}
      <aside className={cx(
        'fixed top-0 left-0 h-full w-64 z-50 lg:z-30 flex flex-col',
        'bg-slate-900 border-r border-white/5 crm-sidebar-dots',
        'transform transition-transform duration-200 ease-in-out',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      )}>

        {/* Brand */}
        <div className='h-14 px-4 flex items-center justify-between border-b border-white/[0.06] flex-shrink-0'>
          <Link to='/dashboard' onClick={closeSidebar} className='flex items-center gap-2.5 min-w-0'>
            <div className='w-7 h-7 rounded-lg flex-shrink-0 relative shadow-md shadow-indigo-700/40 overflow-hidden'>
              <div className='absolute inset-0 bg-gradient-to-br from-indigo-500 to-violet-600' />
              <div className='absolute inset-0 flex items-center justify-center'>
                <HiOutlineOfficeBuilding className='w-3.5 h-3.5 text-white' />
              </div>
            </div>
            <div className='min-w-0'>
              <div className='text-sm font-bold text-white leading-tight truncate'>Real Vista</div>
              <div className='text-[10px] text-slate-500 leading-tight font-medium'>CRM</div>
            </div>
          </Link>
          <button
            type='button'
            onClick={closeSidebar}
            className='lg:hidden p-1.5 rounded-lg hover:bg-white/10 text-slate-400'
          >
            <HiX className='w-4 h-4' />
          </button>
        </div>

        {/* Nav */}
        <nav className='flex-1 overflow-y-auto px-3 py-3 space-y-5 scrollbar-thin'>
          {navSections.map((section) => (
            <div key={section.label}>
              <div className='px-3 mb-1.5'>
                <span className='text-[10px] font-semibold text-slate-500 uppercase tracking-[0.12em] whitespace-nowrap'>
                  {section.label}
                </span>
              </div>
              <div className='space-y-0.5'>
                {section.items.map((item) => (
                  <NavItem
                    key={item.to}
                    item={item}
                    isActive={isActive}
                    onNavigate={closeSidebar}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div className='flex-shrink-0 border-t border-white/5 p-3'>
          <div className='relative'>
            <button
              onClick={() => setProfileOpen((o) => !o)}
              className='w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors group'
            >
              <div className='w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 bg-indigo-600/30 flex items-center justify-center ring-1 ring-white/10'>
                {currentUser?.avatar ? (
                  <img src={normalizeImageUrl(currentUser.avatar)} alt={username} className='w-full h-full object-cover' />
                ) : (
                  <span className='text-xs font-bold text-indigo-300'>{initials}</span>
                )}
              </div>
              <div className='min-w-0 flex-1 text-left'>
                <div className='text-sm font-semibold text-white truncate leading-tight'>{username}</div>
                <span className={cx('inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-md capitalize leading-tight mt-0.5', roleBadge)}>
                  {currentUser?.role || 'user'}
                </span>
              </div>
              <HiChevronDown className={cx('w-4 h-4 text-slate-500 flex-shrink-0 transition-transform', profileOpen && 'rotate-180')} />
            </button>

            {profileOpen && (
              <>
                <button className='fixed inset-0 z-10' onClick={() => setProfileOpen(false)} />
                <div className='absolute bottom-full left-0 right-0 mb-1 bg-slate-800 border border-white/10 rounded-xl shadow-xl z-20 overflow-hidden'>
                  <Link
                    to='/profile'
                    onClick={() => { closeSidebar(); setProfileOpen(false); }}
                    className='flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors'
                  >
                    <HiOutlineUser className='w-4 h-4' />
                    View Profile
                  </Link>
                  <Link
                    to='/messages'
                    onClick={() => { closeSidebar(); setProfileOpen(false); }}
                    className='flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors'
                  >
                    <HiOutlineChat className='w-4 h-4' />
                    Messages
                  </Link>
                  <div className='border-t border-white/5' />
                  <Link
                    to='/'
                    onClick={() => setProfileOpen(false)}
                    className='flex items-center gap-3 px-4 py-3 text-sm text-slate-400 hover:bg-white/5 hover:text-white transition-colors'
                  >
                    <HiOutlineLogout className='w-4 h-4' />
                    Back to Site
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className='flex-1 flex flex-col min-w-0 lg:pl-64'>

        {/* Topbar */}
        <header className='h-12 bg-white border-b border-slate-100 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-20 gap-4 flex-shrink-0'>
          <div className='flex items-center gap-4 min-w-0'>
            <button
              type='button'
              onClick={() => setSidebarOpen(true)}
              className='lg:hidden p-2 rounded-lg hover:bg-slate-100 flex-shrink-0'
              aria-label='Open sidebar'
            >
              <HiMenuAlt2 className='w-5 h-5 text-slate-600' />
            </button>

            <h1 className='text-sm font-semibold text-slate-800 hidden sm:block tracking-tight'>{pageTitle}</h1>

            {/* Global search trigger */}
            <button
              onClick={() => openSearch()}
              className='hidden md:flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-white hover:border-slate-300 hover:shadow-sm transition-all duration-200 text-slate-400 hover:text-slate-600 w-60'
              title='Search (⌘K)'
            >
              <HiOutlineSearch className='w-3.5 h-3.5 flex-shrink-0' />
              <span className='text-sm flex-1 text-left text-slate-400'>Search…</span>
              <kbd className='text-[10px] font-medium border border-slate-200 rounded px-1.5 py-0.5 bg-white text-slate-400 hidden lg:inline-flex'>⌘K</kbd>
            </button>
          </div>

          <div className='flex items-center gap-2 flex-shrink-0'>
            {/* Dark mode toggle */}
            <button
              type='button'
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              className='p-2 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-all'
              aria-label='Toggle dark mode'
              title={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {resolvedTheme === 'dark'
                ? <HiOutlineSun className='w-4 h-4' />
                : <HiOutlineMoon className='w-4 h-4' />
              }
            </button>

            {/* Notifications */}
            <div className='relative'>
              <button
                type='button'
                onClick={() => setNotifOpen((o) => !o)}
                className='p-2 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-all relative'
                aria-label='Notifications'
              >
                <HiOutlineBell className='w-4 h-4' />
                {notifications.length > 0 && (
                  <span className='absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-rose-500 rounded-full ring-1 ring-white' />
                )}
              </button>

              {notifOpen && (
                <>
                  <button className='fixed inset-0 z-10' onClick={() => setNotifOpen(false)} aria-hidden='true' />
                  <div className='absolute right-0 top-full mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-20 overflow-hidden'>
                    <div className='flex items-center justify-between px-4 py-3 border-b border-slate-100'>
                      <span className='text-sm font-semibold text-slate-800'>Notifications</span>
                      {notifications.length > 0 && (
                        <button
                          onClick={() => { clearAll(); setNotifOpen(false); }}
                          className='text-xs text-slate-400 hover:text-slate-600 transition-colors'
                        >
                          Clear all
                        </button>
                      )}
                    </div>
                    <div className='max-h-72 overflow-y-auto'>
                      {notifications.length === 0 ? (
                        <div className='px-4 py-8 text-center'>
                          <HiOutlineBell className='w-8 h-8 text-slate-300 mx-auto mb-2' />
                          <p className='text-sm text-slate-400'>No notifications</p>
                        </div>
                      ) : (
                        <ul className='divide-y divide-slate-100'>
                          {notifications.map((n) => (
                            <li key={n.id} className='flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors'>
                              {NOTIF_ICONS[n.type] || NOTIF_ICONS.info}
                              <p className='text-xs text-slate-700 leading-relaxed flex-1'>{n.message}</p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Messages shortcut */}
            <Link
              to='/messages'
              className='hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium transition-all'
            >
              <HiOutlineChat className='w-4 h-4' />
              <span>Messages</span>
            </Link>

            {/* Profile button */}
            <Link
              to='/profile'
              className='flex items-center gap-2 pl-1 pr-3 py-1 rounded-full border border-slate-200 hover:bg-slate-50 transition-all'
            >
              <div className='w-6 h-6 rounded-md overflow-hidden bg-indigo-100 flex items-center justify-center flex-shrink-0'>
                {currentUser?.avatar ? (
                  <img src={normalizeImageUrl(currentUser.avatar)} alt={username} className='w-full h-full object-cover' />
                ) : (
                  <span className='text-[9px] font-bold text-indigo-600'>{initials}</span>
                )}
              </div>
              <span className='hidden sm:block text-sm font-medium text-slate-700'>{username.split(' ')[0]}</span>
            </Link>
          </div>
        </header>

        {/* Page content */}
        <main className='flex-1 px-4 lg:px-6 py-6'>
          <Outlet />
        </main>
      </div>

      <OfflineIndicator />
    </div>
  );
}

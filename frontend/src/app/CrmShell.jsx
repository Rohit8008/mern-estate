import { useMemo, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  HiMenuAlt2, HiX, HiOutlineSearch, HiOutlineBell,
  HiOutlineOfficeBuilding, HiOutlineUser, HiOutlineLogout,
  HiChevronDown, HiOutlineChat, HiOutlineGlobeAlt,
} from 'react-icons/hi';
import { HiOutlineSun, HiOutlineMoon } from 'react-icons/hi2';
import { useBuyerView } from '../contexts/BuyerViewContext';
import { useAppearance } from '../contexts/useAppearance';
import { useNotificationFeed } from '../contexts/NotificationFeedProvider';
import { useSearchContext } from '../contexts/SearchContext';
import { useTranslation } from 'react-i18next';
import { useTenant } from '../contexts/TenantProvider';
import { useScreens, useScreenLabel } from '../hooks/useScreens';
import { normalizeImageUrl } from '../utils/http';
import OfflineIndicator from '../components/OfflineIndicator';
import ActingAsBanner from '../components/ActingAsBanner';
import { useActingAs } from '../hooks/useActingAs';

function cx(...xs) { return xs.filter(Boolean).join(' '); }

/**
 * A dot per notification kind. Literal class strings: Tailwind scans source as
 * plain text, so `bg-${colour}-500` would never be emitted.
 */
const NOTIF_DOT = {
  'lead.assigned':      'bg-indigo-500',
  'deal.stage_changed': 'bg-emerald-500',
  'task.assigned':      'bg-blue-500',
  'task.due':           'bg-amber-500',
  'followup.due':       'bg-amber-500',
  'buyer.match':        'bg-violet-500',
  'message.received':   'bg-sky-500',
  'import.finished':    'bg-slate-400',
  'share.viewed':       'bg-slate-400',
  'listing.updated':    'bg-slate-400',
  'system.alert':       'bg-rose-500',
};

/** Compact relative time, so the dropdown stays narrow. */
function timeAgo(value) {
  const then = new Date(value).getTime();
  if (!then) return '';
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const ROLE_COLORS = {
  admin:    'bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/30',
  employee: 'bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/30',
  seller:   'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30',
};

/**
 * Titles for paths that are not catalogue screens in their own right — a
 * profile page, a detail view. Catalogue screens are titled from the workspace's
 * own label instead, so an agency that renames "Clients" to "Leads" sees it in
 * the header too.
 */
const EXTRA_PAGE_TITLES = {
  '/profile': 'My Profile',
  '/chat': 'Messages',
  '/messages': 'Messages',
  '/notifications': 'Notifications',
  '/listing/': 'Property',
  // Not a catalogue screen on purpose — it belongs to the vendor, not to any
  // workspace — so it needs a title here or the header falls back to the
  // product name and reads as if you were on the dashboard.
  '/platform': 'Platform console',
};

function getExtraPageTitle(pathname) {
  for (const [prefix, title] of Object.entries(EXTRA_PAGE_TITLES)) {
    if (pathname.startsWith(prefix)) return title;
  }
  return null;
}

// ── Nav item component ────────────────────────────────────────────────────────
function NavItem({ item, isActive, onNavigate }) {
  const Icon = item.icon;
  // A screen stays highlighted while you are anywhere it owns — editing a
  // property should not make the sidebar look like you have left Properties.
  const active = [item.route, ...(item.matches || [])].some(isActive);

  return (
    <Link
      to={item.route}
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
        // The active icon carries the workspace's accent so the menu reads as
        // theirs; everything around it stays neutral so one agency's brand
        // colour cannot make the chrome unreadable.
        active ? 'text-workspace-accent' : 'text-slate-500 group-hover:text-slate-400'
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
  const { items: notifications, unread, ensureLoaded, markRead, markAllRead } = useNotificationFeed();

  const { open: openSearch } = useSearchContext();
  const { t } = useTranslation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isActing } = useActingAs();
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
  const { tenant } = useTenant();
  const productName = tenant?.branding?.productName || tenant?.name || 'Real Vista';
  const logoMark = normalizeImageUrl(tenant?.branding?.logoMarkUrl || tenant?.branding?.logoUrl || '');
  const screenLabel = useScreenLabel(location.pathname, productName);
  const pageTitle = getExtraPageTitle(location.pathname) || screenLabel;
  const closeSidebar = () => setSidebarOpen(false);

  // ── Navigation ────────────────────────────────────────────────────────────
  // Built from the workspace's screen catalogue rather than hardcoded here, so
  // enabling a module for one agency is a config change, not a release. See
  // useScreens for how the three filters (product / workspace / user) combine.
  const { sections: navSections, ready: screensReady } = useScreens();

  // Non-CRM users get the page content without the shell
  if (!canAccess) return <Outlet />;

  return (
    <div className='min-h-screen bg-slate-50 flex'>

      {/* ── Mobile overlay ── */}
      {sidebarOpen && (
        <button
          type='button'
          onClick={closeSidebar}
          className='fixed inset-0 !mt-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden'
          aria-label={t('crmShell.closeSidebar')}
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
            <div className='w-7 h-7 rounded-lg flex-shrink-0 relative shadow-md overflow-hidden bg-workspace'>
              {logoMark ? (
                <img src={logoMark} alt='' className='absolute inset-0 w-full h-full object-cover' />
              ) : (
                <div className='absolute inset-0 flex items-center justify-center'>
                  <HiOutlineOfficeBuilding className='w-3.5 h-3.5 text-workspace-contrast' />
                </div>
              )}
            </div>
            <div className='min-w-0'>
              <div className='text-sm font-bold text-white leading-tight truncate'>{productName}</div>
              <div className='text-[10px] text-slate-500 leading-tight font-medium'>{t('crmShell.crm')}</div>
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
          {/* Platform operators only. Deliberately outside the workspace's
              screen catalogue: this is the vendor's console, not a module an
              agency has. */}
          {currentUser?.isPlatformAdmin && (
            <div>
              <div className='px-3 mb-1.5'>
                <span className='text-[10px] font-semibold text-slate-500 uppercase tracking-[0.12em]'>{t('crmShell.platform')}</span>
              </div>
              <NavItem
                item={{ id: 'platform', route: '/platform', label: 'All workspaces', icon: HiOutlineGlobeAlt }}
                isActive={isActive}
                onNavigate={closeSidebar}
              />
            </div>
          )}

          {screensReady && navSections.length === 0 && (
            <p className='px-3 text-xs text-slate-500 leading-relaxed'>{t('crmShell.thisWorkspaceHasNoScreensEnabled')}</p>
          )}
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
                    key={item.id}
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
                <button className='fixed inset-0 !mt-0 z-10' onClick={() => setProfileOpen(false)} />
                <div className='absolute bottom-full left-0 right-0 mb-1 bg-slate-800 border border-white/10 rounded-xl shadow-xl z-20 overflow-hidden'>
                  <Link
                    to='/profile'
                    onClick={() => { closeSidebar(); setProfileOpen(false); }}
                    className='flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors'
                  >
                    <HiOutlineUser className='w-4 h-4' />{t('crmShell.viewProfile')}</Link>
                  <Link
                    to='/messages'
                    onClick={() => { closeSidebar(); setProfileOpen(false); }}
                    className='flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors'
                  >
                    <HiOutlineChat className='w-4 h-4' />
                    {t('nav.messages')}
                  </Link>
                  <div className='border-t border-white/5' />
                  <Link
                    to='/'
                    onClick={() => setProfileOpen(false)}
                    className='flex items-center gap-3 px-4 py-3 text-sm text-slate-400 hover:bg-white/5 hover:text-white transition-colors'
                  >
                    <HiOutlineLogout className='w-4 h-4' />{t('crmShell.backToSite')}</Link>
                </div>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className='flex-1 flex flex-col min-w-0 lg:pl-64'>

        {/* Nothing else on screen says whose workspace this is — the branding
            says the opposite — so the warning sits above everything and stays. */}
        <ActingAsBanner />

        {/* Topbar. Sits below the acting banner rather than under it, so both
            stay readable when the page is scrolled. */}
        <header className={cx(
          'h-12 bg-white border-b border-slate-100 flex items-center justify-between px-4 lg:px-6 sticky z-20 gap-4 flex-shrink-0',
          isActing ? 'top-10' : 'top-0'
        )}>
          <div className='flex items-center gap-4 min-w-0'>
            <button
              type='button'
              onClick={() => setSidebarOpen(true)}
              className='lg:hidden p-2 rounded-lg hover:bg-slate-100 flex-shrink-0'
              aria-label={t('crmShell.openSidebar')}
            >
              <HiMenuAlt2 className='w-5 h-5 text-slate-600' />
            </button>

            <h1 className='text-sm font-semibold text-slate-800 hidden sm:block tracking-tight'>{pageTitle}</h1>

            {/* Global search trigger */}
            <button
              onClick={() => openSearch()}
              className='hidden md:flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-white hover:border-slate-300 hover:shadow-sm transition-all duration-200 text-slate-400 hover:text-slate-600 w-60'
              title={`${t('nav.search')} (⌘K)`}
            >
              <HiOutlineSearch className='w-3.5 h-3.5 flex-shrink-0' />
              <span className='text-sm flex-1 text-left text-slate-400'>{t('nav.search')}…</span>
              <kbd className='text-[10px] font-medium border border-slate-200 rounded px-1.5 py-0.5 bg-white text-slate-400 hidden lg:inline-flex'>{t('crmShell.k')}</kbd>
            </button>
          </div>

          <div className='flex items-center gap-2 flex-shrink-0'>
            {/* Dark mode toggle */}
            <button
              type='button'
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              className='p-2 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-all'
              aria-label={t('crmShell.toggleDarkMode')}
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
                onClick={() => { setNotifOpen((o) => !o); ensureLoaded(); }}
                className='p-2 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-all relative'
                aria-label={t('nav.notifications')}
              >
                <HiOutlineBell className='w-4 h-4' />
                {unread > 0 && (
                  <span className='absolute -top-0.5 -right-0.5 min-w-[1.05rem] h-[1.05rem] px-1 flex items-center justify-center text-[0.625rem] font-semibold leading-none text-white bg-rose-500 rounded-full ring-2 ring-white'>
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </button>

              {notifOpen && (
                <>
                  <button className='fixed inset-0 !mt-0 z-10' onClick={() => setNotifOpen(false)} aria-hidden='true' />
                  <div className='absolute right-0 top-full mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-20 overflow-hidden'>
                    <div className='flex items-center justify-between px-4 py-3 border-b border-slate-100'>
                      <span className='text-sm font-semibold text-slate-800'>{t('nav.notifications')}</span>
                      {unread > 0 && (
                        <button
                          onClick={() => markAllRead()}
                          className='text-xs text-slate-400 hover:text-slate-600 transition-colors'
                        >
                          {t('notifications.markAllRead')}
                        </button>
                      )}
                    </div>
                    <div className='max-h-72 overflow-y-auto'>
                      {notifications.length === 0 ? (
                        <div className='px-4 py-8 text-center'>
                          <HiOutlineBell className='w-8 h-8 text-slate-300 mx-auto mb-2' />
                          <p className='text-sm text-slate-400'>{t('notifications.empty')}</p>
                        </div>
                      ) : (
                        <ul className='divide-y divide-slate-100'>
                          {notifications.slice(0, 10).map((n) => (
                            <li key={n._id}>
                              <Link
                                to={n.link || '/notifications'}
                                onClick={() => { if (!n.readAt) markRead(n._id); setNotifOpen(false); }}
                                className={cx(
                                  'flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors',
                                  !n.readAt && 'bg-indigo-50/40'
                                )}
                              >
                                <span className={cx(
                                  'w-2 h-2 rounded-full flex-shrink-0 mt-1.5',
                                  NOTIF_DOT[n.type] || 'bg-slate-400'
                                )} />
                                <span className='flex-1 min-w-0'>
                                  <span className='block text-xs font-medium text-slate-800 truncate'>{n.title}</span>
                                  {n.body && <span className='block text-xs text-slate-500 truncate'>{n.body}</span>}
                                  <span className='block text-[0.6875rem] text-slate-400 mt-0.5'>{timeAgo(n.createdAt)}</span>
                                </span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <Link
                      to='/notifications'
                      onClick={() => setNotifOpen(false)}
                      className='block px-4 py-2.5 text-center text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50 border-t border-slate-100 transition-colors'
                    >
                      {t('common.viewAll')}
                    </Link>
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
              <span>{t('nav.messages')}</span>
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

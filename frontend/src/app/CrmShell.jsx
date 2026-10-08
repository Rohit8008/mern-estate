import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  HiMenuAlt2, HiX, HiOutlineSearch, HiOutlineBell,
  HiOutlineOfficeBuilding, HiOutlineUser, HiOutlineLogout,
  HiChevronDown, HiChevronRight, HiOutlineChat, HiOutlineGlobeAlt,
  HiOutlineCog, HiOutlineArrowLeft, HiSelector,
} from 'react-icons/hi';
import { HiOutlineSun, HiOutlineMoon } from 'react-icons/hi2';
import { useBuyerView } from '../contexts/BuyerViewContext';
import { useAppearance } from '../contexts/useAppearance';
import { useNotificationFeed } from '../contexts/NotificationFeedProvider';
import { useSearchContext } from '../contexts/SearchContext';
import { useTranslation } from 'react-i18next';
import { useTenant } from '../contexts/TenantProvider';
import { useScreens, useScreenLabel } from '../hooks/useScreens';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { normalizeImageUrl } from '../utils/http';
import { signOutAndLeave } from '../utils/session';
import { screenIdForPath } from './screenRegistry';
import { recordRecentPage } from '../utils/recentPages';
import KeyboardShortcuts from './KeyboardShortcuts';
import { TOGGLE_SIDEBAR_EVENT } from './commands';
import OfflineIndicator from '../components/OfflineIndicator';
import ActingAsBanner from '../components/ActingAsBanner';
import { useActingAs } from '../hooks/useActingAs';
import {
  Avatar, Drawer, Dropdown, DropdownItem, DropdownLabel, DropdownSeparator, Tooltip,
} from '../design-system';

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

/** "Today" / "Earlier" — enough to scan a feed without reading every timestamp. */
function isToday(value) {
  const d = new Date(value);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
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
 *
 * Longest prefix wins (see getExtraPageTitle), so '/admin/audit-log' beats
 * nothing and '/clients/' only matches a client's own page, never the list.
 */
const EXTRA_PAGE_TITLES = {
  '/profile': 'My Profile',
  '/chat': 'Messages',
  '/messages': 'Messages',
  '/notifications': 'Notifications',
  '/listing/': 'Property',
  '/update-listing/': 'Edit property',
  '/portfolio': 'Portfolio',
  '/clients/': 'Client',
  '/category/': 'Category',
  '/dynamic-listings/': 'Listings',
  '/admin/categories/': 'Category fields',
  '/admin/property-types': 'Property types',
  '/admin/audit-log': 'Audit log',
  '/admin/import-leads': 'Import leads',
  // Not a catalogue screen on purpose — it belongs to the vendor, not to any
  // workspace — so it needs a title here or the header falls back to the
  // product name and reads as if you were on the dashboard.
  '/platform': 'Platform console',
};

function getExtraPageTitle(pathname) {
  let best = null;
  let bestLength = -1;
  for (const [prefix, title] of Object.entries(EXTRA_PAGE_TITLES)) {
    if (pathname.startsWith(prefix) && prefix.length > bestLength) {
      best = title;
      bestLength = prefix.length;
    }
  }
  return best;
}

// ── Persisted shell preferences ──────────────────────────────────────────────
// Per-browser conveniences: losing them (private window, cleared storage) just
// means the default layout, so every read and write tolerates failure.
const COLLAPSED_KEY = 'crm:sidebar-collapsed';
const FOLDED_KEY = 'crm:nav-folded-sections';

function readPref(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writePref(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* see readPref */ }
}

// ── Nav item ─────────────────────────────────────────────────────────────────
function NavItem({ item, active, rail, onNavigate }) {
  const Icon = item.icon;
  return (
    <Tooltip content={item.label} side='right' disabled={!rail}>
      <Link
        to={item.route}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        className={cx(
          'flex items-center rounded-lg text-sm font-medium transition-colors duration-150 group',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
          rail ? 'justify-center w-10 h-10 mx-auto' : // py-2.5 below lg: the drawer is a touch surface and 36px rows are easy to mis-tap.
            'gap-2.5 px-3 py-2.5 lg:py-2',
          active
            ? 'crm-nav-active text-white'
            : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
        )}
      >
        <Icon
          aria-hidden='true'
          className={cx(
            'flex-shrink-0',
            rail ? 'w-[18px] h-[18px]' : 'w-[15px] h-[15px]',
            // The active icon carries the workspace's accent so the menu reads as
            // theirs; everything around it stays neutral so one agency's brand
            // colour cannot make the chrome unreadable.
            active ? 'text-workspace-accent' : 'text-slate-500 group-hover:text-slate-400'
          )}
        />
        {/* In the rail the label is visually hidden but stays the link's
            accessible name — the tooltip only describes it. */}
        <span className={rail ? 'sr-only' : 'flex-1 truncate leading-none'}>{item.label}</span>
      </Link>
    </Tooltip>
  );
}

// ── Nav section: a micro-label that folds its items away ─────────────────────
function NavSection({ id, label, folded, onToggleFold, rail, hasActive, children }) {
  const listId = `nav-section-${id}`;

  if (rail) {
    // No labels in the rail — a hairline between groups keeps them apart.
    return (
      <div className='space-y-1 pt-2 first:pt-0 border-t border-white/[0.06] first:border-t-0'>
        {children}
      </div>
    );
  }

  return (
    <div>
      <button
        type='button'
        onClick={onToggleFold}
        aria-expanded={!folded}
        aria-controls={listId}
        className='w-full flex items-center gap-1.5 px-3 mb-1.5 group rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30'
      >
        <span className='text-[10px] font-semibold text-slate-500 group-hover:text-slate-400 uppercase tracking-[0.12em] whitespace-nowrap transition-colors'>
          {label}
        </span>
        {/* A folded section still says when you are inside it. */}
        {folded && hasActive && <span className='w-1.5 h-1.5 rounded-full bg-workspace-accent' aria-hidden='true' />}
        <HiChevronDown
          aria-hidden='true'
          className={cx(
            'ml-auto w-3 h-3 text-slate-600 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-[opacity,transform]',
            folded && '-rotate-90 opacity-100'
          )}
        />
      </button>
      {!folded && <div id={listId} className='space-y-0.5'>{children}</div>}
    </div>
  );
}

// ── Account menu: one list of items for both the header and the sidebar ──────
function AccountMenuItems({ username, role, email, canSeeSettings, onNavigate, onSignOut, t }) {
  return (
    <>
      <DropdownLabel>
        <span className='block text-sm font-semibold text-foreground truncate'>{username}</span>
        {email && <span className='block truncate'>{email}</span>}
        {role && <span className='block capitalize mt-0.5'>{role}</span>}
      </DropdownLabel>
      <DropdownSeparator />
      <DropdownItem as={Link} to='/profile' icon={HiOutlineUser} onSelect={onNavigate}>{t('crmShell.viewProfile')}</DropdownItem>
      <DropdownItem as={Link} to='/messages' icon={HiOutlineChat} onSelect={onNavigate}>{t('nav.messages')}</DropdownItem>
      <DropdownItem as={Link} to='/notifications' icon={HiOutlineBell} onSelect={onNavigate}>{t('nav.notifications')}</DropdownItem>
      {canSeeSettings && (
        <DropdownItem as={Link} to='/settings' icon={HiOutlineCog} onSelect={onNavigate}>{t('nav.screens.settings')}</DropdownItem>
      )}
      <DropdownSeparator />
      <DropdownItem as={Link} to='/' icon={HiOutlineArrowLeft} onSelect={onNavigate}>{t('crmShell.backToSite')}</DropdownItem>
      <DropdownItem icon={HiOutlineLogout} danger onSelect={onSignOut}>{t('nav.signOut')}</DropdownItem>
    </>
  );
}

// ── Breadcrumbs ──────────────────────────────────────────────────────────────
/**
 * Section › Screen › Detail, from the same catalogue the sidebar uses, so a
 * workspace's rename of a screen or section shows up here too. The last crumb
 * is the page's <h1>.
 */
function useBreadcrumbs(pathname, screens, sections, productName) {
  const { t } = useTranslation();
  const screenLabel = useScreenLabel(pathname, productName);
  const extraTitle = getExtraPageTitle(pathname);

  return useMemo(() => {
    const id = screenIdForPath(pathname);
    const screen = id ? screens.find((s) => s.id === id) : null;
    if (!screen) return { trail: [], current: extraTitle || screenLabel };

    const section = sections.find((s) => s.items.some((i) => i.id === id));
    const trail = section ? [{ label: section.label }] : [];
    const onScreenRoot = pathname === screen.route || pathname === `${screen.route}/`;
    if (onScreenRoot) return { trail, current: screen.label };

    trail.push({ label: screen.label, to: screen.route });
    return { trail, current: extraTitle || t('crmShell.details') };
  }, [pathname, screens, sections, extraTitle, screenLabel, t]);
}

function Breadcrumbs({ trail, current, t }) {
  return (
    <nav aria-label={t('crmShell.breadcrumb')} className='min-w-0 hidden sm:block'>
      <ol className='flex items-center gap-1.5 text-sm min-w-0'>
        {trail.map((crumb, i) => (
          <Fragment key={`${crumb.label}-${i}`}>
            <li className='hidden md:flex items-center min-w-0'>
              {crumb.to ? (
                <Link to={crumb.to} className='text-slate-500 hover:text-slate-800 truncate transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'>
                  {crumb.label}
                </Link>
              ) : (
                <span className='text-slate-400 truncate'>{crumb.label}</span>
              )}
            </li>
            <li className='hidden md:flex' aria-hidden='true'>
              <HiChevronRight className='w-3.5 h-3.5 text-slate-300' />
            </li>
          </Fragment>
        ))}
        <li className='min-w-0'>
          <h1 className='text-sm font-semibold text-slate-800 tracking-tight truncate' aria-current='page'>{current}</h1>
        </li>
      </ol>
    </nav>
  );
}

// ── Notifications panel ──────────────────────────────────────────────────────
function NotificationRow({ n, onOpen }) {
  return (
    <li>
      <Link
        to={n.link || '/notifications'}
        onClick={onOpen}
        className={cx(
          'flex items-start gap-3 px-5 py-3 hover:bg-accent transition-colors focus-visible:outline-none focus-visible:bg-accent',
          !n.readAt && 'bg-brand-50/60 dark:bg-brand-950/30'
        )}
      >
        <span className={cx('w-2 h-2 rounded-full flex-shrink-0 mt-1.5', NOTIF_DOT[n.type] || 'bg-slate-400')} aria-hidden='true' />
        <span className='flex-1 min-w-0'>
          <span className={cx('block text-sm text-foreground', !n.readAt && 'font-semibold')}>{n.title}</span>
          {n.body && <span className='block text-xs text-muted-foreground mt-0.5 line-clamp-2'>{n.body}</span>}
          <span className='block text-[0.6875rem] text-muted-foreground mt-1'>{timeAgo(n.createdAt)}</span>
        </span>
        {!n.readAt && <span className='sr-only'>(unread)</span>}
      </Link>
    </li>
  );
}

function NotificationsDrawer({ open, onClose, items, unread, markRead, markAllRead, t }) {
  const [onlyUnread, setOnlyUnread] = useState(false);
  const shown = onlyUnread ? items.filter((n) => !n.readAt) : items;
  const today = shown.filter((n) => isToday(n.createdAt));
  const earlier = shown.filter((n) => !isToday(n.createdAt));
  const openOne = (n) => { if (!n.readAt) markRead(n._id); onClose(); };

  const group = (label, list) => list.length > 0 && (
    <section>
      <h3 className='px-5 pt-4 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground'>{label}</h3>
      <ul className='divide-y divide-border'>
        {list.map((n) => <NotificationRow key={n._id} n={n} onOpen={() => openOne(n)} />)}
      </ul>
    </section>
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t('nav.notifications')}
      description={unread > 0 ? t('crmShell.unreadCount', { count: unread }) : undefined}
      size='sm'
      footer={
        <Link to='/notifications' onClick={onClose} className='text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400'>
          {t('common.viewAll')}
        </Link>
      }
    >
      <div className='flex items-center justify-between gap-3 px-5 py-2.5 border-b border-border'>
        <div className='flex items-center gap-1 text-xs' role='group' aria-label={t('crmShell.filterNotifications')}>
          {[[false, t('crmShell.all')], [true, t('crmShell.unread')]].map(([value, label]) => (
            <button
              key={label}
              type='button'
              aria-pressed={onlyUnread === value}
              onClick={() => setOnlyUnread(value)}
              className={cx(
                'px-2.5 py-1 rounded-md font-medium transition-colors',
                onlyUnread === value ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {unread > 0 && (
          <button type='button' onClick={() => markAllRead()} className='text-xs font-medium text-muted-foreground hover:text-foreground transition-colors'>
            {t('notifications.markAllRead')}
          </button>
        )}
      </div>
      {shown.length === 0 ? (
        <div className='px-6 py-16 text-center'>
          <HiOutlineBell className='w-9 h-9 text-muted-foreground/40 mx-auto mb-3' aria-hidden='true' />
          <p className='text-sm text-muted-foreground'>{onlyUnread ? t('crmShell.allCaughtUp') : t('notifications.empty')}</p>
        </div>
      ) : (
        <>
          {group(t('crmShell.today'), today)}
          {group(t('crmShell.earlier'), earlier)}
        </>
      )}
    </Drawer>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function CrmShell() {
  const location = useLocation();
  const dispatch = useDispatch();
  const { currentUser } = useSelector((s) => s.user);
  const { isBuyerViewMode } = useBuyerView();

  const { resolvedTheme, setTheme } = useAppearance();
  const { items: notifications, unread, ensureLoaded, markRead, markAllRead } = useNotificationFeed();

  const { open: openSearch } = useSearchContext();
  const { t } = useTranslation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isActing } = useActingAs();
  const [notifOpen, setNotifOpen] = useState(false);

  // The rail is a desktop layout. On a phone the sidebar is a drawer, and a
  // drawer of bare icons would hide the labels exactly where space is not the
  // problem.
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [collapsed, setCollapsed] = useState(() => readPref(COLLAPSED_KEY, false) === true);
  const rail = collapsed && isDesktop;
  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => { writePref(COLLAPSED_KEY, !c); return !c; });
  }, []);

  const [folded, setFolded] = useState(() => {
    const saved = readPref(FOLDED_KEY, []);
    return new Set(Array.isArray(saved) ? saved : []);
  });
  const toggleFold = useCallback((id) => {
    setFolded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      writePref(FOLDED_KEY, [...next]);
      return next;
    });
  }, []);

  // Escape closes the mobile drawer. The notification panel (a Drawer) and
  // the menus built on Dropdown handle their own keys.
  useEffect(() => {
    if (!sidebarOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setSidebarOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sidebarOpen]);

  // Anything that navigates (browser back, a notification link, a link inside
  // the page) closes the drawer and the notification panel. Relying on each
  // link's onClick left the drawer covering the new page on a phone.
  useEffect(() => {
    setSidebarOpen(false);
    setNotifOpen(false);
  }, [location.pathname]);

  // While the drawer is open the page behind it must not scroll under the
  // user's thumb.
  useEffect(() => {
    if (!sidebarOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [sidebarOpen]);

  // The "[" shortcut: collapse on a desktop, open the drawer on a phone.
  useEffect(() => {
    const onToggle = () => (isDesktop ? toggleCollapsed() : setSidebarOpen((o) => !o));
    window.addEventListener(TOGGLE_SIDEBAR_EVENT, onToggle);
    return () => window.removeEventListener(TOGGLE_SIDEBAR_EVENT, onToggle);
  }, [isDesktop, toggleCollapsed]);

  // A short fade as the page changes. Done with the Web Animations API on the
  // existing element rather than by keying <main> on the path: a key would
  // remount the page, wiping its state whenever only a param changed
  // (/listing/1 → /listing/2). Opacity only — a transform would make <main> the
  // containing block for the page's position:fixed bars while it ran.
  const mainRef = useRef(null);
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  useEffect(() => {
    if (reduceMotion || typeof mainRef.current?.animate !== 'function') return;
    mainRef.current.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 200, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
  }, [location.pathname, reduceMotion]);

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
  const avatarSrc = currentUser?.avatar ? normalizeImageUrl(currentUser.avatar) : '';
  const roleBadge = ROLE_COLORS[currentUser?.role] || 'bg-slate-700 text-slate-300';
  const { tenant } = useTenant();
  const productName = tenant?.branding?.productName || tenant?.name || 'Real Vista';
  const logoMark = normalizeImageUrl(tenant?.branding?.logoMarkUrl || tenant?.branding?.logoUrl || '');
  const closeSidebar = () => setSidebarOpen(false);
  const signOut = () => signOutAndLeave(dispatch);

  // ── Navigation ────────────────────────────────────────────────────────────
  // Built from the workspace's screen catalogue rather than hardcoded here, so
  // enabling a module for one agency is a config change, not a release. See
  // useScreens for how the three filters (product / workspace / user) combine.
  const { screens, sections: navSections, ready: screensReady, canSee } = useScreens();
  const { trail, current } = useBreadcrumbs(location.pathname, screens, navSections, productName);

  // Exactly one screen is highlighted at a time: the one whose route (or alias)
  // is the LONGEST prefix of the current path — the same "longest route wins"
  // rule the breadcrumb uses. A plain prefix test lit up every ancestor too, so
  // '/admin' (Admin Panel) stayed highlighted alongside the real child screen on
  // '/admin/audit-log', '/admin/import' and friends. A screen still stays active
  // while you are anywhere it owns (e.g. editing a property under /properties).
  const activePath = useMemo(() => {
    let best = null;
    for (const section of navSections) {
      for (const item of section.items) {
        for (const path of [item.route, ...(item.matches || [])]) {
          if (isActive(path) && (best === null || path.length > best.length)) best = path;
        }
      }
    }
    return best;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navSections, location.pathname]);
  const itemActive = (item) =>
    activePath != null && [item.route, ...(item.matches || [])].includes(activePath);

  // Remember where this person has been, for the palette's "Recently visited".
  // Keyed on the full URL so a filtered list comes back as that view.
  const userId = currentUser?._id;
  useEffect(() => {
    if (!canAccess || !current) return;
    recordRecentPage(userId, { path: `${location.pathname}${location.search}`, title: current });
  }, [canAccess, userId, location.pathname, location.search, current]);

  // Non-CRM users get the page content without the shell
  if (!canAccess) return <Outlet />;

  const menuProps = {
    username,
    role: currentUser?.role,
    email: currentUser?.email,
    canSeeSettings: canSee('settings'),
    onSignOut: signOut,
    t,
  };

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
        // 100dvh, not h-full: on iOS the collapsing toolbar otherwise hides the
        // user footer at the bottom of the drawer.
        'fixed top-0 left-0 h-[100dvh] w-64 max-w-[85vw] z-50 lg:z-30 flex flex-col pb-safe',
        'bg-slate-900 border-r border-white/5 crm-sidebar-dots',
        'transform transition-[transform,width] duration-200 ease-out motion-reduce:transition-none',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        rail && 'lg:w-16'
      )}>

        {/* Brand */}
        <div className={cx(
          'h-14 flex items-center border-b border-white/[0.06] flex-shrink-0',
          rail ? 'justify-center px-2' : 'justify-between px-4'
        )}>
          <Link
            to='/dashboard'
            onClick={closeSidebar}
            aria-label={rail ? productName : undefined}
            className='flex items-center gap-2.5 min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40'
          >
            <div className='w-8 h-8 rounded-lg flex-shrink-0 relative shadow-md overflow-hidden bg-workspace ring-1 ring-white/10'>
              {logoMark ? (
                <img src={logoMark} alt='' className='absolute inset-0 w-full h-full object-cover' />
              ) : (
                <div className='absolute inset-0 flex items-center justify-center'>
                  <HiOutlineOfficeBuilding className='w-4 h-4 text-workspace-contrast' />
                </div>
              )}
            </div>
            {!rail && (
              <div className='min-w-0'>
                <div className='text-sm font-bold text-white leading-tight truncate'>{productName}</div>
                <div className='text-[10px] text-slate-500 leading-tight font-medium'>{t('crmShell.crm')}</div>
              </div>
            )}
          </Link>
          <button
            type='button'
            onClick={closeSidebar}
            aria-label={t('crmShell.closeSidebar')}
            className='lg:hidden w-10 h-10 -mr-2 flex items-center justify-center rounded-lg hover:bg-white/10 text-slate-400'
          >
            <HiX className='w-5 h-5' aria-hidden='true' />
          </button>
        </div>

        {/* Nav */}
        <nav className={cx('flex-1 overflow-y-auto py-3 scrollbar-thin', rail ? 'px-2 space-y-2' : 'px-3 space-y-5')}>
          {/* Platform operators only. Deliberately outside the workspace's
              screen catalogue: this is the vendor's console, not a module an
              agency has. */}
          {currentUser?.isPlatformAdmin && (
            <NavSection
              id='platform'
              label={t('crmShell.platform')}
              rail={rail}
              folded={folded.has('platform')}
              onToggleFold={() => toggleFold('platform')}
              hasActive={isActive('/platform')}
            >
              <NavItem
                item={{ id: 'platform', route: '/platform', label: 'All workspaces', icon: HiOutlineGlobeAlt }}
                active={isActive('/platform')}
                rail={rail}
                onNavigate={closeSidebar}
              />
            </NavSection>
          )}

          {screensReady && navSections.length === 0 && !rail && (
            <p className='px-3 text-xs text-slate-500 leading-relaxed'>{t('crmShell.thisWorkspaceHasNoScreensEnabled')}</p>
          )}
          {navSections.map((section) => {
            const sectionId = section.id || section.label;
            return (
              <NavSection
                key={sectionId}
                id={sectionId}
                label={section.label}
                rail={rail}
                folded={folded.has(sectionId)}
                onToggleFold={() => toggleFold(sectionId)}
                hasActive={section.items.some(itemActive)}
              >
                {section.items.map((item) => (
                  <NavItem
                    key={item.id}
                    item={item}
                    active={itemActive(item)}
                    rail={rail}
                    onNavigate={closeSidebar}
                  />
                ))}
              </NavSection>
            );
          })}
        </nav>

        {/* User footer */}
        <div className={cx('flex-shrink-0 border-t border-white/5', rail ? 'p-2' : 'p-3')}>
          <Dropdown
            label={t('crmShell.accountMenu')}
            placement='top-start'
            className='w-60'
            trigger={(props) => (
              <button
                {...props}
                aria-label={rail ? t('crmShell.accountMenu') : undefined}
                className={cx(
                  'w-full flex items-center rounded-lg hover:bg-white/5 transition-colors group',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30',
                  rail ? 'justify-center p-1.5' : 'gap-3 px-2 py-2'
                )}
              >
                <Avatar src={avatarSrc} name={username} size='sm' className='bg-indigo-600/30 text-indigo-300 ring-white/10' />
                {!rail && (
                  <>
                    <div className='min-w-0 flex-1 text-left'>
                      <div className='text-sm font-semibold text-white truncate leading-tight'>{username}</div>
                      <span className={cx('inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-md capitalize leading-tight mt-0.5', roleBadge)}>
                        {currentUser?.role || 'user'}
                      </span>
                    </div>
                    <HiSelector className='w-4 h-4 text-slate-500 flex-shrink-0' aria-hidden='true' />
                  </>
                )}
              </button>
            )}
          >
            <AccountMenuItems {...menuProps} onNavigate={closeSidebar} />
          </Dropdown>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className={cx(
        'flex-1 flex flex-col min-w-0 transition-[padding] duration-200 ease-out motion-reduce:transition-none',
        rail ? 'lg:pl-16' : 'lg:pl-64'
      )}>

        {/* Nothing else on screen says whose workspace this is — the branding
            says the opposite — so the warning sits above everything and stays. */}
        <ActingAsBanner />

        {/* Topbar. Sits below the acting banner rather than under it, so both
            stay readable when the page is scrolled. Translucent over a blur so
            the page reads as scrolling beneath it; theme tokens rather than
            bg-white, which the dark override sheet has no /80 rule for. */}
        <header className={cx(
          'h-14 bg-card/80 backdrop-blur-xl backdrop-saturate-150 border-b border-border',
          'flex items-center justify-between px-4 lg:px-6 sticky z-20 gap-4 flex-shrink-0',
          isActing ? 'top-10' : 'top-0'
        )}>
          <div className='flex items-center gap-3 min-w-0'>
            {/* One button, two jobs: opens the drawer on a phone, collapses the
                sidebar to its rail on a desktop. */}
            <button
              type='button'
              onClick={() => (isDesktop ? toggleCollapsed() : setSidebarOpen(true))}
              aria-expanded={isDesktop ? !collapsed : sidebarOpen}
              className='w-10 h-10 sm:w-auto sm:h-auto sm:p-2 -ml-2 sm:-ml-1 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 flex-shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'
              aria-label={
                isDesktop
                  ? t(collapsed ? 'crmShell.expandSidebar' : 'crmShell.collapseSidebar')
                  : t('crmShell.openSidebar')
              }
              title={isDesktop ? t(collapsed ? 'crmShell.expandSidebar' : 'crmShell.collapseSidebar') : undefined}
            >
              <HiMenuAlt2 className='w-5 h-5' aria-hidden='true' />
            </button>
            <div className='h-5 w-px bg-slate-200 hidden sm:block' aria-hidden='true' />

            <Breadcrumbs trail={trail} current={current} t={t} />
          </div>

          <div className='flex items-center gap-2 flex-shrink-0'>
            {/* Global search trigger */}
            <button
              type='button'
              onClick={() => openSearch()}
              className='hidden md:flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-white hover:border-slate-300 hover:shadow-sm transition-all duration-200 text-slate-400 hover:text-slate-600 w-56 lg:w-64'
              title={`${t('nav.search')} (⌘K)`}
            >
              <HiOutlineSearch className='w-3.5 h-3.5 flex-shrink-0' aria-hidden='true' />
              <span className='text-sm flex-1 text-left text-slate-400'>{t('nav.search')}…</span>
              <kbd className='text-[10px] font-medium border border-slate-200 rounded px-1.5 py-0.5 bg-white text-slate-400 hidden lg:inline-flex'>{t('crmShell.k')}</kbd>
            </button>
            <button
              type='button'
              onClick={() => openSearch()}
              aria-label={t('nav.search')}
              className='md:hidden w-10 h-10 flex items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-all'
            >
              <HiOutlineSearch className='w-4 h-4' aria-hidden='true' />
            </button>

            {/* Dark mode toggle */}
            <button
              type='button'
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              className='w-10 h-10 sm:w-9 sm:h-9 flex items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-all'
              aria-label={t('crmShell.toggleDarkMode')}
              title={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {resolvedTheme === 'dark'
                ? <HiOutlineSun className='w-4 h-4' aria-hidden='true' />
                : <HiOutlineMoon className='w-4 h-4' aria-hidden='true' />
              }
            </button>

            {/* Notifications — the bell opens a side panel rather than a
                dropdown, so the feed has room to be read and the page stays
                where it was underneath. */}
            <button
              type='button'
              onClick={() => { setNotifOpen(true); ensureLoaded(); }}
              aria-haspopup='dialog'
              aria-expanded={notifOpen}
              className='w-10 h-10 sm:w-9 sm:h-9 flex items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-all relative'
              aria-label={unread > 0 ? `${t('nav.notifications')} (${unread})` : t('nav.notifications')}
            >
              <HiOutlineBell className='w-4 h-4' aria-hidden='true' />
              {unread > 0 && (
                <span aria-hidden='true' className='absolute -top-0.5 -right-0.5 min-w-[1.05rem] h-[1.05rem] px-1 flex items-center justify-center text-[0.625rem] font-semibold leading-none text-white bg-rose-500 rounded-full ring-2 ring-white'>
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </button>

            {/* Messages shortcut */}
            <Link
              to='/messages'
              className='hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium transition-all'
            >
              <HiOutlineChat className='w-4 h-4' aria-hidden='true' />
              <span>{t('nav.messages')}</span>
            </Link>

            {/* Account menu */}
            <Dropdown
              label={t('crmShell.accountMenu')}
              className='w-64'
              trigger={(props, open) => (
                <button
                  {...props}
                  aria-label={t('crmShell.accountMenu')}
                  className={cx(
                    'flex items-center gap-2 pl-1 pr-2 py-1 rounded-full border border-slate-200 hover:bg-slate-50 transition-all',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                    open && 'bg-slate-50'
                  )}
                >
                  <Avatar src={avatarSrc} name={username} size='xs' className='rounded-full' />
                  <span className='hidden sm:block text-sm font-medium text-slate-700 max-w-[8rem] truncate'>{username.split(' ')[0]}</span>
                  <HiChevronDown className={cx('w-3.5 h-3.5 text-slate-400 transition-transform', open && 'rotate-180')} aria-hidden='true' />
                </button>
              )}
            >
              <AccountMenuItems {...menuProps} />
            </Dropdown>
          </div>
        </header>

        {/* Page content */}
        <main ref={mainRef} className='flex-1 px-4 lg:px-6 pt-4 sm:pt-6 pb-safe-6'>
          <Outlet />
        </main>
      </div>

      <NotificationsDrawer
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        items={notifications}
        unread={unread}
        markRead={markRead}
        markAllRead={markAllRead}
        t={t}
      />
      <KeyboardShortcuts />
      <OfflineIndicator />
    </div>
  );
}

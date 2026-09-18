import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  HiMenu,
  HiX,
  HiSearch,
  HiViewGrid,
  HiHome,
  HiChevronRight,
  HiOutlineOfficeBuilding,
} from 'react-icons/hi';
import { normalizeImageUrl } from '../utils/http';
import { useTenant } from '../contexts/TenantProvider';
import { useTranslation } from 'react-i18next';

function classNames(...xs) {
  return xs.filter(Boolean).join(' ');
}

export default function MinimalHeader() {
  const { t } = useTranslation();
  const location = useLocation();
  // The workspace's own name, not the vendor's. This header was hardcoded to
  // "Real Vista", so every agency's public pages carried another agency's
  // brand — the one place in the product that ignored the branding config.
  const { tenant } = useTenant();
  const productName = tenant?.branding?.productName || tenant?.name || 'Real Vista';
  const logoUrl = tenant?.branding?.logoUrl;
  const { currentUser } = useSelector((state) => state.user);
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const isCrmUser = currentUser?.role === 'admin' || currentUser?.role === 'employee';

  /**
   * The landing page is theme-locked dark. A white header bar on top of its
   * dark hero breaks that lock in the first 56 pixels, so on "/" the header
   * renders transparent over the hero instead. Every other public page is
   * light and keeps the original white bar.
   */
  const onDarkPage = location.pathname === '/';
  const username = currentUser?.username || currentUser?.name || 'User';
  const initials = username.slice(0, 2).toUpperCase();

  return (
    <header
      className={classNames(
        'fixed top-0 left-0 right-0 z-40 transition-colors',
        onDarkPage
          ? 'bg-slate-950/70 backdrop-blur-md border-b border-white/10'
          : 'bg-white border-b border-slate-200'
      )}
    >
      <div className='max-w-7xl mx-auto px-4 sm:px-6'>
        <div className='h-14 flex items-center justify-between gap-4'>

          {/* Logo */}
          <Link to='/' className='flex items-center gap-2.5 flex-shrink-0 group'>
            {logoUrl ? (
              <img src={normalizeImageUrl(logoUrl)} alt='' className='w-8 h-8 rounded-xl object-contain' />
            ) : (
              <div className='w-8 h-8 rounded-xl bg-workspace shadow flex items-center justify-center'>
                <HiOutlineOfficeBuilding className='w-4 h-4 text-white' />
              </div>
            )}
            <span className={classNames(
              'text-base font-bold transition-colors',
              onDarkPage ? 'text-white' : 'text-slate-900 group-hover:text-brand-700'
            )}>
              {productName}
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className='hidden md:flex items-center gap-1 flex-1 justify-center'>
            <Link
              to='/'
              className={classNames(
                'flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors',
                isActive('/')
                  ? (onDarkPage ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-900')
                  : (onDarkPage ? 'text-slate-300 hover:text-white hover:bg-white/10' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50')
              )}
            >
              <HiHome className='w-4 h-4' />{t('minimalHeader.home')}</Link>

            {currentUser && (
              <Link
                to='/search'
                className={classNames(
                  'flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors',
                  isActive('/search')
                    ? (onDarkPage ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-900')
                    : (onDarkPage ? 'text-slate-300 hover:text-white hover:bg-white/10' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50')
                )}
              >
                <HiSearch className='w-4 h-4' />{t('minimalHeader.search')}</Link>
            )}

            {/* CRM shortcut for admin/employee */}
            {isCrmUser && (
              <Link
                to='/dashboard'
                className={classNames(
                  'flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors',
                  isActive('/dashboard')
                    ? (onDarkPage ? 'bg-brand-500/20 text-brand-200' : 'bg-brand-50 text-brand-700')
                    : (onDarkPage ? 'text-slate-300 hover:text-white hover:bg-white/10' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50')
                )}
              >
                <HiViewGrid className='w-4 h-4' />{t('minimalHeader.dashboard')}</Link>
            )}
          </nav>

          {/* Right actions */}
          <div className='flex items-center gap-2 flex-shrink-0'>
            {currentUser ? (
              <Link
                to={isCrmUser ? '/dashboard' : '/profile'}
                className={classNames(
                  'flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-colors group',
                  onDarkPage ? 'border-white/15 hover:bg-white/10' : 'border-slate-200 hover:bg-slate-50'
                )}
              >
                <div className='w-6 h-6 rounded-full overflow-hidden bg-brand-100 flex items-center justify-center flex-shrink-0'>
                  {currentUser.avatar ? (
                    <img
                      src={normalizeImageUrl(currentUser.avatar)}
                      alt={username}
                      className='w-full h-full object-cover'
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  ) : (
                    <span className='text-[10px] font-bold text-brand-700'>{initials}</span>
                  )}
                </div>
                <span className={classNames(
                  'text-sm font-medium hidden sm:block',
                  onDarkPage ? 'text-slate-200' : 'text-slate-700'
                )}>{username.split(' ')[0]}</span>
                {isCrmUser && (
                  <span className='hidden sm:flex items-center gap-1 text-xs font-semibold text-brand-600'>{t('minimalHeader.crm')}<HiChevronRight className='w-3 h-3' />
                  </span>
                )}
              </Link>
            ) : (
              <Link
                to='/sign-in'
                className='px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors'
              >{t('minimalHeader.signIn')}</Link>
            )}

            {/* Mobile menu toggle */}
            <button
              type='button'
              onClick={() => setMenuOpen((o) => !o)}
              className='md:hidden p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors'
              aria-label={t('minimalHeader.toggleMenu')}
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
            <HiHome className='w-4 h-4' />{t('minimalHeader.home')}</Link>
          {currentUser && (
            <Link
              to='/search'
              onClick={() => setMenuOpen(false)}
              className={classNames(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                isActive('/search') ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'
              )}
            >
              <HiSearch className='w-4 h-4' />{t('minimalHeader.browseProperties')}</Link>
          )}
          {isCrmUser && (
            <Link
              to='/dashboard'
              onClick={() => setMenuOpen(false)}
              className={classNames(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors',
                isActive('/dashboard') ? 'bg-brand-50 text-brand-700' : 'text-slate-700 hover:bg-slate-50'
              )}
            >
              <HiViewGrid className='w-4 h-4' />{t('minimalHeader.dashboard')}</Link>
          )}
          {currentUser && !isCrmUser && (
            <Link
              to='/profile'
              onClick={() => setMenuOpen(false)}
              className='flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors'
            >{t('minimalHeader.profile')}</Link>
          )}
          {!currentUser && (
            <div className='pt-2'>
              <Link
                to='/sign-in'
                onClick={() => setMenuOpen(false)}
                className='flex items-center justify-center w-full px-4 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors'
              >{t('minimalHeader.signIn')}</Link>
            </div>
          )}
        </div>
      )}
    </header>
  );
}

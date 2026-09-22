import { useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import MinimalHeader from '../components/MinimalHeader';
import Footer from '../components/Footer';
import { useTranslation } from 'react-i18next';

const CRM_PREFIXES = [
  '/dashboard', '/portfolio', '/analytics',
  '/properties', '/create-listing', '/update-listing/',
  '/categories', '/category/', '/dynamic-listings/',
  '/clients', '/contacts', '/owners',
  '/pipeline', '/deals',
  '/calendar', '/tasks',
  '/buyer-requirements', '/buyers',
  '/transactions',
  '/client-reports', '/reports',
  '/profile', '/settings', '/messages', '/notifications', '/admin',
  // The platform console lives inside CrmShell like the rest, and was missing
  // here — so it rendered MinimalHeader and the Footer on top of the shell,
  // two stacked headers with the sidebar underneath the outer one.
  '/platform',
];

/**
 * NOTE: this list duplicates which routes sit inside CrmShell in AppRoutes, so
 * it drifts every time a CRM screen is added — that is exactly how /platform
 * came to be missing. Worth deriving from the route table instead.
 */

/**
 * Pages reached by token alone, by people who have no account.
 *
 * These get no chrome at all — no site header, no footer. Both are deliberately
 * dead ends: a buyer sent a shortlist should see the shortlist, and someone
 * setting up an account should see that and nothing else. Wrapping them in the
 * marketing header and a footer full of links (and a newsletter signup) hands a
 * stranger a way into the rest of the product, which is exactly what these
 * pages are documented as not doing.
 */
// Pages that sit in the CRM layout for agency staff only; everyone else sees
// them with the public header and footer.
const STAFF_PREFIXES = ['/listing/'];

const BARE_PREFIXES = ['/s/', '/invite/'];

export default function AppShell({ children }) {
  const { t } = useTranslation();
  const location = useLocation();

  const isBareRoute = BARE_PREFIXES.some((p) => location.pathname.startsWith(p));

  const { currentUser } = useSelector((state) => state.user);
  const isStaff = currentUser?.role === 'admin' || currentUser?.role === 'employee';

  const isCrmRoute =
    CRM_PREFIXES.some((p) => location.pathname === p || location.pathname.startsWith(p)) ||
    (isStaff && STAFF_PREFIXES.some((p) => location.pathname.startsWith(p)));

  /**
   * The landing page is theme-locked dark and its header floats transparently
   * over the hero. Reserving the usual 56px header strip here would paint a
   * light band above that hero, and the page background would show light-grey
   * on overscroll, so "/" opts out of both.
   */
  const isLandingRoute = location.pathname === '/';

  if (isBareRoute) return <>{children}</>;

  return (
    <>
      {/* First tab stop on the page: lets a keyboard user step over the header
          nav straight into content. Invisible until focused. */}
      <a href='#main-content' className='skip-link'>{t('appShell.skipToContent')}</a>
      {!isCrmRoute && <MinimalHeader />}
      <div
        id='main-content'
        tabIndex={-1}
        className={[
          isCrmRoute || isLandingRoute ? '' : 'pt-14',
          isLandingRoute ? 'bg-slate-950' : 'bg-slate-50',
          'min-h-screen focus:outline-none',
        ].join(' ')}
      >
        {children}
      </div>
      {!isCrmRoute && <Footer />}
    </>
  );
}

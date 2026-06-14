import { useLocation } from 'react-router-dom';
import MinimalHeader from '../components/MinimalHeader';
import Footer from '../components/Footer';

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
  '/profile', '/settings', '/messages', '/admin',
];

export default function AppShell({ children }) {
  const location = useLocation();

  const isCrmRoute = CRM_PREFIXES.some(
    (p) => location.pathname === p || location.pathname.startsWith(p)
  );

  return (
    <>
      {!isCrmRoute && <MinimalHeader />}
      <div className={`${isCrmRoute ? '' : 'pt-14'} min-h-screen bg-slate-50`}>
        {children}
      </div>
      {!isCrmRoute && <Footer />}
    </>
  );
}

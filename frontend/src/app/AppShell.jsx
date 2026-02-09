import { useLocation } from 'react-router-dom';

import Header from '../components/Header';
import Footer from '../components/Footer';
import { useUiMode } from '../contexts/useUiMode';
import MinimalHeader from '../components/MinimalHeader';

export default function AppShell({ children }) {
  const location = useLocation();
  const { isMinimal } = useUiMode();

  const noFooterPages = ['/sign-in', '/sign-up', '/forgot-password', '/unauthorized'];
  const crmPrefixes = ['/dashboard', '/properties', '/clients', '/deals', '/calendar', '/buyer-requirements'];
  const isCrmRoute = crmPrefixes.some((p) => location.pathname === p || location.pathname.startsWith(`${p}/`));
  const showFooter = (!isMinimal || !isCrmRoute) && !noFooterPages.includes(location.pathname);

  return (
    <>
      {isMinimal ? (!isCrmRoute && <MinimalHeader />) : <Header />}
      <div className={`${isMinimal && isCrmRoute ? '' : 'pt-16'} min-h-screen bg-gradient-to-b from-slate-50 to-white`}>
        {children}
      </div>
      {!isMinimal && showFooter && <Footer />}
    </>
  );
}

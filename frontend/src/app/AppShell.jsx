import { useLocation } from 'react-router-dom';

import Header from '../components/Header';
import Footer from '../components/Footer';

export default function AppShell({ children }) {
  const location = useLocation();

  const noFooterPages = ['/sign-in', '/sign-up', '/forgot-password', '/unauthorized'];
  const showFooter = !noFooterPages.includes(location.pathname);

  return (
    <>
      <Header />
      <div className='pt-16 min-h-screen bg-gradient-to-b from-slate-50 to-white'>
        {children}
      </div>
      {showFooter && <Footer />}
    </>
  );
}

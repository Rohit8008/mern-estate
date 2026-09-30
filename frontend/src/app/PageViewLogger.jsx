import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { logPageView } from '../utils/sentry';

// One frontend_logs line per screen. With the session id on every entry, an
// error report can be read alongside the screens that led up to it. Path only:
// the query string holds search terms and filters.
export default function PageViewLogger() {
  const { pathname } = useLocation();
  useEffect(() => { logPageView(pathname); }, [pathname]);
  return null;
}

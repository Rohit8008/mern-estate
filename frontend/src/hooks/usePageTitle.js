import { useEffect } from 'react';

const SITE = 'Real Vista';

export default function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} — ${SITE}` : `${SITE} — CRM for real estate agencies`;
    return () => {
      document.title = `${SITE} — CRM for real estate agencies`;
    };
  }, [title]);
}

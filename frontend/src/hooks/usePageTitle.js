import { useEffect } from 'react';

const SITE = 'Real Vista';

export default function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} — ${SITE}` : `${SITE} — Find Your Perfect Property`;
    return () => {
      document.title = `${SITE} — Find Your Perfect Property`;
    };
  }, [title]);
}

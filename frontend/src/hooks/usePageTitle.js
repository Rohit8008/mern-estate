import { useEffect } from 'react';

const DEFAULT_SITE = 'Real Vista';
let siteName = DEFAULT_SITE;

/**
 * The workspace's own product name, once the tenant has loaded. Page titles
 * read it, so "Notifications — Acme Realty" survives instead of the tenant
 * provider overwriting every page title with the bare workspace name.
 */
export function setSiteName(name) {
  siteName = name || DEFAULT_SITE;
  // Bare default title (a page with no title of its own): refresh it now.
  if (/^.* — CRM for real estate agencies$/.test(document.title)) {
    document.title = `${siteName} — CRM for real estate agencies`;
  } else if (document.title.includes(' — ')) {
    document.title = `${document.title.split(' — ')[0]} — ${siteName}`;
  } else if (name) {
    document.title = siteName;
  }
}

export default function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} — ${siteName}` : `${siteName} — CRM for real estate agencies`;
    return () => {
      document.title = `${siteName} — CRM for real estate agencies`;
    };
  }, [title]);
}

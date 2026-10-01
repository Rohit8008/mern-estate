/**
 * The pages a search engine may index, and the words it should see for each.
 *
 * ONE list, read by three things: the build (per-page HTML, sitemap.xml,
 * robots.txt — see vite-plugin-seo.mjs), the runtime (RouteSeo, which keeps the
 * tags right after client-side navigation) and nothing else. Anything NOT
 * listed here is private or transient and is served `noindex`: the property
 * book is not public (CLAUDE.md), so a listing, search or CRM route must never
 * become indexable by being forgotten here.
 *
 * Claims policy applies: descriptions say what the product does, with no
 * statistics, customer counts or endorsements.
 */

export const DEFAULT_SITE_URL = 'https://realvista.duckdns.org';

export const SITE = {
  name: 'Real Vista',
  locale: 'en_IN',
  image: '/og-image.png',
  imageAlt: 'Real Vista — CRM for real estate agencies',
};

export const HOME_TITLE = 'Real Vista — CRM for real estate agencies';
export const HOME_DESCRIPTION =
  'Real Vista is a CRM for real estate agencies in India: leads, property owners, listings, deals and paperwork in one workspace, with share links you control.';

export const PUBLIC_PAGES = [
  {
    path: '/',
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    heading: 'CRM for real estate agencies',
    changefreq: 'weekly',
    priority: '1.0',
    faq: true,
  },
  {
    path: '/download',
    title: 'Download the Android app — Real Vista',
    description:
      'Install the Real Vista Android app for your agency team: leads, follow-ups, properties and messages on your phone.',
    heading: 'Real Vista for Android',
    changefreq: 'monthly',
    priority: '0.6',
  },
  {
    path: '/privacy',
    title: 'Privacy Policy — Real Vista',
    description: 'What personal data Real Vista collects, why, who receives it, how long it is kept and how to exercise your rights.',
    heading: 'Privacy Policy',
    changefreq: 'yearly',
    priority: '0.3',
  },
  {
    path: '/terms',
    title: 'Terms of Service — Real Vista',
    description: 'The agreement between Real Vista and the agencies that use it.',
    heading: 'Terms of Service',
    changefreq: 'yearly',
    priority: '0.3',
  },
  {
    path: '/cookies',
    title: 'Cookie Policy — Real Vista',
    description: 'The cookies and device storage Real Vista uses, and what each one is for.',
    heading: 'Cookie Policy',
    changefreq: 'yearly',
    priority: '0.3',
  },
  {
    path: '/refunds',
    title: 'Refund and Cancellation Policy — Real Vista',
    description: 'How cancellation and refunds work for a Real Vista workspace.',
    heading: 'Refund and Cancellation Policy',
    changefreq: 'yearly',
    priority: '0.3',
  },
];

/** Paths crawlers are told to stay out of. Sign-in screens add nothing to a result page. */
export const DISALLOWED = [
  '/api/',
  '/uploads/',
  '/app/',
  '/s/',
  '/invite/',
  '/unsubscribe/',
  '/sign-in',
  '/sign-up',
  '/forgot-password',
  '/password-reset',
  '/dashboard',
  '/analytics',
  '/portfolio',
  '/properties',
  '/owners',
  '/clients',
  '/pipeline',
  '/buyers',
  '/tasks',
  '/calendar',
  '/transactions',
  '/reports',
  '/categories',
  '/settings',
  '/platform',
  '/admin',
  '/messages',
  '/notifications',
  '/profile',
  '/search',
  '/listing/',
  '/user/',
  '/create-listing',
  '/update-listing/',
];

export const pageFor = (pathname) => {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return PUBLIC_PAGES.find((p) => p.path === clean) || null;
};

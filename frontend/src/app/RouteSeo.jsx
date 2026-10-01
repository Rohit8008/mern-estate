import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { pageFor, SITE } from '../../seo/pages.mjs';

/**
 * Keeps the head honest after client-side navigation.
 *
 * The build already writes the right tags into each public page's HTML. This
 * covers the other half: a crawler that runs JavaScript, and a visitor moving
 * between pages. Public pages (seo/pages.mjs) are indexable with their own
 * canonical and social tags; EVERYTHING else is `noindex, nofollow` — the
 * property book and the CRM are not public, and a route absent from the list
 * must fail closed rather than open.
 */

function meta(selector, attrs) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement(selector.startsWith('link') ? 'link' : 'meta');
    document.head.appendChild(el);
  }
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
}

export default function RouteSeo() {
  const { pathname } = useLocation();

  useEffect(() => {
    const page = pageFor(pathname);
    const origin = window.location.origin;

    if (!page) {
      meta('meta[name="robots"]', { name: 'robots', content: 'noindex, nofollow' });
      document.head.querySelector('link[rel="canonical"]')?.remove();
      return;
    }

    const url = origin + (page.path === '/' ? '/' : page.path);
    meta('meta[name="robots"]', { name: 'robots', content: 'index, follow, max-image-preview:large' });
    meta('link[rel="canonical"]', { rel: 'canonical', href: url });
    meta('meta[name="description"]', { name: 'description', content: page.description });
    meta('meta[property="og:title"]', { property: 'og:title', content: page.title });
    meta('meta[property="og:description"]', { property: 'og:description', content: page.description });
    meta('meta[property="og:url"]', { property: 'og:url', content: url });
    meta('meta[property="og:image"]', { property: 'og:image', content: origin + SITE.image });
    meta('meta[name="twitter:title"]', { name: 'twitter:title', content: page.title });
    meta('meta[name="twitter:description"]', { name: 'twitter:description', content: page.description });
  }, [pathname]);

  return null;
}

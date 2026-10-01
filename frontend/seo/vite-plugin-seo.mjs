import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_SITE_URL, DISALLOWED, PUBLIC_PAGES, SITE } from './pages.mjs';

/**
 * Build-time SEO.
 *
 * A single-page app ships one index.html, so a crawler that does not run
 * JavaScript — most social-card scrapers, many search bots — sees the home
 * page's tags on every URL. This writes a real HTML file per public page with
 * its own title, description, canonical, social tags and a readable fallback,
 * plus sitemap.xml and robots.txt with the site's absolute address. The app
 * still boots on top and takes over, as before.
 */

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const jsonLd = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;

function siteUrl(env) {
  return String(env.VITE_SITE_URL || process.env.VITE_SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, '');
}

function faqEntries(root) {
  try {
    const en = JSON.parse(fs.readFileSync(path.join(root, 'src/i18n/locales/en.json'), 'utf8'));
    const faq = en?.landing?.faq || {};
    return ['howMany', 'otherAgency', 'spreadsheets', 'leaving']
      .map((k) => faq[k])
      .filter((x) => x?.q && x?.a)
      .map((x) => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: x.a } }));
  } catch {
    return [];
  }
}

/** Swap the head tags of the built index.html for one page's values. */
function renderPage(html, page, base, extraLd = '') {
  const url = base + (page.path === '/' ? '/' : page.path);
  const set = (re, replacement) => {
    html = re.test(html) ? html.replace(re, replacement) : html;
  };
  set(/<title>[\s\S]*?<\/title>/, `<title>${esc(page.title)}</title>`);
  set(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(page.description)}" />`);
  set(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${esc(url)}" />`);
  set(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${esc(page.title)}" />`);
  set(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${esc(page.description)}" />`);
  set(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${esc(url)}" />`);
  set(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${esc(page.title)}" />`);
  set(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${esc(page.description)}" />`);

  if (extraLd) html = html.replace('</head>', `  ${extraLd}\n</head>`);

  // Readable without JavaScript. React replaces #root's contents when it mounts.
  const fallback =
    `<noscript><main style="max-width:42rem;margin:4rem auto;padding:0 1rem;font-family:system-ui,sans-serif">` +
    `<h1>${esc(page.heading || page.title)}</h1><p>${esc(page.description)}</p>` +
    `<p><a href="/">Real Vista</a> · ${PUBLIC_PAGES.filter((p) => p.path !== '/' && p.path !== page.path)
      .map((p) => `<a href="${p.path}">${esc(p.heading)}</a>`)
      .join(' · ')}</p></main></noscript>`;
  return html.replace('<div id="root"></div>', `<div id="root"></div>\n  ${fallback}`);
}

export default function seoPlugin() {
  let root = process.cwd();
  let env = {};
  let outDir = 'dist';

  return [
    {
      // Fill the site address into index.html's absolute URLs.
      name: 'seo-html',
      // 'pre': Vite itself reads %NAME% as an env reference and chokes on a
      // percent sign in a URL, so the placeholder has no percent signs.
      transformIndexHtml: {
        order: 'pre',
        handler(html) {
          return html.replace(/__SITE_URL__/g, siteUrl(env));
        },
      },
      configResolved(config) {
        root = config.root;
        env = config.env || {};
        outDir = config.build.outDir;
      },
    },
    {
      name: 'seo-files',
      apply: 'build',
      enforce: 'post',
      closeBundle() {
        const base = siteUrl(env);
        const dist = path.resolve(root, outDir);
        const indexPath = path.join(dist, 'index.html');
        if (!fs.existsSync(indexPath)) return;
        const shell = fs.readFileSync(indexPath, 'utf8');

        const faq = faqEntries(root);
        for (const page of PUBLIC_PAGES) {
          if (page.path === '/') continue; // index.html is already the home page
          const ld = jsonLd({
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: page.title,
            description: page.description,
            url: base + page.path,
            isPartOf: { '@type': 'WebSite', name: SITE.name, url: base },
          });
          const dir = path.join(dist, page.path.replace(/^\//, ''));
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, 'index.html'), renderPage(shell, page, base, ld));
        }

        // The home page also gets its fallback and the FAQ the page itself shows.
        const home = PUBLIC_PAGES.find((p) => p.path === '/');
        const faqLd = faq.length ? jsonLd({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq }) : '';
        fs.writeFileSync(indexPath, renderPage(shell, home, base, faqLd));

        const lastmod = new Date().toISOString().slice(0, 10);
        const sitemap =
          `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
          PUBLIC_PAGES.map(
            (p) =>
              `  <url><loc>${base}${p.path === '/' ? '/' : p.path}</loc><lastmod>${lastmod}</lastmod>` +
              `<changefreq>${p.changefreq}</changefreq><priority>${p.priority}</priority></url>`
          ).join('\n') +
          `\n</urlset>\n`;
        fs.writeFileSync(path.join(dist, 'sitemap.xml'), sitemap);

        const robots =
          `User-agent: *\nAllow: /\n` +
          DISALLOWED.map((d) => `Disallow: ${d}`).join('\n') +
          `\n\nSitemap: ${base}/sitemap.xml\n`;
        fs.writeFileSync(path.join(dist, 'robots.txt'), robots);
      },
    },
  ];
}

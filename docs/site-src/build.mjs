/**
 * Builds the docs site:  node docs/site-src/build.mjs   (npm run docs:site)
 *
 *   pages/*.html  hand-written fragments  ->  site/<slug>.html
 *   ../openapi.json                       ->  site/api/<tag>.html   (never hand-edited)
 *
 * A fragment starts with a comment carrying `title:` and `description:`; the
 * layout adds the <h1>, sidebar, "on this page" list, search and prev/next.
 * The build fails on a nav entry with no page and on a broken internal link,
 * so a renamed page cannot quietly strand the pages that point at it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NAV } from './nav.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', 'site');
const pagesDir = path.join(here, 'pages');
const openapi = JSON.parse(fs.readFileSync(path.join(here, '..', 'openapi.json'), 'utf8'));

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slug = (s) => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const strip = (h) => h.replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ').trim();

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'api'), { recursive: true });
fs.mkdirSync(path.join(out, 'assets'), { recursive: true });
for (const f of fs.readdirSync(path.join(here, 'assets'))) fs.copyFileSync(path.join(here, 'assets', f), path.join(out, 'assets', f));

// ── API reference, generated ────────────────────────────────────────────────
const tags = new Map();
for (const [p, ops] of Object.entries(openapi.paths)) {
  for (const [method, op] of Object.entries(ops)) {
    const tag = (op.tags || ['other'])[0];
    if (!tags.has(tag)) tags.set(tag, []);
    tags.get(tag).push({ path: p, method, op });
  }
}
const sortedTags = [...tags.keys()].sort();

function schemaRows(schema, prefix = '') {
  if (!schema || schema.type !== 'object' || !schema.properties) return [];
  const req = new Set(schema.required || []);
  return Object.entries(schema.properties).flatMap(([name, s]) => {
    const type = s.type === 'array' ? `array<${s.items?.type || 'object'}>` : s.type || (s.oneOf ? 'one of' : 'any');
    const extra = [s.format, s.enum && `one of: ${s.enum.join(', ')}`, s.maxLength && `max ${s.maxLength}`, s.minimum != null && `min ${s.minimum}`, s.maximum != null && `max ${s.maximum}`]
      .filter(Boolean).join('; ');
    const row = [`<tr><td><code>${esc(prefix + name)}</code></td><td>${esc(type)}</td><td>${req.has(name) ? 'yes' : ''}</td><td>${esc(extra || s.description || '')}</td></tr>`];
    return row.concat(s.type === 'object' ? schemaRows(s, `${prefix}${name}.`) : []);
  });
}

function endpoint({ path: p, method, op }) {
  const desc = op.description || '';
  const m = desc.match(/^(Public|Admin|Platform operator|Session)?:?\s*(.*)$/s);
  const kind = op.security && op.security.length === 0 ? 'public' : /^Admin/i.test(desc) ? 'admin' : 'session';
  const label = { public: 'Public', admin: 'Admin', session: 'Session' }[kind];
  const params = (op.parameters || []).filter((x) => x.name !== 'X-CSRF-Token');
  const csrf = (op.parameters || []).some((x) => x.name === 'X-CSRF-Token');
  const body = op.requestBody?.content?.['application/json']?.schema;
  const rows = schemaRows(body);
  const id = slug(`${method}-${p}`);
  return `<section class="endpoint" id="${id}">
<h3><span class="method ${method}">${method.toUpperCase()}</span>${esc(p)}<span class="badge ${kind}">${label}</span></h3>
${m?.[2] ? `<p>${esc(m[2])}</p>` : ''}
${csrf ? '<p>Sends <code>X-CSRF-Token</code> (from <code>GET /api/auth/csrf</code>) because it changes data.</p>' : ''}
${params.length ? `<h4>Parameters</h4><table><tr><th>Name</th><th>In</th><th>Type</th><th>Required</th></tr>${params.map((x) => `<tr><td><code>${esc(x.name)}</code></td><td>${x.in}</td><td>${esc(x.schema?.type || '')}</td><td>${x.required ? 'yes' : ''}</td></tr>`).join('')}</table>` : ''}
${rows.length ? `<h4>Body (JSON)</h4><table><tr><th>Field</th><th>Type</th><th>Required</th><th>Notes</th></tr>${rows.join('')}</table>` : body ? '<h4>Body (JSON)</h4><p>Free-form object; the controller reads the fields it needs.</p>' : ''}
</section>`;
}

// ── Page registry ───────────────────────────────────────────────────────────
const pages = []; // { slug, title, section, html, desc, generated }
const missing = [];
for (const { section, pages: list } of NAV) {
  for (const [s, title] of list) {
    if (s === 'api/index') {
      const cards = sortedTags.map((t) => `<a class="card" href="${t}.html"><b>${esc(t)}</b><span>${tags.get(t).length} endpoint${tags.get(t).length > 1 ? 's' : ''}</span></a>`).join('');
      pages.push({
        slug: 'api/index', title, section, desc: `${Object.keys(openapi.paths).length} paths across ${sortedTags.length} areas, generated from the live router and its validation schemas.`,
        html: `<div class="note"><p>This reference is generated from the running router (<code>npm run docs:openapi</code> then <code>npm run docs:site</code>). Read <a href="../api-overview.html">API conventions</a> first: every request is scoped to a workspace, mutating calls need a CSRF token, and every error has the same shape.</p></div><h2>Areas</h2><div class="cards">${cards}</div>`,
        generated: true,
      });
      for (const t of sortedTags) {
        pages.push({
          slug: `api/${t}`, title: t, section: 'API reference', desc: `${tags.get(t).length} endpoints under /api/${t}.`, hidden: true, generated: true,
          html: `<h2 id="endpoints">Endpoints</h2>${tags.get(t).map(endpoint).join('\n')}`,
        });
      }
      continue;
    }
    const f = path.join(pagesDir, `${s}.html`);
    if (!fs.existsSync(f)) { missing.push(s); continue; }
    const raw = fs.readFileSync(f, 'utf8');
    const meta = raw.match(/^\s*<!--([\s\S]*?)-->/);
    const get = (k) => meta?.[1].match(new RegExp(`^\\s*${k}:\\s*(.+)$`, 'm'))?.[1].trim();
    pages.push({ slug: s, title: get('title') || title, section, desc: get('description') || '', html: raw.replace(/^\s*<!--[\s\S]*?-->/, '') });
  }
}
if (missing.length) { console.error('Nav entries with no page:', missing.join(', ')); process.exit(1); }

const nav = pages.filter((p) => !p.hidden);

function layout(p, i) {
  const depth = p.slug.split('/').length - 1;
  const root = '../'.repeat(depth);
  // ids on h2/h3 and the "on this page" list
  const heads = [];
  const html = p.html.replace(/<h([23])([^>]*)>([\s\S]*?)<\/h\1>/g, (all, lvl, attrs, inner) => {
    const id = attrs.match(/id="([^"]+)"/)?.[1] || slug(inner);
    heads.push({ lvl, id, text: strip(inner.replace(/<span class="badge[\s\S]*?<\/span>/g, '')) });
    return `<h${lvl}${attrs.includes('id=') ? attrs : `${attrs} id="${id}"`}>${inner}</h${lvl}>`;
  });
  p.headings = heads.map((h) => h.text);
  p.text = strip(html).slice(0, 6000);

  const side = NAV.map(({ section, pages: list }) => {
    const items = list.map(([s, t]) => {
      const href = root + (s === 'api/index' ? 'api/index.html' : `${s}.html`);
      const active = s === p.slug || (s === 'api/index' && p.slug.startsWith('api/'));
      return `<a href="${href}"${active ? ' class="active"' : ''}>${esc(t)}</a>`;
    }).join('');
    return `<h4>${esc(section)}</h4>${items}`;
  }).join('');
  const toc = heads.length > 1 ? `<nav class="toc" aria-label="On this page"><b>On this page</b>${heads.slice(0, 60).map((h) => `<a class="h${h.lvl}" href="#${h.id}">${esc(h.text.slice(0, 48))}</a>`).join('')}</nav>` : '';
  const prev = nav[i - 1], next = nav[i + 1];
  const link = (q, dir) => q ? `<a href="${root}${q.slug === 'api/index' ? 'api/index' : q.slug}.html"><small>${dir}</small>${esc(q.title)}</a>` : '<span></span>';
  const generatedNote = p.slug.startsWith('api/') && p.slug !== 'api/index' ? `<p class="lede"><a href="index.html">API reference</a> › ${esc(p.title)}. ${esc(p.desc)}</p>` : p.desc ? `<p class="lede">${esc(p.desc)}</p>` : '';
  return `<!DOCTYPE html>
<html lang="en" data-root="${root}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(p.title)} — Real Vista Docs</title>
<meta name="description" content="${esc(p.desc)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${root}assets/docs.css">
</head>
<body>
<header class="header">
<button class="menu-btn" aria-label="Menu">&#9776;</button>
<a class="logo" href="${root}index.html">Real Vista<span>Docs</span></a>
<div class="search"><input id="q" type="search" placeholder="Search docs  ( / )" autocomplete="off" aria-label="Search the docs"><div id="results" class="results"></div></div>
</header>
<aside class="sidebar">${side}</aside>
<div class="main"><article>
<h1>${esc(p.title)}</h1>
${generatedNote}
${html}
<div class="pager">${link(prev, 'Previous')}${link(next, 'Next')}</div>
<footer>Real Vista documentation. Source in <code>docs/site-src</code>; the API reference is generated from the code.</footer>
</article>${toc}</div>
<script src="${root}assets/docs.js"></script>
</body>
</html>`;
}

pages.forEach((p) => {
  const i = nav.indexOf(p);
  const file = path.join(out, `${p.slug}.html`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, layout(p, i));
});

fs.writeFileSync(
  path.join(out, 'search-index.json'),
  JSON.stringify(pages.map((p) => ({ url: `${p.slug}.html`, title: p.title, section: p.section, headings: p.headings || [], text: p.text || '' })))
);

// ── Link check ──────────────────────────────────────────────────────────────
const known = new Set(pages.map((p) => `${p.slug}.html`));
let broken = 0;
for (const p of pages) {
  const file = path.join(out, `${p.slug}.html`);
  const dir = path.dirname(p.slug);
  for (const m of fs.readFileSync(file, 'utf8').matchAll(/href="([^"#:]+?\.html)(#[^"]*)?"/g)) {
    const target = path.posix.normalize(path.posix.join(dir === '.' ? '' : dir, m[1]));
    if (!known.has(target)) { console.error(`Broken link in ${p.slug}: ${m[1]}`); broken++; }
  }
}
if (broken) process.exit(1);
console.log(`Built ${pages.length} pages (${pages.filter((p) => p.generated).length} generated) into ${path.relative(process.cwd(), out)}`);

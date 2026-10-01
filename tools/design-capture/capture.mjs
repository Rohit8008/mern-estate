#!/usr/bin/env node
/**
 * Design capture — signs in to a web app and records, for every page it can
 * reach by following links: desktop + phone screenshots, the rendered HTML,
 * the stylesheets, and the design tokens actually in use (computed colours,
 * font families/sizes/weights, radii, shadows, spacing).
 *
 * READ-ONLY: it only navigates by URL. It never clicks buttons, submits
 * forms (other than sign-in) or sends anything but GETs after login.
 *
 * Run on your own machine:
 *   cd tools/design-capture
 *   npm i playwright && npx playwright install chromium
 *   CAPTURE_URL=https://platform-stg.salescodeai.com/auth \
 *   CAPTURE_ACCOUNT=... CAPTURE_USER=... CAPTURE_PASS=... \
 *   CAPTURE_PATHS=/dashboard,/orders   # optional: routes reached by buttons
 *   node capture.mjs
 * Output: ./out/ — zip it and share it (it contains no credentials).
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const START = process.env.CAPTURE_URL;
const MAX_PAGES = Number(process.env.CAPTURE_MAX_PAGES || 60);
const OUT = path.resolve('out');
if (!START || !process.env.CAPTURE_USER || !process.env.CAPTURE_PASS) {
  console.error('Set CAPTURE_URL, CAPTURE_USER, CAPTURE_PASS (and CAPTURE_ACCOUNT if the form has one).');
  process.exit(1);
}
const origin = new URL(START).origin;
// Never follow links that change state.
const UNSAFE = /logout|sign-?out|delete|remove|reset|deactivate|revoke/i;

const slug = (u) => (new URL(u).pathname + new URL(u).hash).replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root';

function tokensScript() {
  const count = (m, k) => { if (k && k !== 'none' && k !== 'normal' && k !== '0px' && k !== 'rgba(0, 0, 0, 0)') m[k] = (m[k] || 0) + 1; };
  const t = { color: {}, background: {}, border: {}, fontFamily: {}, fontSize: {}, fontWeight: {}, lineHeight: {}, letterSpacing: {}, radius: {}, shadow: {}, padding: {}, gap: {} };
  const comps = { buttons: [], inputs: [], headings: [], tables: 0, cards: 0 };
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const s = getComputedStyle(el);
    count(t.color, s.color); count(t.background, s.backgroundColor); count(t.border, s.borderTopColor);
    count(t.fontFamily, s.fontFamily); count(t.fontSize, s.fontSize); count(t.fontWeight, s.fontWeight);
    count(t.lineHeight, s.lineHeight); count(t.letterSpacing, s.letterSpacing); count(t.radius, s.borderTopLeftRadius);
    count(t.shadow, s.boxShadow); count(t.padding, s.padding); count(t.gap, s.gap);
    const pick = () => ({ text: (el.innerText || el.placeholder || '').trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height), font: `${s.fontWeight} ${s.fontSize}/${s.lineHeight} ${s.fontFamily.split(',')[0]}`, color: s.color, bg: s.backgroundColor, border: `${s.borderTopWidth} ${s.borderTopColor}`, radius: s.borderTopLeftRadius, padding: s.padding, shadow: s.boxShadow });
    if (el.matches('button,[role=button]') && comps.buttons.length < 25) comps.buttons.push(pick());
    if (el.matches('input,select,textarea') && comps.inputs.length < 15) comps.inputs.push(pick());
    if (el.matches('h1,h2,h3,h4') && comps.headings.length < 15) comps.headings.push({ tag: el.tagName, ...pick() });
    if (el.matches('table,[role=grid]')) comps.tables++;
  }
  const top = (m) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 25);
  const cssVars = {};
  for (const sheet of document.styleSheets) {
    try { for (const rule of sheet.cssRules) if (rule.selectorText === ':root' || rule.selectorText?.includes('.dark')) for (const p of rule.style) if (p.startsWith('--')) cssVars[`${rule.selectorText} ${p}`] = rule.style.getPropertyValue(p).trim(); } catch { /* cross-origin sheet */ }
  }
  return { tokens: Object.fromEntries(Object.entries(t).map(([k, v]) => [k, top(v)])), components: comps, cssVars };
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const sheets = new Map();
page.on('response', async (res) => {
  if (res.request().resourceType() === 'stylesheet' && !sheets.has(res.url())) {
    try { sheets.set(res.url(), await res.text()); } catch { /* ignore */ }
  }
});

await fs.mkdir(path.join(OUT, 'pages'), { recursive: true });
await page.goto(START, { waitUntil: 'networkidle' });
await page.screenshot({ path: path.join(OUT, 'pages', '00_login.png'), fullPage: true });

// Sign in: fill by common ids/names, falling back to the form's text/password inputs in order.
const fill = async (sels, value) => { if (!value) return; for (const s of sels) { const el = await page.$(s); if (el) { await el.fill(value); return; } } };
await fill(['#account', 'input[name=account]', 'input[name=lob]', 'input[name=tenant]'], process.env.CAPTURE_ACCOUNT);
await fill(['#username', 'input[name=username]', 'input[type=email]', 'input[name=email]'], process.env.CAPTURE_USER);
await fill(['#password', 'input[type=password]'], process.env.CAPTURE_PASS);
await Promise.all([page.waitForLoadState('networkidle').catch(() => {}), page.click('button[type=submit]')]);
await page.waitForTimeout(6000);
if (/auth|login|sign-?in/i.test(page.url())) console.warn('Still on the sign-in page — check the credentials:', page.url());

// Single-page apps often navigate with buttons, not links: list extra paths
// as CAPTURE_PATHS=/dashboard,/orders,/reports to make sure they are visited.
const extra = (process.env.CAPTURE_PATHS || '').split(',').map((x) => x.trim()).filter(Boolean).map((x) => new URL(x, origin).href);
const queue = [page.url(), ...extra];
const seen = new Set();
const index = [];
while (queue.length && seen.size < MAX_PAGES) {
  const url = queue.shift();
  const key = url.split('?')[0];
  if (seen.has(key)) continue;
  seen.add(key);
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(1500);
    const name = String(seen.size).padStart(2, '0') + '_' + slug(url);
    await page.screenshot({ path: path.join(OUT, 'pages', `${name}.png`), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, 'pages', `${name}.mobile.png`), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await fs.writeFile(path.join(OUT, 'pages', `${name}.html`), await page.content());
    const data = await page.evaluate(tokensScript);
    await fs.writeFile(path.join(OUT, 'pages', `${name}.tokens.json`), JSON.stringify(data, null, 1));
    index.push({ name, url, title: await page.title() });
    console.log('captured', url);
    const links = await page.$$eval('a[href]', (as) => as.map((a) => a.href));
    for (const l of links) {
      if (!l.startsWith(origin) || UNSAFE.test(l) || seen.has(l.split('?')[0])) continue;
      queue.push(l);
    }
  } catch (e) {
    console.warn('skip', url, e.message);
  }
}

await fs.mkdir(path.join(OUT, 'css'), { recursive: true });
let i = 0;
for (const [url, text] of sheets) await fs.writeFile(path.join(OUT, 'css', `${String(i++).padStart(2, '0')}_${slug(url).slice(-60)}.css`), `/* ${url} */\n${text}`);
await fs.writeFile(path.join(OUT, 'index.json'), JSON.stringify(index, null, 1));
await browser.close();
console.log(`Done: ${index.length} pages, ${sheets.size} stylesheets in ${OUT}`);

/**
 * One look for every email the product sends.
 *
 * Invitations, password codes, notifications, demo requests and report
 * covers were each hand-built with their own fonts, widths and colours. This
 * renders them all from the same shell, and produces the plain-text twin from
 * the same content so the two never drift apart.
 *
 * Every value is HTML-escaped here; callers pass plain strings.
 */

export const PRODUCT_NAME = 'Real Vista';
const DEFAULT_ACCENT = '#2b6faa';

export const escapeHtml = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Only a plain 6-digit hex colour is allowed into a style attribute. */
export function safeAccent(accent) {
  return /^#[0-9a-f]{6}$/i.test(accent || '') ? accent : DEFAULT_ACCENT;
}

/**
 * @param {object} o
 * @param {string} [o.brand]      workspace / product name shown in the header
 * @param {string} [o.accent]     brand colour (#rrggbb)
 * @param {string} [o.preheader]  inbox preview line
 * @param {string} o.heading
 * @param {string} [o.greeting]   e.g. "Hi Asha,"
 * @param {string[]} [o.paragraphs]
 * @param {string} [o.code]       a one-time code, shown large
 * @param {Array<[string,string]>} [o.details] label/value rows
 * @param {{label: string, url: string}} [o.button]
 * @param {string[]} [o.notes]    small print under the main content
 * @param {string} [o.footer]     last line, e.g. why they got this
 * @returns {{html: string, text: string}}
 */
export function renderEmail({
  brand = PRODUCT_NAME,
  accent,
  preheader = '',
  heading,
  greeting = '',
  paragraphs = [],
  code = '',
  details = [],
  button = null,
  notes = [],
  footer = '',
}) {
  const e = escapeHtml;
  const colour = safeAccent(accent);

  const text = [
    greeting,
    greeting ? '' : null,
    ...paragraphs.flatMap((p) => [p, '']),
    code ? `Your code: ${code}\n` : null,
    ...details.map(([k, v]) => `${k}: ${v || '-'}`),
    details.length ? '' : null,
    button ? `${button.label}: ${button.url}\n` : null,
    ...notes.flatMap((n) => [n, '']),
    footer ? `-- \n${footer}` : `-- \n${brand}`,
  ]
    .filter((l) => l !== null)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const para = (p, first) =>
    `<p style="margin:${first ? 14 : 12}px 0 0;font-size:15px;line-height:1.6;color:#334155">${e(p)}</p>`;

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f3f5f4;font-family:${FONT};color:#0f172a">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${e(preheader || heading)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f4;padding:32px 16px">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0">
      <tr><td style="padding:28px 32px 0">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="width:36px;height:36px;border-radius:10px;background:${colour};color:#ffffff;font-weight:700;font-size:16px;text-align:center;vertical-align:middle">${e(brand.charAt(0).toUpperCase())}</td>
          <td style="padding-left:10px;font-weight:700;font-size:15px">${e(brand)}</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:24px 32px 0">
        <h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:700">${e(heading)}</h1>
        ${greeting ? para(greeting, true) : ''}
        ${paragraphs.map((p, i) => para(p, !greeting && i === 0)).join('\n        ')}
        ${code ? `<div style="margin:20px 0 0;padding:16px;background:#f1f5f9;border-radius:12px;text-align:center;font-size:30px;font-weight:700;letter-spacing:8px;font-family:ui-monospace,Menlo,monospace;color:#0f172a">${e(code)}</div>` : ''}
        ${details.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;border-collapse:collapse">${details
          .map(
            ([k, v]) => `<tr>
          <td style="padding:9px 12px;background:#f8fafc;border:1px solid #e2e8f0;color:#64748b;font-size:13px;font-weight:600;width:110px;vertical-align:top">${e(k)}</td>
          <td style="padding:9px 12px;border:1px solid #e2e8f0;color:#0f172a;font-size:14px;line-height:1.5">${e(v || '—')}</td>
        </tr>`
          )
          .join('')}</table>` : ''}
      </td></tr>
      ${button ? `<tr><td style="padding:24px 32px 0">
        <a href="${e(button.url)}" style="display:inline-block;background:${colour};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 26px;border-radius:999px">${e(button.label)}</a>
        <p style="margin:14px 0 0;font-size:12.5px;line-height:1.6;color:#64748b">If the button doesn't open, paste this into your browser:<br><a href="${e(button.url)}" style="color:${colour};word-break:break-all">${e(button.url)}</a></p>
      </td></tr>` : ''}
      <tr><td style="padding:24px 32px 28px">
        <div style="padding-top:16px;border-top:1px solid #e2e8f0">
          ${notes.map((n) => `<p style="margin:0 0 8px;font-size:12.5px;line-height:1.6;color:#64748b">${e(n)}</p>`).join('\n          ')}
          <p style="margin:0;font-size:12px;line-height:1.6;color:#94a3b8">${e(footer || `Sent by ${brand}`)}</p>
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  return { html, text };
}

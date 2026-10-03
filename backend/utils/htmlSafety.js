// Small helpers for HTML that leaves the system by email.

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape text for interpolation into an HTML body. */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);
}

/**
 * Remove the parts of caller-supplied HTML that run or load code: script, style
 * (CSS exfil), iframe/object/embed/form/base/meta/link elements, inline on*
 * handlers and javascript:/data: URLs. This is a backstop for report mail, not a
 * general sanitiser — the recipient's mail client does its own filtering — and
 * it is applied repeatedly so `<scr<script>ipt>` cannot reassemble.
 */
export function stripActiveHtml(html) {
  let out = String(html ?? '');
  let prev;
  do {
    prev = out;
    out = out
      .replace(/<\s*(script|style|iframe|object|embed|form|base|meta|link)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
      .replace(/<\s*(script|style|iframe|object|embed|form|base|meta|link)\b[^>]*>/gi, '')
      .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/(href|src|action|formaction|xlink:href)\s*=\s*("|')?\s*(javascript|data|vbscript):[^"'>\s]*("|')?/gi, '$1="#"');
  } while (out !== prev);
  return out;
}

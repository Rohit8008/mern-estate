import xss from 'xss';
import EmailTemplate, { TEMPLATE_VARIABLES } from '../models/emailTemplate.model.js';
import { getTenant } from '../tenancy/tenantContext.js';
import { logger } from './logger.js';

/**
 * Rendering workspace email templates.
 *
 * Two rules make this safe to hand to a customer:
 *
 *  1. **Only named variables resolve.** `{{name}}` is looked up in a plain
 *     object built by the caller, never evaluated. There is no expression
 *     syntax, so a template cannot reach into a document, call a function or
 *     read anything the caller did not pass in.
 *  2. **The template is sanitised when saved**, not when rendered. A workspace
 *     admin writing HTML is expected; a stored `<script>` that fires in a
 *     colleague's mail client is not.
 */

/** What a template author is allowed to write. Scripts and handlers are not. */
const SANITISE_OPTIONS = {
  whiteList: {
    a: ['href', 'title', 'target', 'rel', 'style'],
    p: ['style'], div: ['style'], span: ['style'],
    h1: ['style'], h2: ['style'], h3: ['style'], h4: ['style'],
    strong: [], b: [], em: [], i: [], u: [], br: [], hr: ['style'],
    ul: ['style'], ol: ['style'], li: ['style'],
    table: ['style', 'width', 'cellpadding', 'cellspacing', 'border'],
    thead: [], tbody: [], tr: ['style'], td: ['style', 'align', 'width'], th: ['style', 'align'],
    img: ['src', 'alt', 'width', 'height', 'style'],
    blockquote: ['style'], small: [], center: [],
  },
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script', 'style'],
};

export function sanitiseTemplateHtml(html) {
  return xss(String(html || ''), SANITISE_OPTIONS);
}

/** HTML-escape an interpolated value, so data can never inject markup. */
function escapeValue(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Replace `{{name}}` with the matching value.
 *
 * An unknown name is left as written rather than blanked: a visible `{{oops}}`
 * tells the admin their template has a typo, while an empty gap looks like the
 * product lost the data.
 */
export function renderTemplate(template, values, { escape = true } = {}) {
  return String(template || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name) => {
    if (!(name in values)) return match;
    const value = values[name];
    return escape ? escapeValue(value) : String(value ?? '');
  });
}

/** The values available to every template. */
export function templateValues(extra = {}) {
  const tenant = getTenant();
  return {
    workspaceName: tenant?.branding?.productName || tenant?.name || 'your workspace',
    date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    recipientName: '',
    title: '',
    body: '',
    link: '',
    actorName: '',
    ...extra,
  };
}

/**
 * The workspace's override for `key`, or null to use the built-in wording.
 */
export async function resolveTemplate(key, values) {
  try {
    const template = await EmailTemplate.findOne({ key, isActive: true }).lean();
    if (!template) return null;

    const merged = templateValues(values);
    return {
      subject: renderTemplate(template.subject, merged),
      // Already sanitised on save; variables are escaped as they go in.
      html: renderTemplate(template.html, merged),
    };
  } catch (err) {
    // A broken template must not stop the email — fall back to the default.
    logger.error('Failed to resolve email template', { key, message: err.message });
    return null;
  }
}

export { TEMPLATE_VARIABLES };

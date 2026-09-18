import { getLocaleConfig } from './currency';

/**
 * Reaching someone on WhatsApp.
 *
 * Click-to-chat (`wa.me`) rather than the Business API: it needs no account, no
 * approval and no per-message cost, it works from desktop and mobile, and the
 * message lands in the agent's own WhatsApp so the client sees a person rather
 * than a business broadcast. For an agency where deals genuinely move over
 * WhatsApp, that is the behaviour they want.
 *
 * The trade-off, stated plainly: the agent presses send. Nothing is delivered
 * automatically and nothing is logged unless they log it, which is why
 * `whatsappHref` is paired with a "log this" callback at the call sites.
 */

/** Digits only — wa.me rejects spaces, dashes, brackets and the leading plus. */
function digitsOf(phone) {
  return String(phone || '').replace(/\D/g, '');
}

/**
 * Turn whatever an agency typed into the international form wa.me needs.
 *
 * This matters more than it looks: given a local number, WhatsApp opens an
 * empty chat with no error, so the agent sees a blank screen and blames the
 * CRM. The cases below are the ones Indian agencies actually type.
 *
 * @returns {string|null} digits with country code, or null if unusable
 */
export function toInternational(phone, dialCode) {
  const code = digitsOf(dialCode || getLocaleConfig().dialCode || '91');
  let digits = digitsOf(phone);

  if (!digits) return null;

  // "00" is the international prefix in much of the world — drop it and the
  // number is already fully qualified.
  if (digits.startsWith('00')) digits = digits.slice(2);

  // Already carries the country code.
  if (code && digits.startsWith(code) && digits.length > code.length + 5) {
    return digits;
  }

  // A national trunk prefix: "0" before a local number in India and many others.
  if (digits.startsWith('0')) digits = digits.replace(/^0+/, '');

  // Too short to be a real number even after cleaning — a extension, a typo,
  // or a landline fragment. Better to disable the button than open an empty chat.
  if (digits.length < 7) return null;

  return `${code}${digits}`;
}

/** Whether this number can be messaged at all. Drives the disabled state. */
export function canWhatsApp(phone, dialCode) {
  return toInternational(phone, dialCode) !== null;
}

/**
 * A click-to-chat URL.
 *
 * `text` is optional; when present WhatsApp pre-fills the composer, leaving the
 * agent to review and send. Encoded with encodeURIComponent so newlines and
 * emoji survive.
 */
export function whatsappHref(phone, text = '', dialCode) {
  const number = toInternational(phone, dialCode);
  if (!number) return null;

  const base = `https://wa.me/${number}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

/**
 * Fill `{{placeholders}}` in a message.
 *
 * Deliberately the same shape as the email templates, so an agency learns one
 * syntax. An unknown name is left visible rather than blanked, so a typo shows
 * up as `{{oops}}` instead of a gap the agent does not notice before sending.
 */
export function renderMessage(template, values = {}) {
  return String(template || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name) =>
    name in values ? String(values[name] ?? '') : match
  );
}

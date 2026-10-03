/**
 * Small formatters for the admin screens.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "5 min ago", "3 h ago", "2 d ago", then a plain date. */
export function timeAgo(value, now = Date.now()) {
  if (!value) return '—';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '—';
  const diff = Math.max(0, now - then);
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} h ago`;
  if (diff < 30 * DAY) return `${Math.floor(diff / DAY)} d ago`;
  return new Date(then).toLocaleDateString();
}

/**
 * "Chrome on macOS" from a raw User-Agent. The full string is 120 characters of
 * Mozilla/AppleWebKit noise that nobody reads; the browser and the system are
 * what an admin looks at when a sign-in seems wrong. Order matters: Edge and
 * Chrome both say "Chrome", Chrome and Safari both say "Safari".
 */
export function describeUserAgent(ua) {
  const s = String(ua || '');
  if (!s) return '—';
  if (/okhttp|dart:io|Dart\//i.test(s)) return 'Mobile app';
  if (/curl\//i.test(s)) return 'curl';
  if (/PostmanRuntime/i.test(s)) return 'Postman';

  const browser =
    /Edg(e|A|iOS)?\//.test(s) ? 'Edge'
    : /OPR\/|Opera/.test(s) ? 'Opera'
    : /Firefox\/|FxiOS\//.test(s) ? 'Firefox'
    : /Chrome\/|CriOS\//.test(s) ? 'Chrome'
    : /Safari\//.test(s) ? 'Safari'
    : '';

  const os =
    /Android/.test(s) ? 'Android'
    : /iPhone|iPad|iPod/.test(s) ? 'iOS'
    : /Windows/.test(s) ? 'Windows'
    : /Mac OS X|Macintosh/.test(s) ? 'macOS'
    : /Linux|X11/.test(s) ? 'Linux'
    : '';

  if (browser && os) return `${browser} on ${os}`;
  return browser || os || s.slice(0, 40);
}

/** How a security-log status reads, and the Badge variant that carries it. */
export const LOG_STATUS = {
  success: { label: 'Success', variant: 'success' },
  blocked: { label: 'Blocked', variant: 'error' },
  invalid: { label: 'Invalid', variant: 'warning' },
};

/** The reason codes the sign-in code writes, in words. Unknown ones pass through. */
export function describeReason(reason) {
  const r = String(reason || '');
  if (!r) return '—';
  if (r.startsWith('phone_changed:')) return 'Phone number changed';
  const known = {
    'Successful login': 'Signed in',
    'User not found': 'No account with that email',
  };
  return known[r] || r.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/** Account roles: how they read, and the Badge variant. `buyer` is the default. */
export const ROLE_META = {
  admin: { label: 'Admin', variant: 'error' },
  employee: { label: 'Employee', variant: 'brand' },
  seller: { label: 'Seller', variant: 'success' },
  buyer: { label: 'Buyer', variant: 'default' },
};

export const STATUS_META = {
  active: { label: 'Active', variant: 'success' },
  inactive: { label: 'Inactive', variant: 'error' },
  suspended: { label: 'Suspended', variant: 'warning' },
};

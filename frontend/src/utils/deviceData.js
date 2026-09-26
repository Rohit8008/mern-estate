/**
 * What this browser keeps about a signed-in person, and removing it at sign-out.
 *
 * An estate agency's office computer is shared. Sign-out cleared the session
 * cookies and the persisted user, but left search history (which holds client
 * names and phone numbers), a cached copy of the team list, the password-reset
 * state and — through the service worker — cached API responses and client
 * photos. The next person at the desk could read all of it.
 *
 * Kept on purpose: language, appearance and the remembered workspace slug.
 * None of those says anything about a person.
 */

const PERSONAL_LOCAL_KEYS = [
  'persist:root',
  'crm_search_history',
  'recentSearches',
  'rm_cache_roles_v2',
  'rm_cache_users_v2',
  'rm_cache_permissions_v2',
  'cal_custom_events',
  'cal_notified',
];

/** Prefixes of per-user keys (e.g. `app:savedViews:<userId>:<namespace>`). */
const PERSONAL_LOCAL_PREFIXES = ['app:savedViews:'];

const PERSONAL_SESSION_KEYS = ['pwreset_state'];

/**
 * Service-worker caches holding personal data. `api-cache` is no longer
 * written (vite.config.js), but browsers that ran the older worker still have
 * one, so it is deleted here too.
 */
const PERSONAL_CACHES = ['api-cache', 'uploads-cache', 'cloudinary-images-cache'];

export async function clearPersonalDeviceData() {
  try {
    PERSONAL_LOCAL_KEYS.forEach((key) => localStorage.removeItem(key));
    Object.keys(localStorage)
      .filter((key) => PERSONAL_LOCAL_PREFIXES.some((prefix) => key.startsWith(prefix)))
      .forEach((key) => localStorage.removeItem(key));
    PERSONAL_SESSION_KEYS.forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // Storage can be unavailable (private mode, blocked site data). Nothing to clear.
  }

  try {
    if (typeof caches !== 'undefined') {
      await Promise.all(PERSONAL_CACHES.map((name) => caches.delete(name)));
    }
  } catch {
    // Cache Storage is unavailable outside a secure context.
  }
}

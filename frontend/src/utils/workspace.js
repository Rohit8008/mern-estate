/**
 * The workspace this browser signs in to, chosen on the sign-in screen.
 *
 * Every workspace shares one address, so the server cannot tell from the URL
 * which agency someone belongs to. The name chosen here travels as the
 * `x-tenant` header on every API call (see http.js). A session, once issued,
 * carries its own workspace and the server trusts that over the header, so
 * this only decides where signing in, and forgot-password, look.
 *
 * Empty means the default workspace, which is what everyone had before.
 */

const KEY = 'rv.workspace';

export function getWorkspace() {
  try {
    return localStorage.getItem(KEY) || '';
  } catch {
    return '';
  }
}

export function setWorkspace(slug) {
  try {
    const clean = String(slug || '').trim().toLowerCase();
    if (clean) localStorage.setItem(KEY, clean);
    else localStorage.removeItem(KEY);
  } catch {
    // Private mode: the choice lasts for this page only, which still works.
  }
}

/** What a person types: lower case, letters, digits and dashes. */
export const normaliseWorkspace = (value) =>
  String(value || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');

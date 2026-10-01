/**
 * The last few CRM pages someone opened, for the ⌘K palette's "Recently
 * visited" group. Kept in the browser per user — it is a convenience, not a
 * record, so a private window simply starts empty.
 */

const MAX = 6;
const keyFor = (userId) => `crm:recent-pages:${userId || 'anon'}`;

export function readRecentPages(userId) {
  try {
    const parsed = JSON.parse(localStorage.getItem(keyFor(userId)) || '[]');
    return Array.isArray(parsed) ? parsed.filter((p) => p && typeof p.path === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Record a visit. The same path moves to the front instead of appearing twice;
 * query strings are kept, so a filtered list is remembered as that view.
 */
export function recordRecentPage(userId, { path, title }) {
  if (!path || !title) return;
  try {
    const next = [{ path, title, at: Date.now() }, ...readRecentPages(userId).filter((p) => p.path !== path)].slice(0, MAX);
    localStorage.setItem(keyFor(userId), JSON.stringify(next));
  } catch {
    // Storage blocked or full: the palette just shows no recents.
  }
}

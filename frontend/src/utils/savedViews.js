export function getSavedViewsKey({ userId, namespace }) {
  return `app:savedViews:${userId || 'anon'}:${namespace}`;
}

export function loadSavedViews({ userId, namespace }) {
  try {
    const raw = localStorage.getItem(getSavedViewsKey({ userId, namespace }));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

export function saveSavedViews({ userId, namespace, items }) {
  try {
    localStorage.setItem(getSavedViewsKey({ userId, namespace }), JSON.stringify(items || []));
  } catch (_) {}
}

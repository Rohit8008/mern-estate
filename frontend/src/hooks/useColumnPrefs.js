import { useCallback, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useTenant } from '../contexts/TenantProvider';

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function write(key, hidden) {
  try {
    localStorage.setItem(key, JSON.stringify(hidden));
  } catch {
    // Private window or full storage: the choice lasts for this visit only.
  }
}

/**
 * Which columns of a table this person has hidden, remembered per workspace
 * and per user — an operator who looks at several workspaces, or two agents
 * sharing a laptop, should not inherit each other's layout.
 *
 * Stored as the HIDDEN set rather than the visible one, so a column added in a
 * later release shows up for everyone instead of being hidden by a list that
 * predates it.
 *
 * `columns` is [{ key, label, locked, defaultHidden }]. This is a convenience,
 * kept in the browser; it is not a saved view and does not follow the user to
 * another device.
 */
export function useColumnPrefs(tableId, columns) {
  const { tenant } = useTenant();
  const userId = useSelector((s) => s.user.currentUser?._id) || 'anon';
  const storageKey = `cols:${tenant?.slug || 'default'}:${userId}:${tableId}`;

  const defaults = useMemo(
    () => columns.filter((c) => c.defaultHidden && !c.locked).map((c) => c.key),
    [columns]
  );
  // Keyed by storageKey: the tenant arrives after first render, and a value read
  // under 'default' must not stand in for the real workspace's. Re-reading
  // during render is React's pattern for state derived from a changing prop.
  const [entry, setEntry] = useState(() => ({ key: storageKey, value: read(storageKey) }));
  if (entry.key !== storageKey) setEntry({ key: storageKey, value: read(storageKey) });
  const stored = entry.key === storageKey ? entry.value : null;
  const setStored = useCallback((value) => setEntry({ key: storageKey, value }), [storageKey]);
  const hidden = useMemo(() => new Set(stored ?? defaults), [stored, defaults]);

  const locked = useMemo(() => new Set(columns.filter((c) => c.locked).map((c) => c.key)), [columns]);

  const isVisible = useCallback((key) => locked.has(key) || !hidden.has(key), [hidden, locked]);

  const toggle = useCallback((key) => {
    if (locked.has(key)) return;
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key); else next.add(key);
    const list = [...next];
    write(storageKey, list);
    setStored(list);
  }, [hidden, locked, storageKey, setStored]);

  const reset = useCallback(() => {
    try { localStorage.removeItem(storageKey); } catch { /* see write() */ }
    setStored(null);
  }, [storageKey, setStored]);

  const visibleColumns = useMemo(() => columns.filter((c) => isVisible(c.key)), [columns, isVisible]);

  return { isVisible, toggle, reset, visibleColumns };
}

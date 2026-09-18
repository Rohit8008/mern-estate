import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useSelector } from 'react-redux';
import { apiClient } from '../utils/http';
import { createSocket } from '../config/socket';

/**
 * The notification feed behind the bell.
 *
 * Deliberately separate from NotificationContext, which is a toast tray: toasts
 * are transient UI feedback ("saved"), and are the right tool for that. The bell
 * was wired to that same tray, so anything it showed vanished after seven
 * seconds and was gone on refresh — a lead assignment you did not happen to be
 * looking at was simply lost. These are rows on the server with an unread state.
 *
 * Kept fresh three ways: a socket push for immediacy, a slow poll as the safety
 * net when a socket drops, and a refetch when the tab regains focus.
 */

const NotificationFeedContext = createContext(null);

export const useNotificationFeed = () => {
  const ctx = useContext(NotificationFeedContext);
  if (!ctx) throw new Error('useNotificationFeed must be used within a NotificationFeedProvider');
  return ctx;
};

/** Slow on purpose: the socket is the fast path, this only covers its gaps. */
const POLL_MS = 60_000;
const PAGE_SIZE = 20;

export const NotificationFeedProvider = ({ children }) => {
  const { currentUser } = useSelector((state) => state.user);
  const userId = currentUser?._id;

  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const loadedRef = useRef(false);

  const reset = useCallback(() => {
    setItems([]);
    setUnread(0);
    setTotal(0);
    loadedRef.current = false;
  }, []);

  /** Just the badge. Cheap enough to poll. */
  const refreshCount = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await apiClient.get('/notifications/unread-count');
      setUnread(Number(res?.data?.unread) || 0);
    } catch {
      // A failed count must not surface as an error toast; the badge simply
      // keeps its last value until the next poll.
    }
  }, [userId]);

  const load = useCallback(async ({ append = false } = {}) => {
    if (!userId) return;
    setLoading(true);
    try {
      const offset = append ? items.length : 0;
      const res = await apiClient.get(`/notifications?limit=${PAGE_SIZE}&offset=${offset}`);
      const data = res?.data || {};
      setItems((prev) => (append ? [...prev, ...(data.items || [])] : data.items || []));
      setTotal(Number(data.total) || 0);
      setUnread(Number(data.unread) || 0);
      loadedRef.current = true;
    } catch {
      // Leave whatever is on screen rather than blanking the list.
    } finally {
      setLoading(false);
    }
  }, [userId, items.length]);

  /** Load the list lazily — only when something actually opens it. */
  const ensureLoaded = useCallback(() => {
    if (!loadedRef.current) load();
  }, [load]);

  const markRead = useCallback(async (id) => {
    // Optimistic: the click should feel instant, and a failed mark is harmless
    // because the next fetch restores the truth.
    setItems((prev) => prev.map((n) => (n._id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n)));
    setUnread((n) => Math.max(0, n - 1));
    try {
      await apiClient.patch(`/notifications/${id}/read`);
    } catch {
      refreshCount();
    }
  }, [refreshCount]);

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })));
    setUnread(0);
    try {
      await apiClient.patch('/notifications/read-all');
    } catch {
      refreshCount();
    }
  }, [refreshCount]);

  // Initial count, then poll.
  useEffect(() => {
    if (!userId) {
      reset();
      return undefined;
    }

    refreshCount();
    const timer = setInterval(refreshCount, POLL_MS);
    return () => clearInterval(timer);
  }, [userId, refreshCount, reset]);

  // Refetch when the tab comes back, so a badge cannot sit stale for an hour
  // while the laptop was closed.
  useEffect(() => {
    if (!userId) return undefined;
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshCount();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [userId, refreshCount]);

  // Live push. Its own connection rather than sharing PushNotificationsListener's,
  // so neither has to know about the other's lifecycle.
  useEffect(() => {
    if (!userId) return undefined;

    const socket = createSocket(userId, { transports: ['websocket'] });
    const onNew = (payload) => {
      setUnread((n) => n + 1);
      setItems((prev) => (loadedRef.current ? [{ ...payload, readAt: null }, ...prev] : prev));
      setTotal((t) => t + 1);
    };

    socket.on('notification:new', onNew);
    return () => {
      socket.off('notification:new', onNew);
      socket.close();
    };
  }, [userId]);

  const value = useMemo(() => ({
    items,
    unread,
    total,
    loading,
    hasMore: items.length < total,
    load,
    loadMore: () => load({ append: true }),
    ensureLoaded,
    markRead,
    markAllRead,
    refreshCount,
  }), [items, unread, total, loading, load, ensureLoaded, markRead, markAllRead, refreshCount]);

  return (
    <NotificationFeedContext.Provider value={value}>
      {children}
    </NotificationFeedContext.Provider>
  );
};

NotificationFeedProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

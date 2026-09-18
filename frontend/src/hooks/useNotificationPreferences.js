import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '../utils/http';

/**
 * This user's notification preferences, read from their account.
 *
 * These used to live in localStorage under `settings_<id>`, which meant they
 * were per-browser, invisible to the server, and therefore governed nothing
 * that happened outside the tab — the backend had no idea what anyone had
 * chosen. They are now stored on the user and this hook reads them.
 *
 * The defaults here are permissive on purpose: while the request is in flight
 * we would rather show a notification than swallow one.
 */

const FALLBACK = {
  pushMessages: true,
  pushListingUpdates: true,
};

/** Cached across mounts so the bell and Settings don't each refetch. */
let cache = null;
let inFlight = null;

function toPushFlags(notifications) {
  return {
    pushMessages: notifications?.['message.received']?.inApp !== false,
    pushListingUpdates: notifications?.['listing.updated']?.inApp !== false,
  };
}

async function loadPreferences() {
  if (cache) return cache;
  if (!inFlight) {
    inFlight = apiClient
      .get('/notifications/preferences')
      .then((res) => {
        cache = res?.data || res;
        return cache;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/** Called after a save, so open screens pick the new values up. */
export function invalidateNotificationPreferences() {
  cache = null;
  window.dispatchEvent(new CustomEvent('preferences:update'));
}

export function useNotificationPreferences(userId) {
  const [prefs, setPrefs] = useState(FALLBACK);

  const refresh = useCallback(() => {
    if (!userId) {
      setPrefs(FALLBACK);
      return;
    }

    let cancelled = false;
    loadPreferences()
      .then((data) => {
        if (!cancelled) setPrefs(toPushFlags(data?.notifications));
      })
      .catch(() => {
        if (!cancelled) setPrefs(FALLBACK);
      });

    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => refresh(), [refresh]);

  useEffect(() => {
    const onUpdate = () => refresh();
    window.addEventListener('preferences:update', onUpdate);
    return () => window.removeEventListener('preferences:update', onUpdate);
  }, [refresh]);

  return useMemo(() => prefs, [prefs]);
}

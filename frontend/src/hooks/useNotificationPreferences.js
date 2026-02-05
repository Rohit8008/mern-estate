import { useEffect, useMemo, useState } from 'react';

function getPrefsForUser(userId) {
  if (!userId) {
    return {
      pushMessages: true,
      pushListingUpdates: true,
    };
  }

  try {
    const raw = localStorage.getItem(`settings_${userId}`);
    if (!raw) {
      return {
        pushMessages: true,
        pushListingUpdates: true,
      };
    }

    const parsed = JSON.parse(raw);
    const notifications = parsed?.notifications || {};

    return {
      pushMessages: notifications.pushMessages !== false,
      pushListingUpdates: notifications.pushListingUpdates !== false,
    };
  } catch (error) {
    console.error(error);
    return {
      pushMessages: true,
      pushListingUpdates: true,
    };
  }
}

export function useNotificationPreferences(userId) {
  const [prefs, setPrefs] = useState(() => getPrefsForUser(userId));

  useEffect(() => {
    setPrefs(getPrefsForUser(userId));
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    const onStorage = (e) => {
      if (e.key === `settings_${userId}`) {
        setPrefs(getPrefsForUser(userId));
      }
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    const onUpdate = (e) => {
      const targetUserId = e?.detail?.userId;
      if (!targetUserId || String(targetUserId) !== String(userId)) return;
      setPrefs(getPrefsForUser(userId));
    };

    window.addEventListener('settings:update', onUpdate);
    return () => window.removeEventListener('settings:update', onUpdate);
  }, [userId]);

  return useMemo(() => prefs, [prefs]);
}

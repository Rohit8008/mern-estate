import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { apiClient } from '../utils/http';

const PermissionsContext = createContext({
  permissions: {},
  can: () => false,
  ready: false,
  refresh: () => {},
});

export function PermissionsProvider({ children }) {
  const { currentUser } = useSelector((s) => s.user);
  const [permissions, setPermissions] = useState({});
  // Start as NOT ready so PermissionRoute waits before making any redirect decision
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);

    if (!currentUser) {
      setPermissions({});
      setReady(true);
      return;
    }

    // Admins always have everything — no fetch needed
    if (currentUser.role === 'admin') {
      setPermissions({ _all: true });
      setReady(true);
      return;
    }

    // Non-employee roles have no CRM permissions — no fetch needed
    if (currentUser.role !== 'employee') {
      setPermissions({});
      setReady(true);
      return;
    }

    // Employee: fetch assigned permissions from the server
    let cancelled = false;
    apiClient
      .get('/user/my-permissions')
      .then((data) => {
        if (!cancelled) setPermissions(data.permissions || {});
      })
      .catch(() => {
        if (!cancelled) setPermissions({});
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => { cancelled = true; };
  }, [currentUser?.id, currentUser?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  const can = useCallback(
    (permission) => {
      if (!currentUser) return false;
      if (currentUser.role === 'admin' || permissions._all) return true;
      if (!permission) return true; // no specific permission required
      return permissions[permission] === true;
    },
    [currentUser, permissions]
  );

  const refresh = useCallback(() => {
    setReady(false);
    apiClient
      .get('/user/my-permissions')
      .then((data) => setPermissions(data.permissions || {}))
      .catch(() => setPermissions({}))
      .finally(() => setReady(true));
  }, []);

  return (
    <PermissionsContext.Provider value={{ permissions, can, ready, refresh }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export const usePermissions = () => useContext(PermissionsContext);

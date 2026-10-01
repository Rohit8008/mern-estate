import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { apiClient } from '../utils/http';

const PermissionsContext = createContext({
  permissions: {},
  can: () => false,
  canAct: () => false,
  ready: false,
  refresh: () => {},
});

export function PermissionsProvider({ children }) {
  const { currentUser } = useSelector((s) => s.user);
  const [permissions, setPermissions] = useState({});
  // True for an employee the API treats as pre-permission (no usable role).
  const [legacyFallback, setLegacyFallback] = useState(false);
  // Start as NOT ready so PermissionRoute waits before making any redirect decision
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);

    if (!currentUser) {
      setPermissions({});
      setLegacyFallback(false);
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
        if (!cancelled) {
          setPermissions(data.permissions || {});
          setLegacyFallback(data.legacyFallback === true);
        }
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

  // For ACTIONS the API only began enforcing later (edit/delete a listing, send
  // a message, create/update/delete a buyer requirement, switch an owner on or
  // off). Mirrors the server (staffHasPermission): sellers and buyers are
  // bounded by ownership, not roles, and an employee with no usable role keeps
  // today's behaviour, so none of those are hidden from them. `can` stays the
  // strict check used for navigation.
  const canAct = useCallback(
    (permission) => {
      if (!currentUser) return false;
      if (currentUser.role !== 'employee') return true;
      if (legacyFallback) return true;
      return permissions[permission] === true;
    },
    [currentUser, permissions, legacyFallback]
  );

  const refresh = useCallback(() => {
    setReady(false);
    apiClient
      .get('/user/my-permissions')
      .then((data) => { setPermissions(data.permissions || {}); setLegacyFallback(data.legacyFallback === true); })
      .catch(() => setPermissions({}))
      .finally(() => setReady(true));
  }, []);

  return (
    <PermissionsContext.Provider value={{ permissions, can, canAct, ready, refresh }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export const usePermissions = () => useContext(PermissionsContext);

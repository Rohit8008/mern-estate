import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { useBuyerView } from '../contexts/BuyerViewContext';

/**
 * Returns whether the current user has CRM access (admin or employee,
 * not in buyer view mode). Eliminates the copy-pasted canAccess block
 * that previously appeared in every CRM page component.
 *
 * Usage:
 *   const { canAccess, isAdmin, currentUser } = useCrmAccess();
 */
export function useCrmAccess() {
  const { currentUser } = useSelector((s) => s.user);
  const { isBuyerViewMode } = useBuyerView();

  const canAccess = useMemo(() => {
    if (!currentUser) return false;
    if (isBuyerViewMode) return false;
    return currentUser.role === 'admin' || currentUser.role === 'employee';
  }, [currentUser, isBuyerViewMode]);

  const isAdmin = currentUser?.role === 'admin';
  const isEmployee = currentUser?.role === 'employee';

  return { canAccess, isAdmin, isEmployee, currentUser };
}

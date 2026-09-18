import { useCallback } from 'react';
import { apiClient } from '../utils/http';
import { invalidateTenantConfig, useTenant } from '../contexts/TenantProvider';

/**
 * Entering and leaving a customer's workspace, for platform operators.
 *
 * Both transitions end in a full page load rather than a re-render, and that is
 * deliberate. Half this app holds workspace data in component state, in Redux
 * and in module-level caches; swapping the tenant underneath all of it would
 * leave one agency's properties on screen under another agency's name. Throwing
 * the page away is the only way to be sure nothing survives the switch, and it
 * costs one reload on an action taken a few times a day.
 */
export function useActingAs() {
  const { tenant } = useTenant();
  const actingAs = tenant?.actingAs || null;

  const enter = useCallback(async (tenantId, { redirectTo = '/dashboard' } = {}) => {
    await apiClient.post(`/platform/act-as/${tenantId}`, {});
    invalidateTenantConfig();
    window.location.assign(redirectTo);
  }, []);

  const leave = useCallback(async ({ redirectTo = '/platform' } = {}) => {
    await apiClient.post('/platform/stop-acting', {});
    invalidateTenantConfig();
    window.location.assign(redirectTo);
  }, []);

  return { actingAs, isActing: Boolean(actingAs), enter, leave };
}

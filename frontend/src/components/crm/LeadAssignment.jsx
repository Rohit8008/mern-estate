import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../utils/http';
import { Button, Select } from '../../design-system';
import ConfirmDialog from '../ConfirmDialog';

const nameOf = (u) => (u ? (`${u.firstName || ''} ${u.lastName || ''}`.trim() || u.username || u.email || '') : '');

/**
 * Who owns this lead. Anyone sees the owner; only an admin can change it
 * (POST /api/clients/:id/assign is admin-only), so only an admin is shown the
 * picker. Reassigning someone's lead asks first.
 */
export default function LeadAssignment({ clientId, assignee, isAdmin, onChanged }) {
  const { t } = useTranslation();
  const [agents, setAgents] = useState([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAdmin) return undefined;
    let live = true;
    setLoadingAgents(true);
    apiClient.get('/user/list', { silent: true })
      .then((res) => {
        if (!live) return;
        const users = Array.isArray(res) ? res : res?.data || [];
        setAgents(users.filter((u) => ['admin', 'employee'].includes(u.role) && u.status === 'active'));
        setLoadError('');
      })
      .catch((e) => { if (live) setLoadError(e?.message || t('crmExtras.teamLoadFailed')); })
      .finally(() => { if (live) setLoadingAgents(false); });
    return () => { live = false; };
  }, [isAdmin, t]);

  const assigneeId = assignee?._id || assignee || '';

  async function assign() {
    setSaving(true);
    setError('');
    try {
      await apiClient.post(`/clients/${clientId}/assign`, { assignedTo: selected }, { silent: true });
      setConfirming(false);
      setSelected('');
      await onChanged?.();
    } catch (e) {
      setConfirming(false);
      setError(e?.message || t('crmExtras.assignFailed'));
    } finally {
      setSaving(false);
    }
  }

  function onAssignClick() {
    if (!selected) return;
    if (assigneeId) setConfirming(true); else assign();
  }

  const target = agents.find((u) => u._id === selected);

  return (
    <div>
      <h3 className='font-semibold mb-3'>{t('crmExtras.assignedTo')}</h3>
      <p className='text-sm mb-3'>
        {assignee && typeof assignee === 'object'
          ? <span className='font-medium'>{nameOf(assignee)}</span>
          : <span className='text-slate-400 italic'>{t('crmExtras.unassigned')}</span>}
      </p>
      {isAdmin && (
        <div className='space-y-2'>
          {loadError ? (
            <p role='alert' className='text-xs text-rose-600'>{loadError}</p>
          ) : (
            <div className='flex flex-col sm:flex-row gap-2 sm:items-end'>
              <Select
                label={t('crmExtras.reassignTo')}
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                disabled={loadingAgents || saving}
                className='mb-0 flex-1'
              >
                <option value=''>{loadingAgents ? t('crmExtras.loading') : t('crmExtras.chooseTeamMember')}</option>
                {agents.filter((u) => u._id !== assigneeId).map((u) => (
                  <option key={u._id} value={u._id}>{nameOf(u)}</option>
                ))}
              </Select>
              <Button size='sm' onClick={onAssignClick} disabled={!selected || saving} loading={saving} className='justify-center'>
                {t('crmExtras.assign')}
              </Button>
            </div>
          )}
          {error && <p role='alert' className='text-xs text-rose-600'>{error}</p>}
        </div>
      )}
      <ConfirmDialog
        open={confirming}
        title={t('crmExtras.reassignTitle')}
        description={t('crmExtras.reassignBody', { from: nameOf(assignee), to: nameOf(target) })}
        confirmLabel={t('crmExtras.assign')}
        onConfirm={assign}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

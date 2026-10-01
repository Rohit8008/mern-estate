import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiPencil } from 'react-icons/hi';
import { apiClient } from '../../utils/http';
import { formatCurrency } from '../../utils/currency';
import { Badge, Button, Input, Select } from '../../design-system';

const STATUS_VARIANT = { pending: 'warning', partial: 'info', paid: 'success' };

/**
 * A deal's commission: shown as a line, edited inline.
 * PATCH /api/crm/:id/deals/:dealId/commission takes a percentage (the server
 * recomputes the amount from the deal value) and a payment status.
 */
export default function DealCommissionEditor({ clientId, deal, onSaved }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [pct, setPct] = useState('');
  const [status, setStatus] = useState('pending');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const current = deal.commission || {};

  function open() {
    setPct(String(current.percentage ?? 0));
    setStatus(current.status || 'pending');
    setError('');
    setEditing(true);
  }

  const pctNum = Number(pct);
  const valid = pct !== '' && Number.isFinite(pctNum) && pctNum >= 0 && pctNum <= 100;
  const preview = valid ? ((Number(deal.value) || 0) * pctNum) / 100 : 0;

  async function save(e) {
    e.preventDefault();
    if (!valid) { setError(t('crmExtras.commissionRange')); return; }
    setSaving(true);
    setError('');
    try {
      await apiClient.patch(`/crm/${clientId}/deals/${deal._id}/commission`, { percentage: pctNum, status }, { silent: true });
      setEditing(false);
      await onSaved?.();
    } catch (err) {
      setError(err?.message || t('crmExtras.commissionSaveFailed'));
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className='flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600'>
        <span>{t('crmExtras.commissionLine', { pct: current.percentage ?? 0, amount: formatCurrency(current.amount || 0) })}</span>
        <Badge variant={STATUS_VARIANT[current.status] || 'default'} className='capitalize'>{current.status || 'pending'}</Badge>
        <button
          type='button'
          onClick={open}
          className='inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 px-1.5 py-1 rounded-md hover:bg-white/60 focus:outline-none focus:ring-2 focus:ring-brand-500'
          aria-label={t('crmExtras.editCommission')}
        >
          <HiPencil className='w-3.5 h-3.5' /> {t('clientDetail.edit')}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={save} className='bg-white border border-slate-200 rounded-lg p-3 space-y-3'>
      <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
        <Input
          label={t('crmExtras.commissionPercent')}
          type='number'
          min={0}
          max={100}
          step='0.1'
          value={pct}
          onChange={(e) => setPct(e.target.value)}
          className='mb-0'
          required
        />
        <Select label={t('crmExtras.commissionStatus')} value={status} onChange={(e) => setStatus(e.target.value)} className='mb-0'>
          <option value='pending'>{t('crmExtras.statusPending')}</option>
          <option value='partial'>{t('crmExtras.statusPartial')}</option>
          <option value='paid'>{t('crmExtras.statusPaid')}</option>
        </Select>
      </div>
      <p className='text-xs text-slate-500'>{t('crmExtras.commissionPreview', { amount: formatCurrency(preview), value: formatCurrency(deal.value || 0) })}</p>
      {error && <p role='alert' className='text-xs text-rose-600'>{error}</p>}
      <div className='flex gap-2'>
        <Button type='submit' size='xs' loading={saving} disabled={saving || !valid}>{t('crmExtras.save')}</Button>
        <Button type='button' size='xs' variant='secondary' onClick={() => setEditing(false)} disabled={saving}>{t('clientDetail.cancel')}</Button>
      </div>
    </form>
  );
}

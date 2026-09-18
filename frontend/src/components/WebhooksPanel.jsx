import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HiLink, HiPlus, HiTrash, HiRefresh, HiPaperAirplane, HiClipboardCopy,
  HiCheckCircle, HiExclamationCircle,
} from 'react-icons/hi';
import { Input, Button, Modal, EmptyState, Badge } from '../design-system';
import ConfirmDialog from './ConfirmDialog';
import { apiClient } from '../utils/http';
import { useNotification } from '../contexts/NotificationContext';

/**
 * Outbound webhooks, for a workspace admin.
 *
 * The secret is shown in full on purpose — the receiving end needs the same
 * value to verify the signature, so it has to be readable off this screen. That
 * is also why the whole panel is admin-only.
 */
export default function WebhooksPanel() {
  const { t } = useTranslation();
  const { showSuccess, showError } = useNotification();

  const [hooks, setHooks] = useState([]);
  const [events, setEvents] = useState({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [draft, setDraft] = useState({ name: '', url: '', events: ['*'] });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/webhooks');
      setHooks(res?.data?.webhooks || []);
      setEvents(res?.data?.events || {});
    } catch {
      showError('Could not load webhooks');
    }
    setLoading(false);
  }, [showError]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    try {
      await apiClient.post('/webhooks', draft);
      setCreating(false);
      setDraft({ name: '', url: '', events: ['*'] });
      showSuccess('Endpoint added');
      load();
    } catch (err) {
      showError(err?.message || 'Could not add the endpoint');
    }
  };

  const toggle = async (hook) => {
    try {
      await apiClient.patch(`/webhooks/${hook._id}`, { isActive: !hook.isActive });
      load();
    } catch (err) {
      showError(err?.message || 'Could not update the endpoint');
    }
  };

  const rotate = async (hook) => {
    try {
      const res = await apiClient.post(`/webhooks/${hook._id}/rotate-secret`, {});
      showSuccess('New secret generated — update your receiver');
      setHooks((prev) => prev.map((h) => (h._id === hook._id ? { ...h, secret: res?.data?.secret } : h)));
    } catch (err) {
      showError(err?.message || 'Could not rotate the secret');
    }
  };

  const sendTest = async (hook) => {
    try {
      await apiClient.post(`/webhooks/${hook._id}/test`, {});
      showSuccess('Test queued — it will be delivered within a minute');
    } catch (err) {
      showError(err?.message || 'Could not queue a test');
    }
  };

  const remove = async () => {
    try {
      await apiClient.delete(`/webhooks/${pendingDelete}`);
      setPendingDelete(null);
      showSuccess('Endpoint removed');
      load();
    } catch (err) {
      showError(err?.message || 'Could not remove the endpoint');
    }
  };

  const copy = (value) => {
    navigator.clipboard?.writeText(value).then(
      () => showSuccess('Copied'),
      () => showError('Could not copy')
    );
  };

  const toggleEvent = (name) => {
    setDraft((d) => {
      if (name === '*') return { ...d, events: ['*'] };
      const without = d.events.filter((e) => e !== '*');
      return {
        ...d,
        events: without.includes(name) ? without.filter((e) => e !== name) : [...without, name],
      };
    });
  };

  return (
    <div className='space-y-4'>
      <div className='bg-white rounded-xl border border-slate-200 p-5'>
        <div className='flex items-start justify-between gap-3 mb-5 flex-wrap'>
          <div className='flex items-center gap-3'>
            <div className='w-9 h-9 rounded-xl bg-violet-50 ring-1 ring-violet-100 flex items-center justify-center flex-shrink-0'>
              <HiLink className='w-5 h-5 text-violet-600' />
            </div>
            <div>
              <h2 className='text-base font-semibold text-slate-900'>{t('webhooks.title')}</h2>
              <p className='text-xs text-slate-500'>{t('webhooks.description')}</p>
            </div>
          </div>
          <Button icon={HiPlus} onClick={() => setCreating(true)}>{t('common.add')}</Button>
        </div>

        {loading ? (
          <p className='text-sm text-slate-400 py-4'>{t('common.loading')}</p>
        ) : !hooks.length ? (
          <EmptyState icon={HiLink} title={t('webhooks.empty')} body={t('webhooks.emptyBody')} />
        ) : (
          <ul className='divide-y divide-slate-100'>
            {hooks.map((hook) => (
              <li key={hook._id} className='py-4 first:pt-0 last:pb-0'>
                <div className='flex items-start justify-between gap-3 flex-wrap'>
                  <div className='min-w-0 flex-1'>
                    <div className='flex items-center gap-2 flex-wrap'>
                      <span className='text-sm font-medium text-slate-900'>{hook.name}</span>
                      <Badge variant={hook.isActive ? 'success' : 'slate'}>
                        {hook.isActive ? t('webhooks.active') : t('webhooks.disabled')}
                      </Badge>
                      {hook.failureCount > 0 && (
                        <Badge variant='warning'>{hook.failureCount} failed</Badge>
                      )}
                    </div>
                    <p className='text-xs text-slate-500 truncate mt-0.5'>{hook.url}</p>
                    <p className='text-xs text-slate-400 mt-1'>
                      {hook.events?.includes('*') ? t('webhooks.allEvents') : hook.events?.join(', ')}
                    </p>

                    {hook.disabledReason && (
                      <p className='flex items-center gap-1.5 text-xs text-amber-700 mt-1.5'>
                        <HiExclamationCircle className='w-4 h-4 flex-shrink-0' />
                        {hook.disabledReason}
                      </p>
                    )}

                    {hook.lastSuccessAt && (
                      <p className='flex items-center gap-1.5 text-xs text-emerald-700 mt-1'>
                        <HiCheckCircle className='w-4 h-4 flex-shrink-0' />
                        {t('webhooks.lastDelivery')}: {new Date(hook.lastSuccessAt).toLocaleString()}
                      </p>
                    )}

                    <div className='flex items-center gap-2 mt-2.5'>
                      <code className='text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded font-mono truncate max-w-xs'>
                        {hook.secret}
                      </code>
                      <button
                        type='button'
                        onClick={() => copy(hook.secret)}
                        className='p-1.5 text-slate-400 hover:text-slate-700 transition-colors'
                        title={t('webhooks.signingSecret')}
                      >
                        <HiClipboardCopy className='w-4 h-4' />
                      </button>
                    </div>
                  </div>

                  <div className='flex items-center gap-1.5 flex-shrink-0'>
                    <button
                      type='button'
                      onClick={() => sendTest(hook)}
                      className='p-2 text-slate-500 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors'
                      title={t('webhooks.sendTest')}
                    >
                      <HiPaperAirplane className='w-4 h-4' />
                    </button>
                    <button
                      type='button'
                      onClick={() => rotate(hook)}
                      className='p-2 text-slate-500 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors'
                      title={t('webhooks.rotateSecret')}
                    >
                      <HiRefresh className='w-4 h-4' />
                    </button>
                    <button
                      type='button'
                      onClick={() => toggle(hook)}
                      className='px-2.5 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors'
                    >
                      {hook.isActive ? t('webhooks.disabled') : t('webhooks.active')}
                    </button>
                    <button
                      type='button'
                      onClick={() => setPendingDelete(hook._id)}
                      className='p-2 text-rose-600 hover:bg-rose-50 rounded-lg border border-rose-200 transition-colors'
                      title={t('common.delete')}
                    >
                      <HiTrash className='w-4 h-4' />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {creating && (
        <Modal
          open
          onClose={() => setCreating(false)}
          title={t('webhooks.title')}
          description={t('webhooks.description')}
          footer={
            <>
              <Button variant='secondary' onClick={() => setCreating(false)}>{t('common.cancel')}</Button>
              <Button onClick={create} disabled={!draft.name || !draft.url}>{t('common.create')}</Button>
            </>
          }
        >
          <div className='space-y-4'>
            <Input
              label={t('common.name')}
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder={t('webhooks.zapierNewLeads')}
            />
            <Input
              label={t('webhooks.endpoint')}
              value={draft.url}
              onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
              placeholder='https://hooks.zapier.com/…'
            />

            <div>
              <p className='text-sm font-medium text-slate-700 mb-2'>{t('webhooks.events')}</p>
              <label className='flex items-center gap-2.5 mb-2 cursor-pointer'>
                <input
                  type='checkbox'
                  checked={draft.events.includes('*')}
                  onChange={() => toggleEvent('*')}
                  className='w-4 h-4 rounded border-slate-300 text-indigo-600'
                />
                <span className='text-sm text-slate-700'>
                  {t('webhooks.allEvents')}
                  <span className='text-slate-400'>{t('webhooks.includingOnesAddedLater')}</span>
                </span>
              </label>

              {!draft.events.includes('*') && (
                <div className='grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-56 overflow-y-auto pr-1'>
                  {Object.entries(events).map(([name, description]) => (
                    <label key={name} className='flex items-start gap-2 cursor-pointer py-1'>
                      <input
                        type='checkbox'
                        checked={draft.events.includes(name)}
                        onChange={() => toggleEvent(name)}
                        className='w-4 h-4 mt-0.5 rounded border-slate-300 text-indigo-600 flex-shrink-0'
                      />
                      <span className='min-w-0'>
                        <span className='block text-xs font-medium text-slate-700'>{name}</span>
                        <span className='block text-xs text-slate-400'>{description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={t('webhooks.removeThisEndpoint')}
        description={t('webhooks.queuedDeliveriesForItAreDiscarded')}
        confirmLabel={t('common.delete')}
        onConfirm={remove}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

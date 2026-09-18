import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiMail, HiCheckCircle, HiExclamationCircle } from 'react-icons/hi';
import { Input, Button } from '../design-system';
import { apiClient } from '../utils/http';
import { useNotification } from '../contexts/NotificationContext';

/**
 * The workspace's own outbound mail.
 *
 * Without this, every agency's notifications went out from the vendor's address
 * — wrong on the envelope, and a deliverability problem the moment there is a
 * second customer.
 *
 * The stored password is never sent back to the browser, so the field is left
 * blank and only written when someone types a new one. `hasPassword` is what
 * tells the screen one is on file.
 */
export default function WorkspaceMailPanel() {
  const { t } = useTranslation();
  const { showSuccess, showError } = useNotification();

  const [settings, setSettings] = useState(null);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);

  useEffect(() => {
    let alive = true;
    apiClient
      .get('/tenant/mail')
      .then((res) => { if (alive) setSettings(res?.data || {}); })
      .catch(() => { if (alive) showError('Could not load mail settings'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [showError]);

  const field = (key) => ({
    value: settings?.[key] ?? '',
    onChange: (e) => setSettings((s) => ({ ...s, [key]: e.target.value })),
  });

  const save = async () => {
    setSaving(true);
    try {
      const body = { ...settings };
      // An empty box means "leave the stored password alone", not "clear it".
      if (password) body.password = password;
      delete body.hasPassword;
      delete body.effectiveSource;
      delete body.verifiedAt;

      const res = await apiClient.patch('/tenant/mail', body);
      setSettings(res?.data || settings);
      setPassword('');
      setVerifyResult(null);
      showSuccess('Mail settings saved');
    } catch (err) {
      showError(err?.message || 'Could not save mail settings');
    }
    setSaving(false);
  };

  const verify = async () => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await apiClient.post('/tenant/mail/verify', {});
      setVerifyResult(res?.data || { ok: false });
    } catch (err) {
      setVerifyResult({ ok: false, error: err?.message });
    }
    setVerifying(false);
  };

  if (loading) return <p className='text-sm text-slate-400 p-5'>{t('common.loading')}</p>;

  const usingWorkspace = settings?.effectiveSource === 'workspace';

  return (
    <div className='space-y-4'>
      <div className='bg-white rounded-xl border border-slate-200 p-5'>
        <div className='flex items-center gap-3 mb-5'>
          <div className='w-9 h-9 rounded-xl bg-indigo-50 ring-1 ring-indigo-100 flex items-center justify-center flex-shrink-0'>
            <HiMail className='w-5 h-5 text-indigo-600' />
          </div>
          <div>
            <h2 className='text-base font-semibold text-slate-900'>Outgoing email</h2>
            <p className='text-xs text-slate-500'>
              {usingWorkspace
                ? 'Mail is being sent from this workspace’s own server.'
                : 'Mail is being sent from the platform’s server. Add your own SMTP to send as your agency.'}
            </p>
          </div>
        </div>

        <label className='flex items-center gap-2.5 mb-5 cursor-pointer'>
          <input
            type='checkbox'
            checked={Boolean(settings?.enabled)}
            onChange={(e) => setSettings((s) => ({ ...s, enabled: e.target.checked }))}
            className='w-4 h-4 rounded border-slate-300 text-indigo-600'
          />
          <span className='text-sm text-slate-700'>Send mail using this workspace&rsquo;s own server</span>
        </label>

        <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
          <Input label='SMTP host' placeholder='smtp.your-provider.com' {...field('host')} />
          <Input label='Port' type='number' placeholder='587' {...field('port')} />
          <Input label='Username' placeholder='you@agency.com' {...field('user')} />
          <Input
            label={settings?.hasPassword ? 'Password (stored — type to replace)' : 'Password'}
            type='password'
            placeholder={settings?.hasPassword ? '••••••••' : ''}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Input label='From address' placeholder='noreply@agency.com' {...field('from')} />
          <Input label='From name' placeholder='Acme Realty' {...field('fromName')} />
        </div>

        <label className='flex items-center gap-2.5 mt-4 cursor-pointer'>
          <input
            type='checkbox'
            checked={Boolean(settings?.secure)}
            onChange={(e) => setSettings((s) => ({ ...s, secure: e.target.checked }))}
            className='w-4 h-4 rounded border-slate-300 text-indigo-600'
          />
          <span className='text-sm text-slate-700'>Use TLS on connect (port 465)</span>
        </label>

        <div className='flex items-center gap-2 mt-6 flex-wrap'>
          <Button onClick={save} disabled={saving}>
            {saving ? t('common.saving') : t('common.save')}
          </Button>
          <Button variant='secondary' onClick={verify} disabled={verifying}>
            {verifying ? 'Testing…' : 'Test connection'}
          </Button>

          {settings?.verifiedAt && !verifyResult && (
            <span className='text-xs text-slate-400'>
              Last verified {new Date(settings.verifiedAt).toLocaleString()}
            </span>
          )}
        </div>

        {verifyResult && (
          <div
            className={
              verifyResult.ok
                ? 'flex items-start gap-2 mt-4 p-3 rounded-xl bg-emerald-50 ring-1 ring-emerald-100'
                : 'flex items-start gap-2 mt-4 p-3 rounded-xl bg-rose-50 ring-1 ring-rose-100'
            }
          >
            {verifyResult.ok
              ? <HiCheckCircle className='w-5 h-5 text-emerald-600 flex-shrink-0' />
              : <HiExclamationCircle className='w-5 h-5 text-rose-600 flex-shrink-0' />}
            <p className={verifyResult.ok ? 'text-sm text-emerald-800' : 'text-sm text-rose-800'}>
              {verifyResult.ok
                ? `Connected and authenticated successfully (${verifyResult.via}).`
                : `Could not connect: ${verifyResult.error || verifyResult.reason}`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

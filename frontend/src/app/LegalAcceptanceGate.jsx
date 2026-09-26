import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation } from 'react-router-dom';
import { apiClient, setUserSignedOut } from '../utils/http';
import { signOutUserSuccess } from '../redux/user/userSlice';
import { Modal, Button } from '../design-system';
import { useActingAs } from '../hooks/useActingAs';
import { useTranslation } from 'react-i18next';

/**
 * Asks a signed-in person to accept the current Terms and Privacy Policy when
 * there is no record that they have.
 *
 * Acceptance is recorded at invitation, which covers new accounts. This covers
 * the rest: everyone invited before that existed, and everyone again whenever
 * the documents change (backend/utils/legalVersion.js). The mobile app asks the
 * same question of the same endpoint.
 *
 * Not shown while a platform operator is viewing a customer's workspace — the
 * session is read-only there, and the question is about the operator's own
 * account, not the customer's. Not shown on the legal pages themselves, so the
 * documents can be read before agreeing to them.
 */

const LEGAL_PATHS = ['/privacy', '/terms', '/cookies', '/refunds'];

export default function LegalAcceptanceGate() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { pathname } = useLocation();
  const { isActing } = useActingAs();
  const userId = useSelector((state) => state.user?.currentUser?._id);
  const [pending, setPending] = useState(null); // { version } when acceptance is needed
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setPending(null);
    setAgreed(false);
    if (!userId || isActing) return undefined;
    let cancelled = false;
    // Fails open: a network error must not lock someone out of their work.
    // They are asked again on the next load.
    apiClient
      .get('/user/legal-acceptance', { silent: true })
      .then((res) => { if (!cancelled && res?.required) setPending({ version: res.version }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userId, isActing]);

  if (!pending || LEGAL_PATHS.includes(pathname)) return null;

  const accept = async () => {
    setSaving(true);
    setError('');
    try {
      await apiClient.post('/user/legal-acceptance', { version: pending.version });
      setPending(null);
    } catch (err) {
      // 409: the documents changed while this was open. Re-read the version.
      const res = await apiClient.get('/user/legal-acceptance', { silent: true }).catch(() => null);
      if (res?.required) setPending({ version: res.version });
      setAgreed(false);
      setError(err?.message || t('legalGate.failed'));
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    setUserSignedOut(true);
    await apiClient.post('/auth/signout').catch(() => {});
    dispatch(signOutUserSuccess());
    window.location.href = '/';
  };

  return (
    <Modal
      open
      title={t('legalGate.title')}
      description={t('legalGate.body')}
      size='md'
      footer={
        <>
          <Button type='button' variant='secondary' onClick={signOut}>{t('legalGate.signOut')}</Button>
          <Button type='button' variant='primary' onClick={accept} disabled={!agreed} loading={saving}>
            {t('legalGate.continue')}
          </Button>
        </>
      }
    >
      <div className='space-y-4 text-sm text-slate-700'>
        <p>
          <a href='/terms' target='_blank' rel='noopener noreferrer' className='font-medium text-brand-700 underline underline-offset-2'>{t('legalGate.terms')}</a>
          {' · '}
          <a href='/privacy' target='_blank' rel='noopener noreferrer' className='font-medium text-brand-700 underline underline-offset-2'>{t('legalGate.privacy')}</a>
          <span className='sr-only'> {t('legalGate.newTab')}</span>
        </p>
        {/* Unticked by default and never pre-ticked. */}
        <div className='flex items-start gap-2.5'>
          <input
            id='legal-gate-agree'
            type='checkbox'
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className='mt-0.5 h-4 w-4 rounded border-slate-400 text-slate-900 focus:ring-2 focus:ring-brand-500'
          />
          <label htmlFor='legal-gate-agree' className='leading-snug'>{t('legalGate.agree')}</label>
        </div>
        {error && <p role='alert' className='text-rose-700'>{error}</p>}
      </div>
    </Modal>
  );
}

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { HiOutlineCheckCircle, HiOutlineExclamationCircle } from 'react-icons/hi';
import { API_BASE_URL, parseJsonSafely } from '../utils/http';
import usePageTitle from '../hooks/usePageTitle';
import { useTranslation } from 'react-i18next';

/**
 * Where the unsubscribe link in an automated follow-up email lands.
 *
 * One action, taken on arrival: opening the link IS the request, as the email
 * says it will be. Asking a person to confirm they meant the link they clicked
 * turns "stop" into a chore. Link scanners that pre-fetch URLs do not run this
 * script, so they do not unsubscribe anyone.
 *
 * Fetches directly rather than through apiClient, like the share page: the
 * person here has no session, and apiClient's refresh machinery would try to
 * give them one.
 */
export default function Unsubscribe() {
  const { t } = useTranslation();
  usePageTitle(t('unsubscribe.title'));
  const { token } = useParams();
  const [state, setState] = useState({ status: 'working' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/unsubscribe/${encodeURIComponent(token)}`, { method: 'POST' });
        const body = await parseJsonSafely(res);
        if (cancelled) return;
        if (res.ok && body?.success) setState({ status: 'done', agency: body.data?.agency });
        else setState({ status: 'invalid', message: body?.message });
      } catch {
        if (!cancelled) setState({ status: 'error' });
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  return (
    <main className='min-h-screen flex items-center justify-center bg-slate-50 p-4'>
      <div className='w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center' role='status' aria-live='polite'>
        {state.status === 'working' && (
          <>
            <div className='w-6 h-6 mx-auto border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin' aria-hidden='true' />
            <p className='mt-4 text-sm text-slate-600'>{t('unsubscribe.working')}</p>
          </>
        )}

        {state.status === 'done' && (
          <>
            <HiOutlineCheckCircle className='w-10 h-10 mx-auto text-emerald-600' aria-hidden='true' />
            <h1 className='mt-3 text-lg font-bold text-slate-900'>{t('unsubscribe.doneTitle')}</h1>
            <p className='mt-2 text-sm text-slate-600 leading-relaxed'>
              {t('unsubscribe.doneBody', { agency: state.agency || t('unsubscribe.theAgency') })}
            </p>
            <p className='mt-4 text-xs text-slate-600 leading-relaxed'>{t('unsubscribe.doneNote')}</p>
          </>
        )}

        {(state.status === 'invalid' || state.status === 'error') && (
          <>
            <HiOutlineExclamationCircle className='w-10 h-10 mx-auto text-slate-500' aria-hidden='true' />
            <h1 className='mt-3 text-lg font-bold text-slate-900'>{t('unsubscribe.failedTitle')}</h1>
            <p className='mt-2 text-sm text-slate-600 leading-relaxed'>
              {state.status === 'error' ? t('unsubscribe.networkError') : (state.message || t('unsubscribe.invalid'))}
            </p>
          </>
        )}
      </div>
    </main>
  );
}

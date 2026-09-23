import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useLocation } from 'react-router-dom';
import { HiOutlineOfficeBuilding } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../utils/http';
import { getWorkspace, setWorkspace, normaliseWorkspace } from '../utils/workspace';
import { useTenant } from '../contexts/TenantProvider';

/**
 * "Signing in to AkmRealtor · Change" above the sign-in and forgot-password
 * forms.
 *
 * Every workspace shares this address, so the person says which one they
 * mean. The choice is remembered on this device, can arrive in a link
 * (?workspace=akmrealtor, used by the platform console and invitations), and
 * is checked against the server before it is kept, so a typo reads "there's
 * no workspace called …" rather than "invalid email or password".
 */

async function lookup(slug) {
  const res = await fetch(`${API_BASE_URL}/api/tenant/lookup`, {
    credentials: 'include',
    headers: slug ? { 'x-tenant': slug } : {},
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(body?.message || 'Could not check that workspace.');
    err.status = res.status;
    throw err;
  }
  return body?.data;
}

export default function WorkspacePicker({ onChange }) {
  const { t } = useTranslation();
  const location = useLocation();
  const tenantCtx = useTenant();
  const [current, setCurrent] = useState(null); // { slug, name }
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const choose = useCallback(
    async (slug, { quiet = false } = {}) => {
      setChecking(true);
      setError('');
      try {
        const ws = await lookup(slug);
        setWorkspace(slug);
        setCurrent(ws);
        setEditing(false);
        onChange?.(ws);
        // The page's name, logo and colours follow the workspace chosen.
        tenantCtx?.refresh?.().catch(() => {});
        return true;
      } catch (err) {
        if (quiet) {
          // A remembered workspace that has since gone: fall back to the default.
          setWorkspace('');
          const ws = await lookup('').catch(() => null);
          setCurrent(ws);
        } else {
          setError(err.status === 404 ? err.message : t('workspacePicker.checkFailed'));
        }
        return false;
      } finally {
        setChecking(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onChange, t]
  );

  useEffect(() => {
    const fromLink = normaliseWorkspace(new URLSearchParams(location.search).get('workspace'));
    if (fromLink) {
      setDraft(fromLink);
      choose(fromLink).then((ok) => { if (!ok) setEditing(true); });
    } else {
      choose(getWorkspace(), { quiet: true });
    }
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = (e) => {
    e.preventDefault();
    const slug = normaliseWorkspace(draft);
    if (!slug) {
      setError(t('workspacePicker.enterName'));
      return;
    }
    choose(slug);
  };

  if (editing) {
    return (
      <div className='rounded-xl border border-slate-200 bg-slate-50 p-4'>
        <label htmlFor='workspace' className='block text-sm font-medium text-slate-700'>
          {t('workspacePicker.label')}
        </label>
        <p className='text-xs text-slate-500 mt-0.5'>{t('workspacePicker.hint')}</p>
        {/* Not a nested <form>: this sits inside the sign-in form. */}
        <div className='mt-2 flex gap-2'>
          <input
            id='workspace'
            value={draft}
            onChange={(e) => { setDraft(normaliseWorkspace(e.target.value)); setError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(e); }}
            placeholder='akmrealtor'
            autoCapitalize='none'
            autoCorrect='off'
            spellCheck={false}
            autoFocus
            className='flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 font-mono placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500'
          />
          <button
            type='button'
            onClick={submit}
            disabled={checking}
            className='px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium disabled:opacity-50'
          >
            {checking ? t('workspacePicker.checking') : t('workspacePicker.use')}
          </button>
        </div>
        {error && <p role='alert' className='mt-2 text-xs text-rose-600'>{error}</p>}
        <div className='mt-2 flex gap-3 text-xs'>
          {current && (
            <button type='button' onClick={() => { setEditing(false); setError(''); }} className='text-slate-500 hover:text-slate-700'>
              {t('workspacePicker.keep', { name: current.name })}
            </button>
          )}
          {getWorkspace() && (
            <button type='button' onClick={() => choose('')} className='text-slate-500 hover:text-slate-700'>
              {t('workspacePicker.useDefault')}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className='flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5'>
      {current?.logoUrl ? (
        <img src={current.logoUrl} alt='' className='w-8 h-8 rounded-lg object-cover flex-shrink-0' />
      ) : (
        <span className='w-8 h-8 rounded-lg bg-white ring-1 ring-slate-200 flex items-center justify-center flex-shrink-0'>
          <HiOutlineOfficeBuilding className='w-4 h-4 text-slate-500' aria-hidden='true' />
        </span>
      )}
      <div className='min-w-0 flex-1'>
        <p className='text-[11px] uppercase tracking-wide font-semibold text-slate-500'>{t('workspacePicker.signingInTo')}</p>
        <p className='text-sm font-semibold text-slate-900 truncate'>{current?.name || '…'}</p>
      </div>
      <button
        type='button'
        onClick={() => { setDraft(getWorkspace()); setEditing(true); }}
        className='text-sm font-medium text-brand-700 hover:text-brand-900 flex-shrink-0'
      >
        {t('workspacePicker.change')}
      </button>
    </div>
  );
}

WorkspacePicker.propTypes = {
  onChange: PropTypes.func,
};

import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { HiOutlineExclamationCircle, HiOutlineCheck } from 'react-icons/hi';
import { API_BASE_URL, normalizeImageUrl } from '../utils/http';
import { useTenant } from '../contexts/TenantProvider';
import { signInSuccess } from '../redux/user/userSlice';
import { useTranslation } from 'react-i18next';

/**
 * Setting up an account from an invitation.
 *
 * The second page in the product a stranger can reach, and like the shared
 * property page it fetches directly rather than through `apiClient` — that
 * client carries session-refresh machinery, and someone arriving here has no
 * session to refresh.
 *
 * It never asks which workspace they belong to, because it cannot expect them
 * to know: the token in the URL answers that, and the page just shows them
 * whose product they are joining.
 */

const RULES = [
  { id: 'len', label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { id: 'upper', label: 'An uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { id: 'lower', label: 'A lowercase letter', test: (p) => /[a-z]/.test(p) },
  { id: 'num', label: 'A number', test: (p) => /\d/.test(p) },
  { id: 'sym', label: 'A symbol', test: (p) => /[!@#$%^&*(),.?":{}|<>]/.test(p) },
];

export default function AcceptInvite() {
  const { t } = useTranslation();
  const { token } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { refresh: refreshWorkspace } = useTenant();

  const [state, setState] = useState({ status: 'loading' });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/invite/${encodeURIComponent(token)}`);
      const body = await res.json().catch(() => null);
      if (res.ok && body?.data) return setState({ status: 'ready', data: body.data });
      return setState({ status: 'invalid', message: body?.message || 'This invitation is no longer valid.' });
    } catch (_) {
      setState({ status: 'invalid', message: 'Could not reach the server. Check your connection and try again.' });
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const met = RULES.filter((r) => r.test(password));
  const strongEnough = met.length === RULES.length;
  const matches = password.length > 0 && password === confirm;

  async function submit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/invite/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message || 'Could not set your password.');

      // Accepting sets the session cookies, but the client also has to know who
      // it is: the route guards read Redux, not cookies, so without this the
      // redirect below bounces straight back to the sign-in page — a session
      // that exists on the server and nowhere else.
      const me = await fetch(`${API_BASE_URL}/api/user/me`, { credentials: 'include' });
      if (me.ok) dispatch(signInSuccess(await me.json()));

      // Re-read the workspace config rather than just dropping the cached copy.
      // It was fetched while signed out, when the request had no token to name a
      // workspace and fell through to the default one — so without this the new
      // admin lands inside their own agency wearing somebody else's name and
      // colours. `refresh` also re-applies the brand tokens to :root.
      await refreshWorkspace().catch(() => {});

      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  if (state.status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (state.status === 'invalid') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="text-center max-w-sm">
          <HiOutlineExclamationCircle className="w-10 h-10 text-slate-300 mx-auto" />
          <h1 className="text-base font-semibold text-slate-900 mt-3">{state.message}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('acceptInvite.invitationsExpireAndCanOnlyBe')}</p>
          <button
            type="button"
            onClick={() => navigate('/sign-in')}
            className="mt-4 text-sm font-medium text-slate-700 hover:text-slate-900 underline"
          >{t('acceptInvite.goToSignIn')}</button>
        </div>
      </div>
    );
  }

  const { workspace, email, name, hasPassword } = state.data;
  const brand = workspace?.tokens?.brand || '#0f172a';

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2.5 mb-6">
          {workspace.logoUrl ? (
            <img src={normalizeImageUrl(workspace.logoUrl)} alt="" className="h-8 w-auto" />
          ) : (
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-bold text-sm"
              style={{ background: brand }}
            >
              {workspace.name.charAt(0)}
            </div>
          )}
          <span className="font-semibold text-slate-900">{workspace.name}</span>
        </div>

        <form onSubmit={submit} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h1 className="text-lg font-bold text-slate-900">
            {hasPassword ? 'Choose a new password' : `Welcome${name ? `, ${name}` : ''}`}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {hasPassword
              ? 'Set a new password for your account.'
              : 'Set a password and you are in.'}
          </p>

          <div className="mt-4 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
            <div className="text-xs text-slate-500">{t('acceptInvite.signingInAs')}</div>
            <div className="text-sm font-medium text-slate-900 truncate">{email}</div>
          </div>

          <label className="block text-sm font-medium text-slate-700 mt-4 mb-1.5">{t('acceptInvite.password')}</label>
          <input
            type="password"
            autoFocus
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          />

          <ul className="mt-2.5 space-y-1">
            {RULES.map((r) => {
              const ok = r.test(password);
              return (
                <li
                  key={r.id}
                  className={`flex items-center gap-1.5 text-xs ${ok ? 'text-emerald-600' : 'text-slate-400'}`}
                >
                  <HiOutlineCheck className={`w-3.5 h-3.5 ${ok ? 'opacity-100' : 'opacity-30'}`} />
                  {r.label}
                </li>
              );
            })}
          </ul>

          <label className="block text-sm font-medium text-slate-700 mt-4 mb-1.5">{t('acceptInvite.confirmPassword')}</label>
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          />
          {confirm.length > 0 && !matches && (
            <p className="text-xs text-rose-600 mt-1.5">{t('acceptInvite.thoseDoNotMatch')}</p>
          )}

          {error && (
            <p className="text-sm text-rose-600 mt-3 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving || !strongEnough || !matches}
            className="w-full mt-5 px-4 py-2.5 rounded-lg text-white text-sm font-semibold disabled:opacity-50 transition-opacity"
            style={{ background: brand }}
          >
            {saving ? 'Setting up…' : 'Set password and continue'}
          </button>
        </form>
      </div>
    </div>
  );
}

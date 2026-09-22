import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  HiOutlineBan,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineExclamation,
  HiOutlineEye,
  HiOutlineMail,
  HiOutlineOfficeBuilding,
  HiOutlinePlay,
  HiOutlinePlus,
  HiOutlineRefresh,
  HiOutlineSearch,
} from 'react-icons/hi';
import { apiClient } from '../utils/http';
import { useNotification } from '../contexts/NotificationContext';
import { useActingAs } from '../hooks/useActingAs';
import { Button, Badge, Input, Select, Spinner, Modal, EmptyState, PageHeader } from '../design-system';
import { formatDate, formatNumber } from '../utils/currency';
import { useTranslation } from 'react-i18next';

/**
 * The vendor's console: every workspace on the platform, and the form that
 * creates a new one.
 *
 * Restricted to platform operators — a workspace admin runs one agency and has
 * no business here. The API enforces that; this page only reflects it, and
 * shows a plain "restricted" state rather than an error if someone reaches it.
 */

const STATUS_STYLE = {
  trial: { variant: 'info', icon: HiOutlineClock },
  active: { variant: 'success', icon: HiOutlineCheckCircle },
  suspended: { variant: 'warning', icon: HiOutlineBan },
  cancelled: { variant: 'error', icon: HiOutlineBan },
};

const PLANS = ['trial', 'starter', 'growth', 'enterprise'];

function cx(...xs) {
  return xs.filter(Boolean).join(' ');
}

function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

// ─── New workspace form ───────────────────────────────────────────────────────

function NewWorkspaceModal({ open, onClose, onCreated }) {
  const { t } = useTranslation();
  const { showError } = useNotification();
  const [form, setForm] = useState({
    name: '', slug: '', adminEmail: '', adminName: '', plan: 'trial', trialDays: 14,
  });
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugState, setSlugState] = useState(null); // { available, reason }
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  // Derive the address from the name until the operator edits it themselves —
  // typing the same words twice is the most avoidable friction in this form.
  const slug = slugTouched ? form.slug : slugify(form.name);

  useEffect(() => {
    if (!open) {
      setForm({ name: '', slug: '', adminEmail: '', adminName: '', plan: 'trial', trialDays: 14 });
      setSlugTouched(false);
      setSlugState(null);
      setResult(null);
    }
  }, [open]);

  useEffect(() => {
    if (!slug || slug.length < 3) {
      setSlugState(null);
      return undefined;
    }
    // Debounced: the operator is still typing, and each check is a query.
    const timer = setTimeout(() => {
      apiClient
        .get(`/platform/tenants/check-slug?slug=${encodeURIComponent(slug)}`, { silent: true })
        .then((res) => setSlugState(res?.data || null))
        .catch(() => setSlugState(null));
    }, 350);
    return () => clearTimeout(timer);
  }, [slug]);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiClient.post('/platform/tenants', { ...form, slug });
      setResult(res?.data || null);
      onCreated();
    } catch (err) {
      showError(err?.message || 'Could not create the workspace.');
    } finally {
      setSaving(false);
    }
  }

  const canSubmit = form.name.trim() && form.adminEmail.trim() && slugState?.available;

  return (
    <Modal open={open} onClose={onClose} title={result ? 'Workspace created' : 'New workspace'}>
      {result ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <HiOutlineCheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-emerald-900">
              <p className="font-semibold">{result.tenant.name} is ready.</p>
              <p className="mt-0.5">{t('platformConsole.address')}<span className="font-mono">{result.tenant.slug}</span></p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-4 text-sm space-y-2">
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">{t('platformConsole.admin')}</span>
              <span className="font-medium text-slate-900">{result.admin.email}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">{t('platformConsole.plan')}</span>
              <span className="font-medium text-slate-900 capitalize">{result.tenant.plan}</span>
            </div>
          </div>

          {result.needsPasswordSetup && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <HiOutlineExclamation className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-900">
                No password was set. Tell {result.admin.email} to use <strong>{t('platformConsole.forgotPassword')}</strong>
                {' '}on the sign-in page to choose their own.
              </p>
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={onClose}>{t('platformConsole.done')}</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Input
            label={t('platformConsole.agencyName')}
            required
            autoFocus
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder={t('platformConsole.acmeRealty')}
          />

          <div>
            <Input
              label={t('platformConsole.workspaceAddress')}
              required
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setForm({ ...form, slug: slugify(e.target.value) });
              }}
              hint="Lowercase letters, digits and hyphens. This becomes their subdomain and cannot be changed later."
              error={slugState && !slugState.available ? slugState.reason : undefined}
            />
            {slugState?.available && (
              <p className="text-xs text-emerald-600 mt-1">{slug} is available.</p>
            )}
          </div>

          <Input
            label={t('platformConsole.adminEmail')}
            type="email"
            required
            value={form.adminEmail}
            onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
            hint="They get the first admin account and set their own password."
            placeholder={t('platformConsole.ownerAcmerealtyIn')}
          />

          <Input
            label={t('platformConsole.adminUsername')}
            value={form.adminName}
            onChange={(e) => setForm({ ...form, adminName: e.target.value })}
            hint="Defaults to the part of the email before the @."
          />

          <div className="grid grid-cols-2 gap-3">
            <Select
              label={t('platformConsole.plan')}
              value={form.plan}
              onChange={(e) => setForm({ ...form, plan: e.target.value })}
            >
              {PLANS.map((p) => (
                <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>
              ))}
            </Select>
            {form.plan === 'trial' && (
              <Input
                label={t('platformConsole.trialLength')}
                type="number"
                min={1}
                max={180}
                value={form.trialDays}
                onChange={(e) => setForm({ ...form, trialDays: Number(e.target.value) })}
                hint="days"
              />
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>{t('platformConsole.cancel')}</Button>
            <Button type="submit" loading={saving} disabled={!canSubmit}>{t('platformConsole.createWorkspace')}</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PlatformConsole() {
  const { t } = useTranslation();
  const { showSuccess, showError } = useNotification();
  const { enter } = useActingAs();

  const [tenants, setTenants] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [restricted, setRestricted] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (status !== 'all') params.set('status', status);
      if (query.trim()) params.set('q', query.trim());

      const [list, sum] = await Promise.all([
        apiClient.get(`/platform/tenants?${params}`, { silent: true }),
        apiClient.get('/platform/summary', { silent: true }),
      ]);
      setTenants(list?.data?.tenants || []);
      setSummary(sum?.data || null);
      setRestricted(false);
    } catch (err) {
      // 403 here is the ordinary answer for a workspace admin who found the
      // URL, not a fault worth a red error toast.
      if (err?.statusCode === 403) {
        setRestricted(true);
      } else {
        showError(err?.message || 'Could not load workspaces.');
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, query]);

  useEffect(() => {
    const timer = setTimeout(load, query ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, query]);

  /**
   * Open a customer's workspace as they see it.
   *
   * Read-only — the operator can look at every screen but cannot change the
   * agency's records. The confirmation is not ceremony: opening someone else's
   * workspace is logged against the operator's name, and they should know that
   * before they do it rather than discover it in an audit.
   */
  async function viewWorkspace(tenant) {
    const ok = window.confirm(
      `Open ${tenant.name} and see the product as their team sees it?\n\n` +
        'The view is read-only, and your visit is recorded on their workspace.'
    );
    if (!ok) return;

    setBusyId(tenant.id);
    try {
      await enter(tenant.id);
    } catch (err) {
      showError(err?.message || 'Could not open that workspace.');
      setBusyId(null);
    }
  }

  /**
   * Re-send the first admin's invitation.
   *
   * The link is shown back to the operator as well as emailed, because the
   * failure this recovers from is usually the email itself — telling them
   * "sent!" when it bounced would recreate the problem they came here to fix.
   */
  async function resendInvite(tenant) {
    setBusyId(tenant.id);
    try {
      const res = await apiClient.post(`/platform/tenants/${tenant.id}/invite`, {});
      const { to, sent, url } = res.data;
      if (sent) {
        showSuccess(`Invitation sent to ${to}.`);
      } else {
        window.prompt(
          `Email could not be sent. Copy this link and pass it to ${to} — it expires in 7 days:`,
          url
        );
      }
    } catch (err) {
      showError(err?.message || 'Could not send that invitation.');
    } finally {
      setBusyId(null);
    }
  }

  async function toggleStatus(tenant) {
    const suspending = tenant.status !== 'suspended';
    if (suspending) {
      const reason = window.prompt(
        `Suspend ${tenant.name}? Everyone there is locked out until you resume it.\n\nReason (recorded on the workspace):`
      );
      if (reason === null) return;
      setBusyId(tenant.id);
      try {
        await apiClient.post(`/platform/tenants/${tenant.id}/suspend`, { reason });
        showSuccess(`${tenant.name} is suspended.`);
        load();
      } catch (err) {
        showError(err?.message || 'Could not suspend that workspace.');
      } finally {
        setBusyId(null);
      }
      return;
    }

    setBusyId(tenant.id);
    try {
      await apiClient.post(`/platform/tenants/${tenant.id}/resume`, {});
      showSuccess(`${tenant.name} is active again.`);
      load();
    } catch (err) {
      showError(err?.message || 'Could not resume that workspace.');
    } finally {
      setBusyId(null);
    }
  }

  const expiring = summary?.expiringTrials || [];

  const tiles = useMemo(() => {
    const by = summary?.byStatus || {};
    return [
      { label: 'Active', value: by.active || 0, tone: 'text-emerald-700 border-t-emerald-500' },
      { label: 'On trial', value: by.trial || 0, tone: 'text-blue-700 border-t-blue-500' },
      { label: 'Suspended', value: by.suspended || 0, tone: 'text-amber-700 border-t-amber-500' },
      { label: 'Total', value: summary?.total || 0, tone: 'text-slate-700 border-t-slate-400' },
    ];
  }, [summary]);

  if (restricted) {
    return (
      <EmptyState
        icon={HiOutlineBan}
        title={t('platformConsole.restrictedArea')}
        body={t('platformConsole.thePlatformConsoleIsForPlatform')}
      />
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('platformConsole.platformConsole')}
        description={t('platformConsole.everyWorkspaceOnThePlatform')}
        actions={
          <>
            <Button variant="secondary" icon={HiOutlineRefresh} onClick={load} disabled={loading}>{t('platformConsole.refresh')}</Button>
            <Button icon={HiOutlinePlus} onClick={() => setCreating(true)}>{t('platformConsole.newWorkspace')}</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className={cx('bg-white border border-slate-200 border-t-2 rounded-xl p-4', t.tone)}>
            <div className="text-2xl font-semibold tabular-nums leading-none">{t.value}</div>
            <div className="text-sm font-medium text-slate-700 mt-1.5">{t.label}</div>
          </div>
        ))}
      </div>

      {expiring.length > 0 && (
        <div className="bg-white border border-slate-200 border-l-2 border-l-amber-500 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-900">
            {expiring.length} trial{expiring.length > 1 ? 's' : ''} ending within a week
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {expiring.map((t) => (
              <span
                key={t.slug}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900"
              >
                {t.name}
                <span className="text-xs text-amber-700">
                  {formatDate(t.trialEndsAt)}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[14rem]">
            <HiOutlineSearch className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('platformConsole.searchByNameAddressOrBilling')}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
            />
          </div>
          <div className="flex items-center gap-1">
            {['all', 'active', 'trial', 'suspended'].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={cx(
                  'px-3 py-1.5 rounded-lg text-sm capitalize transition-colors',
                  status === s ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {loading && !tenants ? (
          <div className="p-12 flex justify-center"><Spinner size="lg" /></div>
        ) : !tenants?.length ? (
          <EmptyState
            icon={HiOutlineOfficeBuilding}
            title={query || status !== 'all' ? 'Nothing matches' : 'No workspaces yet'}
            body={query || status !== 'all' ? 'Try a different search or filter.' : 'Create the first one to get started.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Workspace', 'Plan', 'Users', 'Properties', 'Created', ''].map((h, i) => (
                    <th
                      key={h || i}
                      className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tenants.map((item) => {
                  const style = STATUS_STYLE[item.status] || STATUS_STYLE.active;
                  const overUsers = item.limits?.maxUsers > 0 && item.usage.users >= item.limits.maxUsers;
                  const overListings = item.limits?.maxListings > 0 && item.usage.listings >= item.limits.maxListings;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{item.name}</div>
                        <div className="text-xs text-slate-500 font-mono">
                          {item.customDomain || item.slug}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Badge variant={style.variant} size="sm">{item.status}</Badge>
                          <span className="text-slate-600 capitalize">{item.plan}</span>
                        </div>
                        {item.trialEndsAt && item.status === 'trial' && (
                          <div className="text-xs text-slate-400 mt-0.5">
                            ends {formatDate(item.trialEndsAt)}
                          </div>
                        )}
                      </td>
                      <td className={cx('px-4 py-3 tabular-nums', overUsers ? 'text-amber-700 font-medium' : 'text-slate-600')}>
                        {item.usage.users}
                        {item.limits?.maxUsers > 0 && <span className="text-slate-400"> / {item.limits.maxUsers}</span>}
                      </td>
                      <td className={cx('px-4 py-3 tabular-nums', overListings ? 'text-amber-700 font-medium' : 'text-slate-600')}>
                        {formatNumber(item.usage.listings)}
                        {item.limits?.maxListings > 0 && (
                          <span className="text-slate-400"> / {formatNumber(item.limits.maxListings)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {formatDate(item.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Button
                          size="xs"
                          variant="ghost"
                          icon={HiOutlineMail}
                          className="mr-1"
                          loading={busyId === item.id}
                          onClick={() => resendInvite(item)}
                          title="Re-send the first admin's invitation"
                        >{t('platformConsole.invite')}</Button>
                        <Button
                          size="xs"
                          variant="secondary"
                          icon={HiOutlineEye}
                          className="mr-2"
                          loading={busyId === item.id}
                          onClick={() => viewWorkspace(item)}
                        >{t('platformConsole.view')}</Button>
                        <Button
                          size="xs"
                          variant={item.status === 'suspended' ? 'secondary' : 'ghost'}
                          icon={item.status === 'suspended' ? HiOutlinePlay : HiOutlineBan}
                          loading={busyId === item.id}
                          onClick={() => toggleStatus(item)}
                        >
                          {item.status === 'suspended' ? 'Resume' : 'Suspend'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <NewWorkspaceModal open={creating} onClose={() => setCreating(false)} onCreated={load} />
    </div>
  );
}

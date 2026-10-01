import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  HiOutlineBan,
  HiOutlineCreditCard,
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
import { formatCurrency, formatDate, formatNumber } from '../utils/currency';
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

/** The link that opens sign-in with this workspace already chosen. */
const signInLink = (slug) => `${window.location.origin}/sign-in?workspace=${encodeURIComponent(slug)}`;

function CopySignInLink({ slug, className = '' }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(signInLink(slug)).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }).catch(() => window.prompt('Sign-in link for this workspace:', signInLink(slug)));
      }}
      className={`text-xs font-medium text-brand-700 hover:text-brand-900 ${className}`}
      title="Opens the sign-in page with this workspace already chosen"
    >
      {copied ? 'Copied' : 'Copy sign-in link'}
    </button>
  );
}

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
              <p className="mt-0.5">
                Workspace name: <span className="font-mono font-semibold">{result.tenant.slug}</span>. Members type
                this on the sign-in screen, or use <CopySignInLink slug={result.tenant.slug} />.
              </p>
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

          {/* The invitation went out at creation. This box used to say "no
              password was set, tell them to use Forgot password", so the
              natural next step was pressing Invite again. */}
          {result.needsPasswordSetup && result.invite?.sent && (
            <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <HiOutlineMail className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-emerald-900">
                An invitation is on its way to <strong>{result.admin.email}</strong>. They open the link, choose a
                password and land in {result.tenant.name}. The link works for 7 days. There&apos;s no need to send
                another.
              </p>
            </div>
          )}
          {result.needsPasswordSetup && !result.invite?.sent && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <HiOutlineExclamation className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-900 min-w-0">
                <p>
                  The invitation email could not be sent. Pass this link to <strong>{result.admin.email}</strong>{' '}
                  yourself. It works once, for 7 days.
                </p>
                {result.invite?.url && (
                  <div className="mt-2 flex items-center gap-2">
                    <code className="flex-1 min-w-0 truncate rounded bg-white border border-amber-200 px-2 py-1 text-xs">{result.invite.url}</code>
                    <Button size="xs" variant="secondary" onClick={() => navigator.clipboard?.writeText(result.invite.url)}>Copy</Button>
                  </div>
                )}
              </div>
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

// ─── Ask dialog ───────────────────────────────────────────────────────────────

/**
 * Replaces window.confirm / window.prompt, which are unstyled, block the tab,
 * and cannot be dismissed with the keyboard consistently. `ask` is
 * { title, body, label?, optional?, confirmLabel, danger?, onConfirm(value) }.
 */
function AskDialog({ ask, onClose }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { setValue(''); setBusy(false); }, [ask]);

  if (!ask) return null;
  const needsText = !!ask.label;
  const canConfirm = !busy && (!needsText || ask.optional || value.trim());

  async function confirm(e) {
    e.preventDefault();
    if (!canConfirm) return;
    setBusy(true);
    try {
      await ask.onConfirm(value.trim());
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={ask.title} size="md">
      <form onSubmit={confirm} className="space-y-4">
        {ask.body && <p className="text-sm text-slate-600">{ask.body}</p>}
        {needsText && (
          <Input
            label={ask.label}
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            hint={ask.optional ? 'Optional' : undefined}
          />
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant={ask.danger ? 'danger' : 'primary'} loading={busy} disabled={!canConfirm}>
            {ask.confirmLabel || 'Confirm'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Billing ──────────────────────────────────────────────────────────────────

const INVOICE_TONE = {
  draft: 'slate',
  issued: 'warning',
  paid: 'success',
  void: 'slate',
  uncollectible: 'error',
};

/**
 * One workspace's commercial position: plan, outstanding balance and the
 * invoice ledger. Billing is by hand (no gateway), so every action here is a
 * record of something the operator did outside the product.
 */
function BillingModal({ tenant, onClose, onChanged, ask }) {
  const { showSuccess, showError } = useNotification();
  const [data, setData] = useState(null);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState('');
  const [keepOverrides, setKeepOverrides] = useState(true);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);
    try {
      const [billing, list] = await Promise.all([
        apiClient.get(`/platform/tenants/${tenant.id}/billing`, { silent: true }),
        apiClient.get('/platform/plans', { silent: true }),
      ]);
      setData(billing?.data || null);
      setPlans(list?.data?.plans || []);
      setPlan(billing?.data?.plan?.name || tenant.plan);
    } catch (err) {
      showError(err?.message || 'Could not load billing.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant]);

  useEffect(() => {
    setData(null);
    if (tenant) load();
  }, [tenant, load]);

  async function run(key, fn, done) {
    setBusy(key);
    try {
      await fn();
      showSuccess(done);
      await load();
      onChanged();
    } catch (err) {
      showError(err?.message || 'That did not go through.');
    } finally {
      setBusy(null);
    }
  }

  const changePlan = () =>
    run(
      'plan',
      () => apiClient.post(`/platform/tenants/${tenant.id}/plan`, { plan, keepOverrides }),
      'Plan updated, and its limits applied.'
    );

  const raise = () =>
    run('raise', () => apiClient.post(`/platform/tenants/${tenant.id}/invoices`, {}), 'Invoice raised.');

  function markPaid(inv) {
    ask({
      title: `Mark ${inv.number} as paid`,
      body: 'Record a payment received, however it arrived.',
      label: 'Payment reference',
      optional: true,
      confirmLabel: 'Mark paid',
      onConfirm: (reference) =>
        run(inv._id, () => apiClient.post(`/platform/invoices/${inv._id}/pay`, { reference }), 'Recorded as paid.'),
    });
  }

  function voidInvoice(inv) {
    ask({
      title: `Void ${inv.number}?`,
      body: 'It stays on the ledger, marked void.',
      label: 'Reason',
      confirmLabel: 'Void invoice',
      danger: true,
      onConfirm: (reason) =>
        run(inv._id, () => apiClient.post(`/platform/invoices/${inv._id}/void`, { reason }), 'Invoice voided.'),
    });
  }

  const overrides = data?.overrides && Object.keys(data.overrides).length ? Object.entries(data.overrides) : [];
  const selected = plans.find((p) => p.name === plan);
  const unchanged = plan === data?.plan?.name;

  return (
    <Modal
      open={!!tenant}
      onClose={onClose}
      size="2xl"
      title={tenant ? `Billing · ${tenant.name}` : 'Billing'}
      description="Invoices are raised and settled by hand and recorded here."
    >
      {loading && !data ? (
        <div className="p-10 flex justify-center"><Spinner size="lg" /></div>
      ) : !data ? (
        <EmptyState icon={HiOutlineExclamation} title="Billing could not be loaded" body="Close this and try again." />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Outstanding</div>
              <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
                {formatCurrency(data.outstanding)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Billing state</div>
              <div className="mt-1 text-xl font-semibold capitalize text-slate-900">{data.billing?.state || 'none'}</div>
            </div>
          </div>

          <section className="rounded-xl border border-slate-200 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Plan</h3>
            <Select label="Plan" value={plan} onChange={(e) => setPlan(e.target.value)}>
              {plans.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.label} — {p.monthlyPrice ? `${formatCurrency(p.monthlyPrice)} / month` : 'not billed'}
                </option>
              ))}
            </Select>
            {selected?.description && <p className="text-sm text-slate-500">{selected.description}</p>}
            {overrides.length > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">
                <p className="font-medium">Limits set by hand on this workspace</p>
                <p className="mt-0.5 text-amber-800">
                  {overrides.map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ')}
                </p>
                <label className="mt-2 flex items-center gap-2">
                  <input type="checkbox" checked={keepOverrides} onChange={(e) => setKeepOverrides(e.target.checked)} />
                  Keep these when the plan changes
                </label>
              </div>
            )}
            <div className="flex justify-end">
              <Button onClick={changePlan} loading={busy === 'plan'} disabled={unchanged || !plan}>
                Apply plan
              </Button>
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-900">Invoices</h3>
              <Button size="xs" variant="secondary" icon={HiOutlinePlus} onClick={raise} loading={busy === 'raise'}>
                Raise invoice
              </Button>
            </div>
            {!data.invoices?.length ? (
              <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
                No invoices yet. Raise one for the current period once the plan is set.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      {['Number', 'Period', 'Amount', 'Status', ''].map((h, i) => (
                        <th key={h || i} className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.invoices.map((inv) => {
                      const open = inv.status === 'issued' || inv.status === 'draft';
                      const overdue = inv.status === 'issued' && inv.dueAt && new Date(inv.dueAt) < new Date();
                      return (
                        <tr key={inv._id}>
                          <td className="px-3 py-2 font-mono text-xs text-slate-700">{inv.number}</td>
                          <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                            {formatDate(inv.periodStart)} – {formatDate(inv.periodEnd)}
                          </td>
                          <td className="px-3 py-2 tabular-nums">{formatCurrency(inv.amount)}</td>
                          <td className="px-3 py-2">
                            <Badge variant={overdue ? 'error' : INVOICE_TONE[inv.status] || 'slate'} size="sm">
                              {overdue ? 'overdue' : inv.status}
                            </Badge>
                            {inv.status === 'paid' && inv.paidAt && (
                              <div className="text-xs text-slate-400 mt-0.5">{formatDate(inv.paidAt)}</div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            {open && (
                              <>
                                <Button size="xs" variant="ghost" loading={busy === inv._id} onClick={() => markPaid(inv)}>
                                  Mark paid
                                </Button>
                                <Button size="xs" variant="ghost" disabled={busy === inv._id} onClick={() => voidInvoice(inv)}>
                                  Void
                                </Button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
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
  const [billingFor, setBillingFor] = useState(null);
  const [askState, setAsk] = useState(null);

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
  function viewWorkspace(tenant) {
    setAsk({
      title: `Open ${tenant.name}?`,
      body: 'You will see the product as their team sees it. The view is read-only, and your visit is recorded on their workspace.',
      confirmLabel: 'Open workspace',
      onConfirm: async () => {
        setBusyId(tenant.id);
        try {
          await enter(tenant.id);
        } catch (err) {
          showError(err?.message || 'Could not open that workspace.');
          setBusyId(null);
        }
      },
    });
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
        navigator.clipboard?.writeText(url).catch(() => {});
        setAsk({
          title: 'Email could not be sent',
          body: `The link is copied to your clipboard. Pass it to ${to} yourself — it works once, for 7 days:\n${url}`,
          confirmLabel: 'Done',
          onConfirm: () => {},
        });
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
      setAsk({
        title: `Suspend ${tenant.name}?`,
        body: 'Everyone there is locked out until you resume it.',
        label: 'Reason (recorded on the workspace)',
        confirmLabel: 'Suspend',
        danger: true,
        onConfirm: async (reason) => {
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
        },
      });
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
                        <div className="text-xs text-slate-500">
                          <span className="font-mono">{item.customDomain || item.slug}</span>
                          <span className="mx-1.5 text-slate-300">·</span>
                          <CopySignInLink slug={item.slug} />
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
                          title="Email the first admin a fresh invitation. Only the newest link works."
                        >{t('platformConsole.invite')}</Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          icon={HiOutlineCreditCard}
                          className="mr-1"
                          onClick={() => setBillingFor(item)}
                        >Billing</Button>
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

      <BillingModal tenant={billingFor} onClose={() => setBillingFor(null)} onChanged={load} ask={setAsk} />
      <AskDialog ask={askState} onClose={() => setAsk(null)} />
      <NewWorkspaceModal open={creating} onClose={() => setCreating(false)} onCreated={load} />
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import {
  HiOutlineChartPie,
  HiOutlineColorSwatch,
  HiOutlineExclamation,
  HiOutlineOfficeBuilding,
  HiOutlineRefresh,
} from 'react-icons/hi';
import { apiClient, normalizeImageUrl } from '../utils/http';
import { useNotification } from '../contexts/NotificationContext';
import { useTenant } from '../contexts/TenantProvider';
import { Button, Badge, Input, Select, Spinner } from '../design-system';
import { formatDate, formatNumber } from '../utils/currency';
import { useTranslation } from 'react-i18next';

/**
 * How this workspace looks and reads: its name, logo, colours, and the units
 * and formats its market actually uses.
 *
 * Everything here is per workspace, so an agency in Ludhiana trading in square
 * yards and an agency in Bengaluru trading in square feet each see their own
 * product rather than a compromise between the two.
 */

function cx(...xs) {
  return xs.filter(Boolean).join(' ');
}

const TOKENS = [
  { key: 'brand', label: 'Primary', hint: 'Buttons, links and highlights.' },
  { key: 'brandContrast', label: 'On primary', hint: 'Text that sits on the primary colour.' },
  { key: 'accent', label: 'Accent', hint: 'The active item in the menu.' },
  { key: 'sidebar', label: 'Sidebar', hint: 'The menu background.' },
  { key: 'sidebarText', label: 'Sidebar text', hint: 'Menu labels.' },
];

const AREA_UNITS = [
  { value: 'sqyard', label: 'Square yards (gaj)' },
  { value: 'sqft', label: 'Square feet' },
  { value: 'sqm', label: 'Square metres' },
  { value: 'acre', label: 'Acres' },
  { value: 'cent', label: 'Cents' },
  { value: 'guntha', label: 'Gunthas' },
];

const NUMBER_LOCALES = [
  { value: 'en-IN', label: 'Indian — 12,34,567 (lakh / crore)' },
  { value: 'en-US', label: 'International — 1,234,567' },
];

/** Relative luminance, for the contrast check below. */
function luminance(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const [r, g, b] = [1, 2, 3].map((i) => {
    const c = parseInt(m[i], 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function ColorField({ token, value, onChange }) {
  const valid = /^#[0-9a-f]{6}$/i.test(value || '');
  return (
    <div className="flex items-center gap-3">
      <label
        className="w-10 h-10 rounded-lg border border-slate-200 flex-shrink-0 cursor-pointer overflow-hidden"
        style={{ background: valid ? value : '#ffffff' }}
      >
        <input
          type="color"
          value={valid ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="opacity-0 w-full h-full cursor-pointer"
          aria-label={`${token.label} colour`}
        />
      </label>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-900">{token.label}</div>
        <div className="text-xs text-slate-500">{token.hint}</div>
      </div>
      <input
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#2b6faa"
        spellCheck={false}
        className={cx(
          'w-28 border rounded-lg px-2.5 py-1.5 text-sm font-mono tabular-nums',
          'focus:outline-none focus:ring-2 focus:ring-indigo-500/20',
          valid ? 'border-slate-300' : 'border-rose-300 bg-rose-50'
        )}
      />
    </div>
  );
}

function snapshotOf(tenant) {
  return {
    name: tenant.name || '',
    branding: {
      productName: tenant.branding?.productName || '',
      logoUrl: tenant.branding?.logoUrl || '',
      logoMarkUrl: tenant.branding?.logoMarkUrl || '',
      supportEmail: tenant.branding?.supportEmail || '',
      tokens: { ...(tenant.branding?.tokens || {}) },
    },
    locale: { ...(tenant.locale || {}) },
  };
}

/** Deep equality that ignores key order, which JSON.stringify does not. */
function sameValue(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  const ka = Object.keys(a).filter((k) => a[k] !== undefined);
  const kb = Object.keys(b).filter((k) => b[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => sameValue(a[k], b[k]));
}

export default function WorkspaceBrandingPanel() {
  const { t } = useTranslation();
  const { showSuccess, showError } = useNotification();
  const { tenant, refresh } = useTenant();

  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [usage, setUsage] = useState(null);

  // What was loaded, captured the moment the draft was made. "Unsaved changes"
  // compares against this, not against a fresh read of `tenant`: the workspace
  // config reloads in the background, and comparing to whatever arrived last
  // flagged the page dirty the moment it opened.
  const [baseline, setBaseline] = useState(null);

  useEffect(() => {
    if (!tenant) return;
    const loaded = snapshotOf(tenant);
    // Take the load when there is no draft yet, or when nothing has been edited
    // (so a background refresh is picked up instead of being called an edit).
    if (!draft || (baseline && sameValue(draft, baseline) && !sameValue(loaded, baseline))) {
      setDraft(loaded);
      setBaseline(loaded);
    }
  }, [tenant, draft, baseline]);

  useEffect(() => {
    apiClient
      .get('/tenant/usage', { silent: true })
      .then((res) => setUsage(res?.data || null))
      .catch(() => setUsage(null));
  }, []);

  const dirty = useMemo(
    () => Boolean(draft && baseline && !sameValue(draft, baseline)),
    [draft, baseline]
  );

  // A brand colour with unreadable text on it is the single most common way a
  // themed product ends up looking broken, so it is checked before saving
  // rather than discovered on the live page.
  const contrastWarning = useMemo(() => {
    if (!draft) return null;
    const ratio = contrastRatio(draft.branding.tokens.brand, draft.branding.tokens.brandContrast);
    if (ratio === null || ratio >= 4.5) return null;
    return `Text on your primary colour has a contrast ratio of ${ratio.toFixed(1)}:1 — below the 4.5:1 needed to stay readable. Try a lighter or darker "On primary".`;
  }, [draft]);

  if (!draft) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-10 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const setToken = (key, value) =>
    setDraft((d) => ({ ...d, branding: { ...d.branding, tokens: { ...d.branding.tokens, [key]: value } } }));

  async function save() {
    setSaving(true);
    try {
      await apiClient.patch('/tenant/config', {
        name: draft.name,
        branding: draft.branding,
        locale: draft.locale,
      });
      setBaseline(draft); // what is saved is the new "no changes" point
      await refresh(); // repaints the shell with the new palette immediately
      showSuccess('Your workspace has been updated.');
    } catch (err) {
      showError(err?.message || 'Could not save. Nothing has been changed.');
    } finally {
      setSaving(false);
    }
  }

  const logoPreview = normalizeImageUrl(draft.branding.logoMarkUrl || draft.branding.logoUrl);

  return (
    <div className="space-y-4">
      {/* Plan usage — shown before anyone hits a wall, not at the moment it blocks them. */}
      {usage?.usage && Object.keys(usage.usage).length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 ring-1 ring-indigo-100 flex items-center justify-center flex-shrink-0">
              <HiOutlineChartPie className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-slate-900">{t('workspaceBranding.yourPlan')}</h2>
              <p className="text-sm text-slate-500 mt-0.5 capitalize">
                {usage.plan}
                {usage.trialEndsAt && ` · trial ends ${formatDate(usage.trialEndsAt)}`}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Object.entries(usage.usage).map(([key, u]) => {
              const label = key === 'maxUsers' ? 'Users' : key === 'maxListings' ? 'Properties' : key;
              const pct = u.unlimited ? 0 : Math.min(100, Math.round((u.used / u.cap) * 100));
              return (
                <div key={key}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium text-slate-700">{label}</span>
                    <span className="text-slate-500 tabular-nums">
                      {formatNumber(u.used)}
                      {u.unlimited ? ' · unlimited' : ` of ${formatNumber(u.cap)}`}
                    </span>
                  </div>
                  {!u.unlimited && (
                    <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={cx('h-full rounded-full', u.nearLimit ? 'bg-amber-500' : 'bg-emerald-500')}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                  {u.nearLimit && (
                    <p className="text-xs text-amber-700 mt-1">
                      {u.remaining === 0
                        ? 'You have used all of these.'
                        : `${formatNumber(u.remaining)} left.`}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Identity */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-start gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 ring-1 ring-indigo-100 flex items-center justify-center flex-shrink-0">
            <HiOutlineOfficeBuilding className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">{t('workspaceBranding.yourAgency')}</h2>
            <p className="text-sm text-slate-500 mt-0.5">{t('workspaceBranding.whatYourTeamAndYourClients')}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label={t('workspaceBranding.agencyName')}
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          />
          <Input
            label={t('workspaceBranding.productName')}
            hint="Shown in the menu and browser tab. Defaults to your agency name."
            value={draft.branding.productName}
            onChange={(e) =>
              setDraft((d) => ({ ...d, branding: { ...d.branding, productName: e.target.value } }))
            }
          />
          <Input
            label={t('workspaceBranding.logoUrl')}
            hint="A wide logo for reports and the sign-in page."
            value={draft.branding.logoUrl}
            onChange={(e) => setDraft((d) => ({ ...d, branding: { ...d.branding, logoUrl: e.target.value } }))}
          />
          <Input
            label={t('workspaceBranding.squareMarkUrl')}
            hint="A square version for the menu."
            value={draft.branding.logoMarkUrl}
            onChange={(e) =>
              setDraft((d) => ({ ...d, branding: { ...d.branding, logoMarkUrl: e.target.value } }))
            }
          />
          <Input
            label={t('workspaceBranding.supportEmail')}
            type="email"
            hint="Where your team is told to go for help."
            value={draft.branding.supportEmail}
            onChange={(e) =>
              setDraft((d) => ({ ...d, branding: { ...d.branding, supportEmail: e.target.value } }))
            }
          />
        </div>
      </div>

      {/* Colours */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 ring-1 ring-indigo-100 flex items-center justify-center flex-shrink-0">
              <HiOutlineColorSwatch className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">{t('workspaceBranding.colours')}</h2>
              <p className="text-sm text-slate-500 mt-0.5">{t('workspaceBranding.appliedAcrossTheAppAsSoon')}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            icon={HiOutlineRefresh}
            onClick={() =>
              setDraft((d) => ({
                ...d,
                branding: {
                  ...d.branding,
                  tokens: {
                    brand: '#2b6faa', brandContrast: '#ffffff', accent: '#0ea5e9',
                    sidebar: '#0f172a', sidebarText: '#e2e8f0',
                  },
                },
              }))
            }
          >{t('workspaceBranding.resetToDefault')}</Button>
        </div>

        <div className="space-y-4">
          {TOKENS.map((token) => (
            <ColorField
              key={token.key}
              token={token}
              value={draft.branding.tokens[token.key]}
              onChange={(v) => setToken(token.key, v)}
            />
          ))}
        </div>

        {contrastWarning && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <HiOutlineExclamation className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-900">{contrastWarning}</p>
          </div>
        )}

        {/* Live preview, so the choice is judged on what it looks like rather
            than on a hex value. */}
        <div className="mt-5 rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-200">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('workspaceBranding.preview')}</span>
          </div>
          <div className="flex">
            <div
              className="w-40 p-3 space-y-1.5 flex-shrink-0"
              style={{ background: draft.branding.tokens.sidebar }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 overflow-hidden"
                  style={{ background: draft.branding.tokens.brand }}
                >
                  {logoPreview ? (
                    <img src={logoPreview} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <HiOutlineOfficeBuilding
                      className="w-3.5 h-3.5"
                      style={{ color: draft.branding.tokens.brandContrast }}
                    />
                  )}
                </div>
                <span className="text-xs font-bold truncate" style={{ color: '#ffffff' }}>
                  {draft.branding.productName || draft.name || 'Your agency'}
                </span>
              </div>
              <div
                className="text-[11px] px-2 py-1 rounded"
                style={{ color: draft.branding.tokens.accent, background: 'rgba(255,255,255,.06)' }}
              >{t('workspaceBranding.dashboard')}</div>
              <div className="text-[11px] px-2 py-1" style={{ color: draft.branding.tokens.sidebarText }}>{t('workspaceBranding.properties')}</div>
            </div>
            <div className="flex-1 p-4 bg-slate-50 flex items-center gap-3">
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg text-sm font-medium"
                style={{
                  background: draft.branding.tokens.brand,
                  color: draft.branding.tokens.brandContrast,
                }}
              >{t('workspaceBranding.newProperty')}</button>
              <span className="text-sm" style={{ color: draft.branding.tokens.brand }}>{t('workspaceBranding.aLink')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Locale */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-base font-semibold text-slate-900">Units &amp; formats</h2>
        <p className="text-sm text-slate-500 mt-0.5 mb-5">{t('workspaceBranding.howPricesAreasAndDatesAre')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label={t('workspaceBranding.landAreaUnit')}
            value={draft.locale.areaUnit || 'sqyard'}
            onChange={(e) => setDraft((d) => ({ ...d, locale: { ...d.locale, areaUnit: e.target.value } }))}
          >
            {AREA_UNITS.map((u) => (
              <option key={u.value} value={u.value}>{u.label}</option>
            ))}
          </Select>
          <Select
            label={t('workspaceBranding.numberFormat')}
            value={draft.locale.numberLocale || 'en-IN'}
            onChange={(e) => setDraft((d) => ({ ...d, locale: { ...d.locale, numberLocale: e.target.value } }))}
          >
            {NUMBER_LOCALES.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </Select>
          <Input
            label={t('workspaceBranding.currency')}
            hint="Three-letter code, e.g. INR."
            maxLength={3}
            value={draft.locale.currency || ''}
            onChange={(e) =>
              setDraft((d) => ({ ...d, locale: { ...d.locale, currency: e.target.value.toUpperCase() } }))
            }
          />
          <Input
            label={t('workspaceBranding.timeZone')}
            value={draft.locale.timezone || ''}
            onChange={(e) => setDraft((d) => ({ ...d, locale: { ...d.locale, timezone: e.target.value } }))}
          />
        </div>
      </div>

      {dirty && (
        <div className="sticky bottom-4 bg-white border border-slate-200 rounded-xl shadow-lg px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Badge variant="warning">{t('workspaceBranding.unsaved')}</Badge>
            <span className="text-sm text-slate-600">{t('workspaceBranding.yourWorkspaceHasUnsavedChanges')}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" disabled={saving} onClick={() => setDraft(null)}>{t('workspaceBranding.discard')}</Button>
            <Button loading={saving} onClick={save}>{t('workspaceBranding.saveChanges')}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

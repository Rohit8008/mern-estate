import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  HiOutlineLockClosed,
  HiOutlinePencil,
  HiOutlineRefresh,
  HiOutlineViewGrid,
} from 'react-icons/hi';
import { apiClient } from '../utils/http';
import { useNotification } from '../contexts/NotificationContext';
import { useTenant } from '../contexts/TenantProvider';
import { Button, Badge, Spinner } from '../design-system';
import { useTranslation } from 'react-i18next';

/**
 * Which screens this workspace uses, and what it calls them.
 *
 * The product ships a catalogue of every screen that exists; an agency turns on
 * the ones they bought and renames the ones whose wording doesn't match how
 * they work — a firm that only deals in plots calls Clients "Enquiries".
 *
 * Turning a screen off removes it from the menu AND makes its URL unreachable,
 * so this is a real setting rather than a cosmetic one.
 */

function cx(...xs) {
  return xs.filter(Boolean).join(' ');
}

function Toggle({ enabled, disabled, onChange, labelledBy }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={cx(
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2',
        enabled ? 'bg-indigo-600' : 'bg-slate-200',
        disabled && 'opacity-40 cursor-not-allowed'
      )}
    >
      <span
        className={cx(
          'inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm',
          enabled ? 'translate-x-6' : 'translate-x-1'
        )}
      />
    </button>
  );
}

export default function WorkspaceScreensPanel() {
  const { t } = useTranslation();
  const { showSuccess, showError } = useNotification();
  const { refresh: refreshTenant } = useTenant();

  const [catalogue, setCatalogue] = useState(null);
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Pending edits, applied on save. Keeping them separate from the loaded
  // catalogue means "Discard" is just dropping these, and the panel never shows
  // a state the server hasn't confirmed.
  const [screenEdits, setScreenEdits] = useState({});
  const [labelEdits, setLabelEdits] = useState({});
  const [renaming, setRenaming] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/tenant/screens');
      setCatalogue(res?.data?.screens || []);
      setSections(res?.data?.sections || []);
      setScreenEdits({});
      setLabelEdits({});
    } catch (err) {
      setError(err?.message || 'Could not load the screen list.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const isEnabled = useCallback(
    (screen) => (screenEdits[screen.id] !== undefined ? screenEdits[screen.id] : screen.enabled),
    [screenEdits]
  );

  const labelOf = useCallback(
    (screen) => (labelEdits[screen.id] !== undefined ? labelEdits[screen.id] : screen.label),
    [labelEdits]
  );

  const dirty = Object.keys(screenEdits).length > 0 || Object.keys(labelEdits).length > 0;

  const grouped = useMemo(() => {
    if (!catalogue) return [];
    return sections
      .map((section) => ({
        ...section,
        items: catalogue
          .filter((s) => s.section === section.id && !s.deprecated)
          .sort((a, b) => a.order - b.order),
      }))
      .filter((section) => section.items.length > 0);
  }, [catalogue, sections]);

  const enabledCount = useMemo(
    () => (catalogue || []).filter((s) => isEnabled(s)).length,
    [catalogue, isEnabled]
  );

  async function save() {
    setSaving(true);
    try {
      const res = await apiClient.patch('/tenant/screens', {
        screens: screenEdits,
        labels: labelEdits,
      });
      setCatalogue(res?.data?.screens || []);
      setSections(res?.data?.sections || []);
      setScreenEdits({});
      setLabelEdits({});
      // The sidebar reads the tenant config, so it has to re-read it to pick
      // this up — otherwise the menu keeps showing what was saved a moment ago.
      await refreshTenant();
      showSuccess('Your menu has been updated.');
    } catch (err) {
      showError(err?.message || 'Could not save. Nothing has been changed.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-10 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <p className="text-sm text-slate-700">{error}</p>
        <Button className="mt-4" variant="secondary" icon={HiOutlineRefresh} onClick={load}>{t('workspaceScreens.tryAgain')}</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 ring-1 ring-indigo-100 flex items-center justify-center flex-shrink-0">
              <HiOutlineViewGrid className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-900">Menu &amp; screens</h2>
              <p className="text-sm text-slate-500 mt-0.5 max-w-prose">{t('workspaceScreens.chooseWhichScreensYourTeamSees')}</p>
            </div>
          </div>
          <Badge variant="slate">{enabledCount} of {catalogue.length} on</Badge>
        </div>
      </div>

      {grouped.map((section) => (
        <div key={section.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {section.label}
            </h3>
          </div>
          <div className="divide-y divide-slate-100">
            {section.items.map((screen) => {
              const on = isEnabled(screen);
              const label = labelOf(screen);
              const renamed = label !== screen.defaultLabel;
              const titleId = `screen-${screen.id}-label`;

              return (
                <div key={screen.id} className="px-5 py-4 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    {renaming === screen.id ? (
                      <input
                        autoFocus
                        value={label}
                        maxLength={40}
                        onChange={(e) => setLabelEdits((p) => ({ ...p, [screen.id]: e.target.value }))}
                        onBlur={() => setRenaming(null)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === 'Escape') setRenaming(null);
                        }}
                        className="w-full max-w-xs border border-indigo-300 rounded-lg px-2.5 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span id={titleId} className="text-sm font-medium text-slate-900">
                          {label}
                        </span>
                        <button
                          type="button"
                          onClick={() => setRenaming(screen.id)}
                          className="text-slate-300 hover:text-slate-600 transition-colors"
                          aria-label={`Rename ${label}`}
                        >
                          <HiOutlinePencil className="w-3.5 h-3.5" />
                        </button>
                        {renamed && (
                          <Badge variant="brand" size="xs">
                            was {screen.defaultLabel}
                          </Badge>
                        )}
                        {screen.core && (
                          <span
                            className="inline-flex items-center gap-1 text-[11px] text-slate-400"
                            title="Part of the core product — this one can't be switched off"
                          >
                            <HiOutlineLockClosed className="w-3 h-3" />{t('workspaceScreens.alwaysOn')}</span>
                        )}
                        {screen.adminOnly && (
                          <Badge variant="slate" size="xs">{t('workspaceScreens.adminsOnly')}</Badge>
                        )}
                      </div>
                    )}
                    <p className="text-xs text-slate-500 mt-1 max-w-prose">{screen.description}</p>
                  </div>

                  <Toggle
                    enabled={on}
                    disabled={screen.core}
                    labelledBy={titleId}
                    onChange={(next) =>
                      setScreenEdits((p) => {
                        // Toggling back to where it started drops the edit, so
                        // "unsaved changes" reflects real differences.
                        if (next === screen.enabled) {
                          const { [screen.id]: _drop, ...rest } = p;
                          return rest;
                        }
                        return { ...p, [screen.id]: next };
                      })
                    }
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {dirty && (
        <div className="sticky bottom-4 bg-white border border-slate-200 rounded-xl shadow-lg px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-slate-600">{t('workspaceScreens.youHaveUnsavedChangesToYour')}</span>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              disabled={saving}
              onClick={() => {
                setScreenEdits({});
                setLabelEdits({});
              }}
            >{t('workspaceScreens.discard')}</Button>
            <Button loading={saving} onClick={save}>{t('workspaceScreens.saveMenu')}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

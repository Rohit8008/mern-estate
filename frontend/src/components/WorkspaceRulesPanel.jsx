import { useCallback, useEffect, useState } from 'react';
import { HiOutlineAdjustments, HiOutlineRefresh } from 'react-icons/hi';
import { apiClient } from '../utils/http';
import { useNotification } from '../contexts/NotificationContext';
import { useTenant } from '../contexts/TenantProvider';
import { Button, EmptyState, Switch, Badge, Input, Select } from '../design-system';

const HOOK_LABELS = {
  'listing.beforeSave': 'When a property is saved',
  'listing.afterSave': 'After a property is saved',
  'listing.beforeImport': 'Before a property import',
  'deal.beforeStageChange': 'When a deal changes stage',
  'lead.onCreate': 'When a lead is created',
};

const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

/**
 * The options of the two rules that take any. Drafts live here and are only
 * sent on Save, so typing a city does not write to the workspace per keystroke.
 */
function RuleConfig({ rule, saved, saving, onSave }) {
  const [city, setCity] = useState(saved?.config?.city || '');
  const [rows, setRows] = useState(
    Object.entries(saved?.config?.priorityBySource || {}).map(([source, priority]) => ({ source, priority }))
  );

  if (rule.name === 'defaultCityFromWorkspace') {
    return (
      <div className='mt-3 flex items-end gap-2 max-w-sm'>
        <Input label='Default city' value={city} maxLength={80} onChange={(e) => setCity(e.target.value)} className='flex-1' />
        <Button size='sm' loading={saving} disabled={city.trim() === (saved?.config?.city || '')} onClick={() => onSave({ city: city.trim() })}>
          Save
        </Button>
      </div>
    );
  }

  if (rule.name === 'tagLeadBySource') {
    const clean = rows.filter((r) => r.source.trim());
    // Keys become Mongo field names, which cannot hold '.' or start with '$'.
    const next = Object.fromEntries(clean.map((r) => [r.source.trim().toLowerCase().replace(/[.$]/g, ' '), r.priority]));
    return (
      <div className='mt-3 space-y-2 max-w-md'>
        {rows.length === 0 && <p className='text-xs text-slate-500'>No mappings yet. Add a source name, such as “99acres”, and the priority its leads start with.</p>}
        {rows.map((r, i) => (
          <div key={i} className='flex items-center gap-2'>
            <Input
              aria-label='Lead source'
              placeholder='Source'
              value={r.source}
              maxLength={100}
              onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, source: e.target.value } : x)))}
              className='flex-1'
            />
            <Select
              aria-label='Priority'
              value={r.priority}
              onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, priority: e.target.value } : x)))}
            >
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
            <Button size='xs' variant='ghost' onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</Button>
          </div>
        ))}
        <div className='flex gap-2'>
          <Button size='xs' variant='secondary' onClick={() => setRows([...rows, { source: '', priority: 'high' }])}>Add source</Button>
          <Button size='xs' loading={saving} onClick={() => onSave({ priorityBySource: next })}>Save</Button>
        </div>
      </div>
    );
  }
  return null;
}

/**
 * Workspace rules: which of the behaviours this deployment ships are switched on.
 *
 * Config selects from a fixed vocabulary of named rules and never carries code
 * (plugins/registry.js), so this lists what exists and lets an admin turn each
 * on or off. A rule's saved options are kept untouched when it is toggled.
 */
export default function WorkspaceRulesPanel() {
  const { showSuccess, showError } = useNotification();
  const { refresh } = useTenant();

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [savingName, setSavingName] = useState('');

  const load = useCallback(() => {
    setError('');
    apiClient
      .get('/rules', { silent: true })
      .then((res) => setData(res?.data || { hooks: [], available: [], configured: [] }))
      .catch((err) => setError(err?.message || 'Could not load the available rules.'));
  }, []);

  useEffect(load, [load]);

  // Change one rule's switch and/or options, keeping the rest of its saved entry.
  const update = async (rule, patch, message) => {
    const current = data.configured || [];
    const exists = current.some((r) => r.implementation === rule.name);
    const next = exists
      ? current.map((r) => (r.implementation === rule.name ? { ...r, ...patch } : r))
      : [...current, { hook: rule.hook, implementation: rule.name, config: {}, enabled: true, order: current.length, ...patch }];
    setSavingName(rule.name);
    try {
      await apiClient.patch('/tenant/config', { workflow: { rules: next } });
      setData((d) => ({ ...d, configured: next }));
      await refresh?.();
      showSuccess(message);
    } catch (err) {
      showError(err?.message || 'Could not save that rule.');
    } finally {
      setSavingName('');
    }
  };

  const toggle = (rule, enabled) =>
    update(rule, { enabled }, `${enabled ? 'Turned on' : 'Turned off'}: ${rule.describe}`);
  const saveConfig = (rule, config) => update(rule, { config }, 'Rule options saved.');

  if (error) {
    return (
      <div className='bg-white rounded-xl border border-slate-200 p-5'>
        <p className='text-sm text-rose-600 mb-3'>{error}</p>
        <Button variant='secondary' icon={HiOutlineRefresh} onClick={load}>Try again</Button>
      </div>
    );
  }
  if (!data) {
    return <div className='bg-white rounded-xl border border-slate-200 p-5 text-sm text-slate-400' aria-busy='true'>Loading&hellip;</div>;
  }

  const byHook = (data.hooks || []).map((hook) => ({
    hook,
    rules: (data.available || []).filter((r) => r.hook === hook),
  })).filter((g) => g.rules.length);
  const known = new Set((data.available || []).map((r) => r.name));
  // A rule saved in config that this deployment no longer ships does nothing;
  // say so rather than letting it look active.
  const orphans = (data.configured || []).filter((r) => !known.has(r.implementation));

  return (
    <div className='bg-white rounded-xl border border-slate-200 p-5'>
      <div className='flex items-center gap-3 mb-1'>
        <div className='w-9 h-9 rounded-xl bg-brand-50 ring-1 ring-brand-100 flex items-center justify-center flex-shrink-0'>
          <HiOutlineAdjustments className='w-5 h-5 text-brand-600' />
        </div>
        <div>
          <h2 className='text-base font-semibold text-slate-900'>Workflow rules</h2>
          <p className='text-xs text-slate-500'>Switch on the checks and clean-ups your team wants applied automatically.</p>
        </div>
      </div>

      {!byHook.length ? (
        <EmptyState icon={HiOutlineAdjustments} title='No rules available' body='This deployment does not ship any workflow rules yet.' />
      ) : (
        <div className='mt-4 space-y-5'>
          {byHook.map(({ hook, rules }) => (
            <section key={hook} aria-label={HOOK_LABELS[hook] || hook}>
              <h3 className='text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1'>{HOOK_LABELS[hook] || hook}</h3>
              <ul className='divide-y divide-slate-100'>
                {rules.map((rule) => {
                  const saved = (data.configured || []).find((r) => r.implementation === rule.name);
                  const on = Boolean(saved && saved.enabled !== false);
                  return (
                    <li key={rule.name} className='py-3'>
                      <div className='flex items-center justify-between gap-4'>
                        <div className='min-w-0'>
                          <p className='text-sm text-slate-800'>{rule.describe}</p>
                          <p className='text-xs text-slate-400 font-mono mt-0.5'>{rule.name}</p>
                        </div>
                        <Switch
                          checked={on}
                          disabled={savingName === rule.name}
                          onChange={(v) => toggle(rule, v)}
                          label={`${on ? 'Turn off' : 'Turn on'} ${rule.name}`}
                        />
                      </div>
                      {on && (
                        <RuleConfig
                          rule={rule}
                          saved={saved}
                          saving={savingName === rule.name}
                          onSave={(config) => saveConfig(rule, config)}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {orphans.length > 0 && (
        <div className='mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900'>
          {orphans.length === 1 ? 'One saved rule is' : `${orphans.length} saved rules are`} not available in this version and{' '}
          {orphans.length === 1 ? 'does' : 'do'} nothing:{' '}
          {orphans.map((r) => <Badge key={r.implementation} variant='warning'>{r.implementation}</Badge>)}
        </div>
      )}
    </div>
  );
}

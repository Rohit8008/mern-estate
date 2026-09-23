import { useMemo, useState } from 'react';
import {
  HiOutlineCheck,
  HiOutlinePlus,
  HiOutlineSearch,
  HiOutlineUserGroup,
  HiOutlineX,
} from 'react-icons/hi';
import { apiClient } from '../../utils/http';
import { Button, Input, Badge, EmptyState } from '../../design-system';
import { useTranslation } from 'react-i18next';
import { useNotification } from '../../contexts/NotificationContext';

/**
 * Choosing which owners a property belongs to, and adding one without leaving
 * the form.
 *
 * A property can have several owners — inherited land is routinely held by
 * siblings — which is why this is a multi-select rather than a dropdown.
 *
 * Adding an owner inline matters more than it looks: an agent taking down a
 * property is usually on the phone to the owner, and sending them to another
 * screen to create a contact first is where a half-entered listing gets
 * abandoned.
 */

function cx(...xs) {
  return xs.filter(Boolean).join(' ');
}

export default function OwnerSelector({ owners, selectedIds, onChange, onOwnerCreated, disabled }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ name: '', email: '', phone: '', companyName: '' });
  const [error, setError] = useState('');

  const selected = useMemo(() => new Set((selectedIds || []).map(String)), [selectedIds]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return owners;
    return owners.filter((o) =>
      [o.name, o.email, o.phone, o.companyName].filter(Boolean).some((v) =>
        String(v).toLowerCase().includes(q)
      )
    );
  }, [owners, query]);

  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(String(id))) next.delete(String(id));
    else next.add(String(id));
    onChange([...next]);
  };

  const { showInfo } = useNotification();

  async function createOwner() {
    if (!draft.name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const created = await apiClient.post('/owner/', draft);
      const owner = created?.data || created;
      // The API hands back an existing owner with the same phone number rather
      // than making a duplicate; only a genuinely new one joins the list.
      if (!owner.existing) onOwnerCreated?.(owner);
      else showInfo(`${owner.name} is already an owner with that phone number, so they were selected.`);
      // Selected straight away — creating an owner from inside the property
      // form always means "and this property is theirs".
      const id = String(owner._id);
      onChange(selected.map(String).includes(id) ? selected : [...selected, id]);
      setDraft({ name: '', email: '', phone: '', companyName: '' });
      setAdding(false);
    } catch (err) {
      setError(err?.message || 'Could not create that owner.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative flex-1 min-w-[12rem]">
          <HiOutlineSearch className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={disabled}
            placeholder={t('ownerSelector.searchOwnersByNamePhoneOr')}
            className="w-full pl-9 pr-8 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 disabled:bg-slate-50"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label={t('ownerSelector.clearSearch')}
            >
              <HiOutlineX className="w-4 h-4" />
            </button>
          )}
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          icon={adding ? HiOutlineX : HiOutlinePlus}
          disabled={disabled}
          onClick={() => setAdding((v) => !v)}
        >
          {adding ? 'Cancel' : 'New owner'}
        </Button>
      </div>

      {adding && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label={t('ownerSelector.name')}
              required
              autoFocus
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <Input
              label={t('ownerSelector.phone')}
              value={draft.phone}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
            />
            <Input
              label={t('ownerSelector.email')}
              type="email"
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            />
            <Input
              label={t('ownerSelector.company')}
              value={draft.companyName}
              onChange={(e) => setDraft({ ...draft, companyName: e.target.value })}
            />
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div className="flex justify-end">
            <Button type="button" size="sm" loading={saving} disabled={!draft.name.trim()} onClick={createOwner}>{t('ownerSelector.addOwner')}</Button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 max-h-64 overflow-y-auto">
        {matches.length === 0 ? (
          <div className="py-8">
            <EmptyState
              icon={HiOutlineUserGroup}
              title={query ? 'No owners match' : 'No owners yet'}
              body={query ? 'Try a different search, or add them as a new owner.' : 'Add the first one above.'}
            />
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {matches.map((owner) => {
              const isOn = selected.has(String(owner._id));
              return (
                <li key={owner._id}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => toggle(owner._id)}
                    className={cx(
                      'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                      isOn ? 'bg-indigo-50/60' : 'hover:bg-slate-50'
                    )}
                  >
                    <span
                      className={cx(
                        'w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 ring-1 transition-colors',
                        isOn ? 'bg-indigo-600 ring-indigo-600' : 'bg-white ring-slate-300'
                      )}
                    >
                      {isOn && <HiOutlineCheck className="w-3.5 h-3.5 text-white" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-900 truncate">{owner.name}</span>
                      <span className="block text-xs text-slate-500 truncate">
                        {[owner.phone, owner.email, owner.companyName].filter(Boolean).join(' · ') || '—'}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="brand">
            {selected.size} owner{selected.size > 1 ? 's' : ''} selected
          </Badge>
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-xs text-slate-500 hover:text-slate-700 underline"
          >{t('ownerSelector.clear')}</button>
        </div>
      )}
    </div>
  );
}

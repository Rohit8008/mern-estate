import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { HiUser, HiX } from 'react-icons/hi';
import { apiClient } from '../../utils/http';
import { Input } from '../../design-system';

/**
 * Ties a buyer requirement to a client, so a person is one record.
 *
 *  • linked      → shows the client, with a way to unlink
 *  • not linked  → search existing clients; picking one fills the buyer fields
 *  • typing a phone that is already a client offers that client
 *  • no match    → (new requirements only) offer to add them as a client too
 *
 * The parent owns `clientId` and `alsoCreateClient`; this only asks.
 */
export default function BuyerClientLink({ clientId, clientName, phone, email, isNew, alsoCreate, onAlsoCreate, onDecline, onChange }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [suggested, setSuggested] = useState(null);
  const [dismissed, setDismissed] = useState('');
  const seq = useRef(0);

  // Search by name.
  useEffect(() => {
    const term = q.trim();
    if (clientId || term.length < 2) { setResults([]); return undefined; }
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      try {
        const res = await apiClient.get(`/clients?q=${encodeURIComponent(term)}&limit=5`, { silent: true });
        if (mine === seq.current) setResults(Array.isArray(res?.data) ? res.data : []);
      } catch (_) {
        if (mine === seq.current) setResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q, clientId]);

  // Is the phone (or email) already a client?
  useEffect(() => {
    const digits = String(phone || '').replace(/\D/g, '');
    const key = `${digits}|${email || ''}`;
    if (clientId || digits.length < 10 || dismissed === key) { setSuggested(null); return undefined; }
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ phone });
        if (email) params.set('email', email);
        const res = await apiClient.get(`/clients/lookup?${params}`, { silent: true });
        if (mine === seq.current) setSuggested(res?.data || null);
      } catch (_) {
        if (mine === seq.current) setSuggested(null);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [phone, email, clientId, dismissed]);

  const pick = (c) => {
    onChange({ _id: c._id, name: c.name, phone: c.phone, email: c.email });
    setQ('');
    setResults([]);
    setSuggested(null);
  };

  if (clientId) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm flex items-center justify-between gap-2">
        <span className="min-w-0 flex items-center gap-2">
          <HiUser className="w-4 h-4 text-slate-400 shrink-0" />
          <span className="text-slate-500">Client</span>
          <Link to={`/clients/${clientId}`} className="font-medium hover:underline truncate">{clientName || 'View client'}</Link>
        </span>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-brand-500"
          aria-label="Unlink client"
        >
          <HiX className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Input
        label="Link to an existing client (optional)"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search clients by name…"
        className="mb-0"
      />
      <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg empty:hidden bg-white">
        {results.map((c) => (
          <li key={c._id}>
            <button type="button" onClick={() => pick(c)} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 focus:outline-none focus:bg-slate-50">
              <span className="block truncate font-medium">{c.name}</span>
              <span className="block truncate text-xs text-slate-500">{[c.phone, c.email].filter(Boolean).join(' · ')}</span>
            </button>
          </li>
        ))}
      </ul>

      {suggested && (
        <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm flex items-center justify-between gap-3">
          <span><strong>{suggested.name}</strong> is already a client with this number.</span>
          <span className="flex gap-3 shrink-0">
            <button type="button" onClick={() => pick(suggested)} className="font-medium text-brand-700 hover:underline">Use this client</button>
            <button type="button" onClick={() => { setDismissed(`${String(phone).replace(/\D/g, '')}|${email || ''}`); onDecline?.(); }} className="text-slate-500 hover:underline">Not them</button>
          </span>
        </div>
      )}

      {isNew && !suggested && (
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={!!alsoCreate}
            onChange={(e) => onAlsoCreate(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300"
          />
          Also add them as a client (so deals and follow-ups can be tracked)
        </label>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { HiX, HiHome } from 'react-icons/hi';
import { apiClient } from '../../utils/http';
import { Input, Skeleton } from '../../design-system';

/**
 * Pick one property from the book. Searches through the one listing search
 * (`/listing/search`), like InterestedListings; the choice is handed up as the
 * listing object, or null when cleared.
 */
export default function ListingPicker({ value, onChange, label = 'Property', autoFocus = false }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (value || term.length < 2) { setResults([]); setError(''); return undefined; }
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await apiClient.get(`/listing/search?q=${encodeURIComponent(term)}&limit=6`, { silent: true });
        if (mine !== seq.current) return;
        setResults(res?.data?.listings || []);
        setError('');
      } catch (e) {
        if (mine === seq.current) setError(e?.message || 'Search failed.');
      } finally {
        if (mine === seq.current) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q, value]);

  if (value) {
    return (
      <div>
        <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
        <div className="flex items-center justify-between gap-2 border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
          <span className="min-w-0 flex items-center gap-2">
            <HiHome className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="truncate">{value.name}</span>
          </span>
          <button
            type="button"
            onClick={() => { onChange(null); setQ(''); }}
            className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-brand-500"
            aria-label="Remove property"
          >
            <HiX className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Input
        label={label}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name, area or ID…"
        className="mb-0"
        autoFocus={autoFocus}
      />
      {searching && <Skeleton className="h-9 w-full mt-2" />}
      {error && <p role="alert" className="text-xs text-rose-600 mt-1">{error}</p>}
      {!searching && !error && q.trim().length >= 2 && results.length === 0 && (
        <p className="text-xs text-slate-500 mt-1">No properties found.</p>
      )}
      <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg mt-2 empty:hidden bg-white">
        {results.map((l) => (
          <li key={l._id}>
            <button
              type="button"
              onClick={() => { onChange(l); setQ(''); setResults([]); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 focus:outline-none focus:bg-slate-50"
            >
              <span className="block truncate font-medium">{l.name}</span>
              <span className="block truncate text-xs text-slate-500">{[l.city, l.address].filter(Boolean).join(', ')}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

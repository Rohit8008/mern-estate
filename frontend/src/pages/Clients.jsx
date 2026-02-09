import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiClient } from '../utils/http';

const STATUS_ORDER = ['lead', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];
const STATUS_LABELS = {
  lead: 'New leads',
  contacted: 'Contacted',
  qualified: 'Qualified',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  won: 'Won',
  lost: 'Lost',
};

const STATUS_STYLES = {
  lead: { pill: 'bg-slate-100 text-slate-700 border-slate-200', stripe: 'bg-slate-400' },
  contacted: { pill: 'bg-blue-50 text-blue-700 border-blue-200', stripe: 'bg-blue-500' },
  qualified: { pill: 'bg-indigo-50 text-indigo-700 border-indigo-200', stripe: 'bg-indigo-500' },
  proposal: { pill: 'bg-purple-50 text-purple-700 border-purple-200', stripe: 'bg-purple-500' },
  negotiation: { pill: 'bg-amber-50 text-amber-800 border-amber-200', stripe: 'bg-amber-500' },
  won: { pill: 'bg-emerald-50 text-emerald-800 border-emerald-200', stripe: 'bg-emerald-500' },
  lost: { pill: 'bg-rose-50 text-rose-800 border-rose-200', stripe: 'bg-rose-500' },
};

export default function Clients() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const page = Number(searchParams.get('page') || 1);
  const q = searchParams.get('q') || '';
  const status = searchParams.get('status') || '';

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    params.set('page', String(page));
    params.set('limit', '20');
    return `?${params.toString()}`;
  }, [q, status, page]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const data = await apiClient.get(`/clients${query}`);
        if (!mounted) return;
        setItems(data?.data || []);
        setTotal(data?.total || 0);
      } catch (e) {
        if (!mounted) return;
        setError(e?.message || 'Failed to load clients');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [query]);

  function setParam(key, value) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== 'page') next.delete('page');
    setSearchParams(next);
  }

  async function handleCreate(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = {
      name: form.get('name')?.toString() || '',
      email: form.get('email')?.toString() || '',
      phone: form.get('phone')?.toString() || '',
      status: form.get('status')?.toString() || 'lead',
      notes: form.get('notes')?.toString() || '',
    };
    setCreating(true);
    try {
      await apiClient.post('/clients', payload);
      setFormOpen(false);
      // refresh
      const data = await apiClient.get(`/clients${query}`);
      setItems(data?.data || []);
      setTotal(data?.total || 0);
    } catch (e) {
      setError(e?.message || 'Failed to create client');
    } finally {
      setCreating(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / 20));

  const groups = useMemo(() => {
    const map = new Map();
    for (const s of STATUS_ORDER) map.set(s, []);
    for (const c of items || []) {
      const s = c?.status || 'lead';
      if (!map.has(s)) map.set(s, []);
      map.get(s).push(c);
    }
    return map;
  }, [items]);

  return (
    <div className='space-y-4'>
      <div className='flex flex-col md:flex-row md:items-end md:justify-between gap-3'>
        <div>
          <h1 className='text-2xl md:text-3xl font-bold text-slate-900'>Contacts</h1>
          <p className='text-slate-600 mt-1'>Your assigned clients, grouped by status</p>
        </div>
        <div className='flex items-center gap-2'>
          <button
            className='px-4 py-2.5 rounded-xl bg-slate-900 text-white hover:bg-slate-800 text-sm font-semibold'
            onClick={() => setFormOpen(true)}
          >
            New contact
          </button>
        </div>
      </div>

      <div className='bg-white border border-slate-200 rounded-2xl overflow-hidden'>
        <div className='px-4 py-3 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3'>
          <div className='flex items-center gap-2 overflow-x-auto'>
            <Link
              to='/clients'
              className='px-3 py-2 rounded-xl bg-slate-100 text-slate-900 text-sm font-semibold whitespace-nowrap'
            >
              Main table
            </Link>
            <Link
              to='/deals'
              className='px-3 py-2 rounded-xl text-slate-600 hover:bg-slate-50 text-sm font-semibold whitespace-nowrap'
            >
              Pipeline
            </Link>
            <Link
              to='/calendar'
              className='px-3 py-2 rounded-xl text-slate-600 hover:bg-slate-50 text-sm font-semibold whitespace-nowrap'
            >
              Calendar
            </Link>
          </div>

          <div className='flex flex-col md:flex-row md:items-center gap-2'>
            <input
              className='w-full md:w-[320px] px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:bg-white'
              placeholder='Search name, email, phone'
              value={q}
              onChange={(e) => setParam('q', e.target.value)}
            />
            <select
              className='w-full md:w-[220px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm'
              value={status}
              onChange={(e) => setParam('status', e.target.value)}
            >
              <option value=''>All statuses</option>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s] || s}
                </option>
              ))}
            </select>
            <div className='flex items-center justify-end gap-2'>
              <button
                className='px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-sm font-semibold'
                onClick={() => setParam('page', String(Math.max(1, page - 1)))}
                disabled={page <= 1 || loading}
              >
                Prev
              </button>
              <span className='text-sm text-slate-600 whitespace-nowrap'>
                Page {page} / {totalPages}
              </span>
              <button
                className='px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-sm font-semibold'
                onClick={() => setParam('page', String(Math.min(totalPages, page + 1)))}
                disabled={page >= totalPages || loading}
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className='px-4 py-3 text-sm bg-rose-50 border-b border-rose-200 text-rose-800'>
            {error}
          </div>
        )}
        {loading && (
          <div className='px-4 py-3 text-sm text-slate-600 border-b border-slate-200'>Loading…</div>
        )}

        <div className='overflow-x-auto'>
          <table className='min-w-full text-sm'>
            <thead className='bg-slate-50 border-b border-slate-200'>
              <tr>
                <th className='text-left px-4 py-3 font-semibold text-slate-600'>Name</th>
                <th className='text-left px-4 py-3 font-semibold text-slate-600'>Email</th>
                <th className='text-left px-4 py-3 font-semibold text-slate-600'>Phone</th>
                <th className='text-left px-4 py-3 font-semibold text-slate-600'>Status</th>
                <th className='text-left px-4 py-3 font-semibold text-slate-600'>Updated</th>
                <th className='text-left px-4 py-3 font-semibold text-slate-600'>Actions</th>
              </tr>
            </thead>
            <tbody>
              {STATUS_ORDER.map((s) => {
                const rows = groups.get(s) || [];
                if (rows.length === 0) return null;
                const stripe = STATUS_STYLES[s]?.stripe || 'bg-slate-300';
                const pill = STATUS_STYLES[s]?.pill || 'bg-slate-100 text-slate-700 border-slate-200';

                return (
                  <>
                    <tr key={`${s}-header`} className='bg-white'>
                      <td colSpan={6} className='px-0'>
                        <div className='flex items-center gap-3 px-4 py-3 border-t border-slate-200 bg-white'>
                          <div className={`w-1.5 h-6 rounded-full ${stripe}`} />
                          <div className='text-sm font-bold text-slate-900'>
                            {STATUS_LABELS[s] || s}
                            <span className='text-slate-500 font-semibold ml-2'>({rows.length})</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                    {rows.map((c) => (
                      <tr key={c._id} className='border-t border-slate-100 hover:bg-slate-50'>
                        <td className='px-4 py-3 font-semibold text-slate-900'>
                          {c.name}
                        </td>
                        <td className='px-4 py-3 text-slate-700'>{c.email || '-'}</td>
                        <td className='px-4 py-3 text-slate-700'>{c.phone || '-'}</td>
                        <td className='px-4 py-3'>
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-lg border text-xs font-semibold ${pill}`}>
                            {(c.status || '').toString()}
                          </span>
                        </td>
                        <td className='px-4 py-3 text-slate-600'>
                          {c.updatedAt ? new Date(c.updatedAt).toLocaleString() : '-'}
                        </td>
                        <td className='px-4 py-3'>
                          <Link className='text-indigo-600 hover:underline font-semibold' to={`/clients/${c._id}`}>
                            Open
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </>
                );
              })}

              {items.length === 0 && !loading && (
                <tr>
                  <td className='px-4 py-10 text-center text-slate-500' colSpan={6}>
                    No contacts found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded shadow max-w-lg w-full">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="font-semibold">Create Client</h2>
              <button onClick={() => setFormOpen(false)} className="px-2 py-1">✕</button>
            </div>
            <form className="p-4 space-y-3" onSubmit={handleCreate}>
              <div>
                <label className="block text-sm mb-1">Name</label>
                <input name="name" required className="w-full border rounded px-3 py-2" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm mb-1">Email</label>
                  <input name="email" type="email" className="w-full border rounded px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm mb-1">Phone</label>
                  <input name="phone" className="w-full border rounded px-3 py-2" />
                </div>
              </div>
              <div>
                <label className="block text-sm mb-1">Status</label>
                <select name="status" className="w-full border rounded px-3 py-2">
                  <option value="lead">Lead</option>
                  <option value="contacted">Contacted</option>
                  <option value="qualified">Qualified</option>
                  <option value="proposal">Proposal</option>
                  <option value="negotiation">Negotiation</option>
                  <option value="won">Won</option>
                  <option value="lost">Lost</option>
                </select>
              </div>
              <div>
                <label className="block text-sm mb-1">Notes</label>
                <textarea name="notes" className="w-full border rounded px-3 py-2" rows={3} />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button type="button" className="px-3 py-2 border rounded" onClick={() => setFormOpen(false)}>Cancel</button>
                <button disabled={creating} className="px-4 py-2 bg-slate-900 text-white rounded">{creating ? 'Creating...' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

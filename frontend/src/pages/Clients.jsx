import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiClient } from '../utils/http';

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

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Clients</h1>
        <button className="btn btn-primary px-4 py-2 bg-slate-900 text-white rounded" onClick={() => setFormOpen(true)}>New Client</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <input
          className="border rounded px-3 py-2"
          placeholder="Search name, email, phone"
          value={q}
          onChange={(e) => setParam('q', e.target.value)}
        />
        <select className="border rounded px-3 py-2" value={status} onChange={(e) => setParam('status', e.target.value)}>
          <option value="">All Status</option>
          <option value="lead">Lead</option>
          <option value="contacted">Contacted</option>
          <option value="qualified">Qualified</option>
          <option value="proposal">Proposal</option>
          <option value="negotiation">Negotiation</option>
          <option value="won">Won</option>
          <option value="lost">Lost</option>
        </select>
        <div className="flex items-center justify-end gap-2">
          <button
            className="px-3 py-2 border rounded"
            onClick={() => setParam('page', String(Math.max(1, page - 1)))}
            disabled={page <= 1 || loading}
          >Prev</button>
          <span className="text-sm">Page {page} / {totalPages}</span>
          <button
            className="px-3 py-2 border rounded"
            onClick={() => setParam('page', String(Math.min(totalPages, page + 1)))}
            disabled={page >= totalPages || loading}
          >Next</button>
        </div>
      </div>

      {error && <div className="text-red-600 text-sm">{error}</div>}
      {loading && <div>Loading...</div>}

      <div className="overflow-x-auto rounded border">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left p-2">Name</th>
              <th className="text-left p-2">Email</th>
              <th className="text-left p-2">Phone</th>
              <th className="text-left p-2">Status</th>
              <th className="text-left p-2">Updated</th>
              <th className="text-left p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c._id} className="border-t">
                <td className="p-2">{c.name}</td>
                <td className="p-2">{c.email}</td>
                <td className="p-2">{c.phone}</td>
                <td className="p-2">
                  <span className="px-2 py-1 rounded bg-slate-100 capitalize">{c.status}</span>
                </td>
                <td className="p-2">{new Date(c.updatedAt).toLocaleString()}</td>
                <td className="p-2">
                  <Link className="text-blue-600 hover:underline" to={`/clients/${c._id}`}>Open</Link>
                </td>
              </tr>
            ))}
            {items.length === 0 && !loading && (
              <tr>
                <td className="p-4 text-center text-slate-500" colSpan={6}>No clients found</td>
              </tr>
            )}
          </tbody>
        </table>
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

import { useEffect, useState } from 'react';
import { apiClient } from '../utils/http';

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await apiClient.get('/metrics/admin');
        if (!mounted) return;
        setData(res?.data || res);
      } catch (e) {
        if (!mounted) return;
        setError(e?.message || 'Failed to load metrics');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  if (loading) return <div className="p-4">Loading...</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;
  if (!data) return null;

  const { totals, clientsByStatus, tasks, topAgents } = data;

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-semibold">Admin Dashboard</h1>

      <div className="grid md:grid-cols-4 gap-4">
        <Card title="Listings" value={totals.listings} />
        <Card title="Clients" value={totals.clients} />
        <Card title="Tasks" value={totals.tasks} />
        <Card title="Team" value={totals.team} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded border p-4">
          <h2 className="font-semibold mb-2">Clients by Status</h2>
          <ul className="text-sm space-y-1">
            {clientsByStatus.map(s => (
              <li key={s.status} className="flex items-center justify-between">
                <span className="capitalize">{s.status}</span>
                <span className="font-semibold">{s.count}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded border p-4">
          <h2 className="font-semibold mb-2">Tasks</h2>
          <div className="flex items-center gap-6 text-sm">
            <div>Due Today: <span className="font-semibold">{tasks.dueToday}</span></div>
            <div>Overdue: <span className="font-semibold">{tasks.overdue}</span></div>
          </div>
        </div>
      </div>

      <div className="rounded border p-4">
        <h2 className="font-semibold mb-2">Top Agents (Last 30 days)</h2>
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="p-2">Agent</th>
              <th className="p-2">Email</th>
              <th className="p-2">Clients</th>
            </tr>
          </thead>
          <tbody>
            {topAgents.map(a => (
              <tr key={a.userId} className="border-t">
                <td className="p-2">{a.username}</td>
                <td className="p-2">{a.email}</td>
                <td className="p-2">{a.clients}</td>
              </tr>
            ))}
            {topAgents.length === 0 && (
              <tr><td colSpan={3} className="p-4 text-slate-500">No data</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({ title, value }) {
  return (
    <div className="rounded border p-4">
      <div className="text-slate-600 text-sm">{title}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}

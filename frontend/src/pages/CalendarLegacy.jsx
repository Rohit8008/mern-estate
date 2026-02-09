import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient } from '../utils/http';
import { useBuyerView } from '../contexts/BuyerViewContext';

function toISO(d) {
  return new Date(d).toISOString();
}

export default function CalendarLegacy() {
  const navigate = useNavigate();
  const { currentUser } = useSelector((state) => state.user);
  const { isBuyerViewMode } = useBuyerView();

  const [tasks, setTasks] = useState([]);
  const [followUps, setFollowUps] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canAccess = useMemo(() => {
    if (!currentUser) return false;
    if (isBuyerViewMode) return false;
    return currentUser.role === 'admin' || currentUser.role === 'employee';
  }, [currentUser, isBuyerViewMode]);

  useEffect(() => {
    if (!currentUser) return;
    if (!canAccess) navigate('/unauthorized');
  }, [canAccess, currentUser, navigate]);

  useEffect(() => {
    if (!canAccess) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const now = new Date();
        const from = toISO(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
        const to = toISO(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30));
        const [taskRes, fuRes] = await Promise.all([
          apiClient.get(`/tasks?dueFrom=${encodeURIComponent(from)}&dueTo=${encodeURIComponent(to)}&limit=200`),
          apiClient.get(`/crm/follow-ups/range?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
        ]);
        if (!mounted) return;
        setTasks(taskRes?.data || []);
        setFollowUps(fuRes?.data?.items || []);
      } catch (e) {
        if (!mounted) return;
        setError(e?.message || 'Failed to load');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [canAccess]);

  if (!canAccess) return null;

  return (
    <div className='max-w-6xl mx-auto p-4 space-y-4'>
      <div className='flex items-center justify-between'>
        <h1 className='text-2xl font-semibold'>Calendar</h1>
        <Link className='text-blue-600 hover:underline' to='/clients'>Open Clients</Link>
      </div>

      {error && <div className='text-red-600 text-sm'>{error}</div>}
      {loading && <div>Loading...</div>}

      <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
        <div className='rounded border bg-white'>
          <div className='p-3 border-b font-semibold'>Upcoming Tasks (30d)</div>
          <div className='p-3 space-y-2'>
            {tasks.map((t) => (
              <div key={t._id} className='border rounded p-2'>
                <div className='font-medium'>{t.title}</div>
                <div className='text-xs text-slate-500'>{t.dueAt ? new Date(t.dueAt).toLocaleString() : '-'}</div>
              </div>
            ))}
            {tasks.length === 0 && !loading && <div className='text-slate-500 text-sm'>No tasks</div>}
          </div>
        </div>

        <div className='rounded border bg-white'>
          <div className='p-3 border-b font-semibold'>Upcoming Follow-ups (30d)</div>
          <div className='p-3 space-y-2'>
            {followUps.map((f) => (
              <div key={f.followUpId} className='border rounded p-2'>
                <Link className='font-medium text-blue-600 hover:underline' to={`/clients/${f.clientId}`}>{f.clientName}</Link>
                <div className='text-xs text-slate-500'>{f.dueAt ? new Date(f.dueAt).toLocaleString() : '-'}</div>
                {f.notes && <div className='text-sm mt-1'>{f.notes}</div>}
              </div>
            ))}
            {followUps.length === 0 && !loading && <div className='text-slate-500 text-sm'>No follow-ups</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

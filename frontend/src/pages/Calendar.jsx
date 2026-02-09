import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient } from '../utils/http';
import { useBuyerView } from '../contexts/BuyerViewContext';

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function toISO(d) {
  return new Date(d).toISOString();
}

function ymd(d) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Calendar() {
  const navigate = useNavigate();
  const { currentUser } = useSelector((state) => state.user);
  const { isBuyerViewMode } = useBuyerView();

  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState(() => startOfDay(new Date()));

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

  const monthStart = useMemo(() => startOfMonth(cursor), [cursor]);
  const monthEnd = useMemo(() => endOfMonth(cursor), [cursor]);

  const gridStart = useMemo(() => {
    const s = new Date(monthStart);
    s.setDate(s.getDate() - s.getDay());
    return startOfDay(s);
  }, [monthStart]);

  const gridEnd = useMemo(() => {
    const e = new Date(monthEnd);
    e.setDate(e.getDate() + (6 - e.getDay()));
    return endOfDay(e);
  }, [monthEnd]);

  async function loadRange() {
    setLoading(true);
    setError('');
    try {
      const from = toISO(startOfDay(gridStart));
      const to = toISO(endOfDay(gridEnd));

      const [taskRes, fuRes] = await Promise.all([
        apiClient.get(`/tasks?dueFrom=${encodeURIComponent(from)}&dueTo=${encodeURIComponent(to)}&limit=500`),
        apiClient.get(`/crm/follow-ups/range?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
      ]);

      setTasks(taskRes?.data || []);
      setFollowUps(fuRes?.data?.items || []);
    } catch (e) {
      setError(e?.message || 'Failed to load calendar');
      setTasks([]);
      setFollowUps([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!canAccess) return;
    loadRange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccess, gridStart.getTime(), gridEnd.getTime()]);

  const countsByDay = useMemo(() => {
    const map = new Map();
    const inc = (dateStr, kind) => {
      const entry = map.get(dateStr) || { task: 0, followUp: 0 };
      entry[kind] += 1;
      map.set(dateStr, entry);
    };

    (tasks || []).forEach((t) => {
      if (!t?.dueAt) return;
      inc(ymd(t.dueAt), 'task');
    });

    (followUps || []).forEach((f) => {
      if (!f?.dueAt) return;
      inc(ymd(f.dueAt), 'followUp');
    });

    return map;
  }, [tasks, followUps]);

  const agenda = useMemo(() => {
    const dayKey = ymd(selected);
    const dayTasks = (tasks || []).filter((t) => t?.dueAt && ymd(t.dueAt) === dayKey);
    const dayFollowUps = (followUps || []).filter((f) => f?.dueAt && ymd(f.dueAt) === dayKey);

    dayTasks.sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
    dayFollowUps.sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));

    return { dayTasks, dayFollowUps };
  }, [selected, tasks, followUps]);

  const days = useMemo(() => {
    const out = [];
    let d = new Date(gridStart);
    while (d <= gridEnd) {
      out.push(new Date(d));
      d = addDays(d, 1);
    }
    return out;
  }, [gridStart, gridEnd]);

  if (!canAccess) return null;

  return (
    <div className='min-h-screen bg-slate-50'>
      <div className='max-w-[1400px] mx-auto px-4 py-6 space-y-5'>
        <div className='flex flex-col md:flex-row md:items-end md:justify-between gap-3'>
          <div>
            <h1 className='text-2xl md:text-3xl font-bold text-slate-900'>Calendar</h1>
            <p className='text-slate-600 mt-1'>Tasks and client follow-ups in one view</p>
          </div>

          <div className='flex items-center gap-2'>
            <Link
              to='/clients'
              className='px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-sm font-semibold'
            >
              Open Clients
            </Link>
            <button
              onClick={() => setCursor(startOfMonth(addDays(monthStart, -1)))}
              className='px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-sm font-semibold'
            >
              Prev
            </button>
            <button
              onClick={() => setCursor(startOfMonth(addDays(monthStart, 32)))}
              className='px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-sm font-semibold'
            >
              Next
            </button>
            <button
              onClick={() => {
                const now = new Date();
                setCursor(startOfMonth(now));
                setSelected(startOfDay(now));
              }}
              className='px-4 py-2.5 rounded-xl bg-slate-900 text-white hover:bg-slate-800 text-sm font-semibold'
            >
              Today
            </button>
          </div>
        </div>

        {error && (
          <div className='bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-4 py-3 text-sm'>
            {error}
          </div>
        )}

        <div className='grid grid-cols-12 gap-4'>
          <div className='col-span-12 xl:col-span-8'>
            <div className='bg-white rounded-2xl border border-slate-200 overflow-hidden'>
              <div className='px-4 py-3 border-b border-slate-200 flex items-center justify-between'>
                <div className='font-semibold text-slate-900'>
                  {monthStart.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
                </div>
                <button
                  onClick={loadRange}
                  disabled={loading}
                  className='px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-sm font-semibold disabled:bg-slate-100'
                >
                  {loading ? 'Loading…' : 'Refresh'}
                </button>
              </div>

              <div className='grid grid-cols-7 border-b border-slate-200 bg-slate-50'>
                {DOW.map((d) => (
                  <div key={d} className='px-3 py-2 text-xs font-semibold text-slate-600'>
                    {d}
                  </div>
                ))}
              </div>

              <div className='grid grid-cols-7'>
                {days.map((d) => {
                  const inMonth = d.getMonth() === monthStart.getMonth();
                  const key = ymd(d);
                  const counts = countsByDay.get(key) || { task: 0, followUp: 0 };
                  const isSelected = ymd(d) === ymd(selected);

                  return (
                    <button
                      key={key}
                      onClick={() => setSelected(startOfDay(d))}
                      className={`h-24 md:h-28 border-b border-r border-slate-200 p-2 text-left hover:bg-slate-50 transition-colors ${
                        !inMonth ? 'bg-slate-50/50 text-slate-400' : 'bg-white'
                      } ${isSelected ? 'ring-2 ring-slate-900/20' : ''}`}
                    >
                      <div className='flex items-center justify-between'>
                        <div className='text-sm font-semibold'>{d.getDate()}</div>
                        {(counts.task + counts.followUp) > 0 && (
                          <div className='text-[10px] font-semibold text-slate-600'>
                            {counts.task + counts.followUp}
                          </div>
                        )}
                      </div>

                      <div className='mt-2 space-y-1'>
                        {counts.task > 0 && (
                          <div className='text-[11px] rounded-lg px-2 py-1 bg-blue-50 text-blue-700 border border-blue-100 inline-block'>
                            {counts.task} task(s)
                          </div>
                        )}
                        {counts.followUp > 0 && (
                          <div className='text-[11px] rounded-lg px-2 py-1 bg-amber-50 text-amber-800 border border-amber-100 inline-block'>
                            {counts.followUp} follow-up(s)
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className='col-span-12 xl:col-span-4'>
            <div className='bg-white rounded-2xl border border-slate-200 overflow-hidden'>
              <div className='px-4 py-3 border-b border-slate-200'>
                <div className='font-semibold text-slate-900'>Agenda</div>
                <div className='text-sm text-slate-600 mt-1'>{selected.toLocaleDateString()}</div>
              </div>

              <div className='p-4 space-y-4'>
                <div>
                  <div className='text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2'>Tasks</div>
                  {agenda.dayTasks.length === 0 ? (
                    <div className='text-sm text-slate-500'>No tasks</div>
                  ) : (
                    <div className='space-y-2'>
                      {agenda.dayTasks.map((t) => (
                        <div key={t._id} className='rounded-xl border border-slate-200 p-3'>
                          <div className='font-semibold text-slate-900 text-sm'>{t.title}</div>
                          <div className='text-xs text-slate-500 mt-1'>
                            {t.dueAt ? new Date(t.dueAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                            {t.priority ? ` · ${t.priority}` : ''}
                            {t.status ? ` · ${t.status}` : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className='text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2'>Follow-ups</div>
                  {agenda.dayFollowUps.length === 0 ? (
                    <div className='text-sm text-slate-500'>No follow-ups</div>
                  ) : (
                    <div className='space-y-2'>
                      {agenda.dayFollowUps.map((f) => (
                        <div key={f.followUpId} className='rounded-xl border border-slate-200 p-3'>
                          <div className='flex items-center justify-between gap-2'>
                            <Link
                              to={`/clients/${f.clientId}`}
                              className='font-semibold text-slate-900 text-sm hover:underline'
                            >
                              {f.clientName}
                            </Link>
                            <div className='text-xs text-slate-500'>{String(f.type || '').replace('_', ' ')}</div>
                          </div>
                          <div className='text-xs text-slate-500 mt-1'>
                            {f.dueAt ? new Date(f.dueAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                          </div>
                          {f.notes && <div className='text-sm text-slate-700 mt-2'>{f.notes}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

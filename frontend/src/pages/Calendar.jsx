import { useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient } from '../utils/http';
import { useBuyerView } from '../contexts/BuyerViewContext';
import {
  HiOutlineBell, HiOutlinePlus, HiOutlineTrash, HiX,
} from 'react-icons/hi';

/* ─── date helpers ─── */
function startOfDay(d) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d)   { const x = new Date(d); x.setHours(23,59,59,999); return x; }
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d)   { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function addDays(d, n)   { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function toISO(d)  { return new Date(d).toISOString(); }
function ymd(d)    {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
}

const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const REMINDER_OPTIONS = [
  { label: 'At event time',   value: 0  },
  { label: '5 min before',    value: 5  },
  { label: '15 min before',   value: 15 },
  { label: '30 min before',   value: 30 },
  { label: '1 hour before',   value: 60 },
  { label: '1 day before',    value: 1440 },
];

const STORAGE_KEY = 'cal_custom_events';

function loadEvents() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}

export default function Calendar() {
  const navigate    = useNavigate();
  const { currentUser }    = useSelector((s) => s.user);
  const { isBuyerViewMode } = useBuyerView();

  const [cursor,   setCursor]   = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState(() => startOfDay(new Date()));

  const [tasks,     setTasks]     = useState([]);
  const [followUps, setFollowUps] = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');

  /* ─── custom events ─── */
  const [events,         setEvents]         = useState(loadEvents);
  const [showModal,      setShowModal]      = useState(false);
  const [notifGranted,   setNotifGranted]   = useState(
    () => typeof Notification !== 'undefined' && Notification.permission === 'granted'
  );
  const [newEvent, setNewEvent] = useState({
    title: '', date: ymd(new Date()), time: '09:00', reminderMinutes: 15,
  });
  // IDs that have already been notified — persisted so refreshing the page doesn't re-fire
  const notifiedRef = useRef(null);
  if (notifiedRef.current === null) {
    try { notifiedRef.current = new Set(JSON.parse(localStorage.getItem('cal_notified') || '[]')); }
    catch { notifiedRef.current = new Set(); }
  }

  /* persist events to localStorage */
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  }, [events]);

  /* helper — send one notification */
  function sendNotification(title, body) {
    if (typeof Notification === 'undefined') return false;
    if (Notification.permission !== 'granted') return false;
    new Notification(title, { body });
    return true;
  }

  /* reminder polling — every 30 s */
  useEffect(() => {
    const fire = () => {
      const now = Date.now();
      events.forEach((ev) => {
        // already notified this event
        if (notifiedRef.current.has(ev.id)) return;

        const [h, m] = ev.time.split(':').map(Number);
        const evDate = new Date(ev.date);
        evDate.setHours(h, m, 0, 0);
        const reminderAt = evDate.getTime() - ev.reminderMinutes * 60_000;

        // window completely passed — skip forever without notifying
        if (now > reminderAt + 120_000) {
          notifiedRef.current.add(ev.id);
          localStorage.setItem('cal_notified', JSON.stringify([...notifiedRef.current]));
          return;
        }

        // inside the fire window (2 min)
        if (now >= reminderAt && now <= reminderAt + 120_000) {
          const when = ev.reminderMinutes === 0
            ? 'starting now'
            : ev.reminderMinutes < 60
              ? `in ${ev.reminderMinutes} min`
              : ev.reminderMinutes === 60 ? 'in 1 hour' : 'tomorrow';
          const sent = sendNotification(
            `📅 ${ev.title}`,
            `${when} · ${evDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
          );
          // only mark as notified if the notification actually fired
          if (sent) {
            notifiedRef.current.add(ev.id);
            localStorage.setItem('cal_notified', JSON.stringify([...notifiedRef.current]));
          }
        }
      });
    };
    fire();
    const id = setInterval(fire, 30_000);
    return () => clearInterval(id);
  }, [events]);

  /* access guard */
  const canAccess = useMemo(() => {
    if (!currentUser) return false;
    if (isBuyerViewMode) return false;
    return currentUser.role === 'admin' || currentUser.role === 'employee';
  }, [currentUser, isBuyerViewMode]);

  useEffect(() => {
    if (!currentUser) return;
    if (!canAccess) navigate('/unauthorized');
  }, [canAccess, currentUser, navigate]);

  /* calendar grid bounds */
  const monthStart = useMemo(() => startOfMonth(cursor), [cursor]);
  const monthEnd   = useMemo(() => endOfMonth(cursor),   [cursor]);

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

  /* fetch tasks + follow-ups */
  async function loadRange() {
    setLoading(true); setError('');
    try {
      const from = toISO(startOfDay(gridStart));
      const to   = toISO(endOfDay(gridEnd));
      const [taskRes, fuRes] = await Promise.all([
        apiClient.get(`/tasks?dueFrom=${encodeURIComponent(from)}&dueTo=${encodeURIComponent(to)}&limit=500`),
        apiClient.get(`/crm/follow-ups/range?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
      ]);
      setTasks(taskRes?.data || []);
      setFollowUps(fuRes?.data?.items || []);
    } catch (e) {
      setError(e?.message || 'Failed to load calendar');
      setTasks([]); setFollowUps([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!canAccess) return;
    loadRange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccess, gridStart.getTime(), gridEnd.getTime()]);

  /* dot counts per day */
  const countsByDay = useMemo(() => {
    const map = new Map();
    const inc = (dateStr, kind) => {
      const e = map.get(dateStr) || { task: 0, followUp: 0, event: 0 };
      e[kind] += 1;
      map.set(dateStr, e);
    };
    (tasks     || []).forEach((t) => t?.dueAt  && inc(ymd(t.dueAt),  'task'));
    (followUps || []).forEach((f) => f?.dueAt  && inc(ymd(f.dueAt),  'followUp'));
    events.forEach((ev) => inc(ev.date, 'event'));
    return map;
  }, [tasks, followUps, events]);

  /* agenda for selected day */
  const agenda = useMemo(() => {
    const dk = ymd(selected);
    const dayTasks    = (tasks     || []).filter((t) => t?.dueAt && ymd(t.dueAt) === dk);
    const dayFollowUps= (followUps || []).filter((f) => f?.dueAt && ymd(f.dueAt) === dk);
    const dayEvents   = events.filter((ev) => ev.date === dk);
    dayTasks.sort((a,b) => new Date(a.dueAt) - new Date(b.dueAt));
    dayFollowUps.sort((a,b) => new Date(a.dueAt) - new Date(b.dueAt));
    dayEvents.sort((a,b) => a.time.localeCompare(b.time));
    return { dayTasks, dayFollowUps, dayEvents };
  }, [selected, tasks, followUps, events]);

  const days = useMemo(() => {
    const out = []; let d = new Date(gridStart);
    while (d <= gridEnd) { out.push(new Date(d)); d = addDays(d, 1); }
    return out;
  }, [gridStart, gridEnd]);

  /* actions */
  const requestPermission = async () => {
    if (typeof Notification === 'undefined') return false;
    if (Notification.permission === 'granted') { setNotifGranted(true); return true; }
    const result = await Notification.requestPermission();
    const ok = result === 'granted';
    setNotifGranted(ok);
    return ok;
  };

  const openModal = async () => {
    await requestPermission();
    setNewEvent({ title: '', date: ymd(selected), time: '09:00', reminderMinutes: 15 });
    setShowModal(true);
  };

  const [notifStatus, setNotifStatus] = useState('');

  const testNotification = async () => {
    if (typeof Notification === 'undefined') {
      setNotifStatus('error:Browser does not support notifications');
      return;
    }
    if (Notification.permission === 'denied') {
      setNotifStatus('error:Notifications are blocked. Go to browser Site Settings and allow notifications for this site.');
      return;
    }
    const ok = await requestPermission();
    if (!ok) {
      setNotifStatus('error:Permission not granted. Click Allow when the browser prompts you.');
      return;
    }
    try {
      new Notification('📅 Test reminder', { body: 'Notifications are working!' });
      setNotifStatus('ok:Test notification sent! Check your system notifications.');
    } catch (e) {
      setNotifStatus(`error:${e.message}`);
    }
    setTimeout(() => setNotifStatus(''), 6000);
  };

  const saveEvent = () => {
    if (!newEvent.title.trim()) return;
    const ev = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title: newEvent.title.trim(),
      date: newEvent.date,
      time: newEvent.time,
      reminderMinutes: Number(newEvent.reminderMinutes),
    };
    setEvents((prev) => [...prev, ev]);
    setShowModal(false);
  };

  const deleteEvent = (id) => setEvents((prev) => prev.filter((e) => e.id !== id));

  if (!canAccess) return null;

  return (
    <div className='space-y-5'>

      {/* Header */}
      <div className='flex flex-col md:flex-row md:items-end md:justify-between gap-3'>
        <div>
          <h1 className='text-xl font-bold text-slate-900'>Calendar</h1>
          <p className='text-slate-500 mt-0.5'>Tasks, follow-ups and your events in one view</p>
        </div>

        <div className='flex items-center gap-2 flex-wrap'>
          {/* Notification permission badge */}
          {typeof Notification !== 'undefined' && Notification.permission === 'denied' && (
            <span className='text-xs text-rose-600 bg-rose-50 border border-rose-200 px-2 py-1 rounded-lg'>
              Notifications blocked — enable in browser settings
            </span>
          )}

          {typeof Notification !== 'undefined' && Notification.permission !== 'denied' && (
            <button
              onClick={testNotification}
              className='flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-sm font-medium'
              title='Send a test notification to verify reminders work'
            >
              <HiOutlineBell className='w-4 h-4' /> Test
            </button>
          )}

          <Link
            to='/clients'
            className='px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-sm font-medium'
          >
            Open Clients
          </Link>

          <button
            onClick={openModal}
            className='flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 text-sm font-medium'
          >
            <HiOutlinePlus className='w-4 h-4' /> Add Event
          </button>

          <button onClick={() => setCursor(startOfMonth(addDays(monthStart, -1)))} className='px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-sm font-medium'>Prev</button>
          <button onClick={() => setCursor(startOfMonth(addDays(monthStart, 32)))} className='px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-sm font-medium'>Next</button>
          <button
            onClick={() => { const now = new Date(); setCursor(startOfMonth(now)); setSelected(startOfDay(now)); }}
            className='px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 text-sm font-medium'
          >
            Today
          </button>
        </div>
      </div>

        {error && (
          <div className='bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-4 py-3 text-sm'>{error}</div>
        )}

        {notifStatus && (
          <div className={`rounded-xl px-4 py-3 text-sm border ${
            notifStatus.startsWith('ok:')
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}>
            {notifStatus.replace(/^(ok|error):/, '')}
          </div>
        )}

        <div className='grid grid-cols-12 gap-4'>
          {/* ── Calendar grid ── */}
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
                  <div key={d} className='px-3 py-2 text-xs font-semibold text-slate-600'>{d}</div>
                ))}
              </div>

              <div className='grid grid-cols-7'>
                {days.map((d) => {
                  const inMonth  = d.getMonth() === monthStart.getMonth();
                  const key      = ymd(d);
                  const counts   = countsByDay.get(key) || { task: 0, followUp: 0, event: 0 };
                  const isSelected = key === ymd(selected);

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
                        {(counts.task + counts.followUp + counts.event) > 0 && (
                          <div className='text-[10px] font-semibold text-slate-600'>
                            {counts.task + counts.followUp + counts.event}
                          </div>
                        )}
                      </div>

                      <div className='mt-2 space-y-1'>
                        {counts.task > 0 && (
                          <div className='text-[11px] rounded-lg px-2 py-1 bg-blue-50 text-blue-700 border border-blue-100 inline-block'>
                            {counts.task} task{counts.task > 1 ? 's' : ''}
                          </div>
                        )}
                        {counts.followUp > 0 && (
                          <div className='text-[11px] rounded-lg px-2 py-1 bg-amber-50 text-amber-800 border border-amber-100 inline-block'>
                            {counts.followUp} follow-up{counts.followUp > 1 ? 's' : ''}
                          </div>
                        )}
                        {counts.event > 0 && (
                          <div className='text-[11px] rounded-lg px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-100 inline-block'>
                            {counts.event} event{counts.event > 1 ? 's' : ''}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Agenda panel ── */}
          <div className='col-span-12 xl:col-span-4'>
            <div className='bg-white rounded-2xl border border-slate-200 overflow-hidden'>
              <div className='px-4 py-3 border-b border-slate-200 flex items-center justify-between'>
                <div>
                  <div className='font-semibold text-slate-900'>Agenda</div>
                  <div className='text-sm text-slate-600 mt-0.5'>{selected.toLocaleDateString()}</div>
                </div>
                <button
                  onClick={openModal}
                  className='flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 px-2 py-1.5 rounded-lg hover:bg-slate-100 transition-colors'
                >
                  <HiOutlinePlus className='w-3.5 h-3.5' /> Event
                </button>
              </div>

              <div className='p-4 space-y-5'>

                {/* Custom events */}
                {agenda.dayEvents.length > 0 && (
                  <div>
                    <div className='text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2'>Your Events</div>
                    <div className='space-y-2'>
                      {agenda.dayEvents.map((ev) => {
                        const reminderLabel = REMINDER_OPTIONS.find((o) => o.value === ev.reminderMinutes)?.label || '';
                        return (
                          <div key={ev.id} className='rounded-xl border border-emerald-200 bg-emerald-50 p-3'>
                            <div className='flex items-start justify-between gap-2'>
                              <div className='min-w-0'>
                                <div className='font-semibold text-emerald-900 text-sm truncate'>{ev.title}</div>
                                <div className='text-xs text-emerald-700 mt-1 flex items-center gap-1.5'>
                                  <span>{ev.time}</span>
                                  {ev.reminderMinutes !== undefined && (
                                    <>
                                      <span>·</span>
                                      <HiOutlineBell className='w-3 h-3' />
                                      <span>{reminderLabel}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <button
                                onClick={() => deleteEvent(ev.id)}
                                className='flex-shrink-0 p-1 rounded-lg text-emerald-500 hover:bg-emerald-100 hover:text-rose-600 transition-colors'
                                title='Delete event'
                              >
                                <HiOutlineTrash className='w-3.5 h-3.5' />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Tasks */}
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

                {/* Follow-ups */}
                <div>
                  <div className='text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2'>Follow-ups</div>
                  {agenda.dayFollowUps.length === 0 ? (
                    <div className='text-sm text-slate-500'>No follow-ups</div>
                  ) : (
                    <div className='space-y-2'>
                      {agenda.dayFollowUps.map((f) => (
                        <div key={f.followUpId} className='rounded-xl border border-slate-200 p-3'>
                          <div className='flex items-center justify-between gap-2'>
                            <Link to={`/clients/${f.clientId}`} className='font-semibold text-slate-900 text-sm hover:underline'>
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

      {/* ── Add Event Modal ── */}
      {showModal && (
        <div className='fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4'>
          <div className='bg-white rounded-2xl shadow-xl w-full max-w-sm'>
            <div className='flex items-center justify-between px-6 py-4 border-b border-slate-100'>
              <h2 className='text-base font-semibold text-slate-900'>Add Event</h2>
              <button onClick={() => setShowModal(false)} className='p-1.5 rounded-lg hover:bg-slate-100 text-slate-400'>
                <HiX className='w-4 h-4' />
              </button>
            </div>

            <div className='px-6 py-5 space-y-4'>

              {!notifGranted && typeof Notification !== 'undefined' && Notification.permission !== 'denied' && (
                <div className='flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2'>
                  <HiOutlineBell className='w-4 h-4 flex-shrink-0 mt-0.5' />
                  <span>Allow notifications when prompted to receive reminders.</span>
                </div>
              )}

              <div>
                <label className='block text-xs font-semibold text-slate-600 mb-1'>Title</label>
                <input
                  autoFocus
                  type='text'
                  placeholder='e.g. Client meeting, Site visit…'
                  value={newEvent.title}
                  onChange={(e) => setNewEvent((p) => ({ ...p, title: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && saveEvent()}
                  className='w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent'
                />
              </div>

              <div className='grid grid-cols-2 gap-3'>
                <div>
                  <label className='block text-xs font-semibold text-slate-600 mb-1'>Date</label>
                  <input
                    type='date'
                    value={newEvent.date}
                    onChange={(e) => setNewEvent((p) => ({ ...p, date: e.target.value }))}
                    className='w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400'
                  />
                </div>
                <div>
                  <label className='block text-xs font-semibold text-slate-600 mb-1'>Time</label>
                  <input
                    type='time'
                    value={newEvent.time}
                    onChange={(e) => setNewEvent((p) => ({ ...p, time: e.target.value }))}
                    className='w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400'
                  />
                </div>
              </div>

              <div>
                <label className='block text-xs font-semibold text-slate-600 mb-1'>
                  <HiOutlineBell className='inline w-3.5 h-3.5 mr-1' />Remind me
                </label>
                <select
                  value={newEvent.reminderMinutes}
                  onChange={(e) => setNewEvent((p) => ({ ...p, reminderMinutes: Number(e.target.value) }))}
                  className='w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400'
                >
                  {REMINDER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className='px-6 pb-5 flex justify-end gap-2'>
              <button
                onClick={() => setShowModal(false)}
                className='px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50'
              >
                Cancel
              </button>
              <button
                onClick={saveEvent}
                disabled={!newEvent.title.trim()}
                className='px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50'
              >
                Save Event
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

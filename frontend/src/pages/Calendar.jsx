import { useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient } from '../utils/http';
import { formatDate } from '../utils/currency';
import { useBuyerView } from '../contexts/BuyerViewContext';
import {
  HiOutlineBell, HiOutlinePlus, HiOutlineTrash, HiOutlineCalendar,
} from 'react-icons/hi';
import { Modal, PageLoader, EmptyState } from '../design-system';
import { useTranslation } from 'react-i18next';

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

// Custom events live on the server (/api/calendar-events) so they follow the
// agent across devices. This key is only read once, to move events saved by the
// old browser-only version up to the server.
const LEGACY_STORAGE_KEY = 'cal_custom_events';

function readLegacyEvents() {
  try { return JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || '[]'); }
  catch { return []; }
}

const fromServer = (e) => ({ id: e._id, title: e.title, date: e.date, time: e.time, reminderMinutes: e.reminderMinutes });

export default function Calendar() {
  const { t } = useTranslation();
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
  const [events,         setEvents]         = useState([]);
  const [showModal,      setShowModal]      = useState(false);
  // Tracked, not read at render: allowing notifications in site settings after
  // the page loaded left the "blocked" badge up until a reload.
  const [notifPermission, setNotifPermission] = useState(
    () => (typeof Notification !== 'undefined' ? Notification.permission : 'unsupported')
  );
  const notifGranted = notifPermission === 'granted';
  const setNotifGranted = () => {
    if (typeof Notification !== 'undefined') setNotifPermission(Notification.permission);
  };
  useEffect(() => {
    if (typeof Notification === 'undefined') return undefined;
    const sync = () => setNotifPermission(Notification.permission);
    let status;
    navigator.permissions?.query({ name: 'notifications' })
      .then((st) => { status = st; st.onchange = sync; })
      .catch(() => {});
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      if (status) status.onchange = null;
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);
  const [newEvent, setNewEvent] = useState({
    title: '', date: ymd(new Date()), time: '09:00', reminderMinutes: 15,
  });
  // IDs that have already been notified — persisted so refreshing the page doesn't re-fire
  const notifiedRef = useRef(null);
  if (notifiedRef.current === null) {
    try { notifiedRef.current = new Set(JSON.parse(localStorage.getItem('cal_notified') || '[]')); }
    catch { notifiedRef.current = new Set(); }
  }

  /* load events; first move any browser-only events to the server */
  useEffect(() => {
    if (!currentUser?._id) return undefined;
    let cancelled = false;
    (async () => {
      const legacy = readLegacyEvents();
      if (legacy.length) {
        const results = await Promise.allSettled(
          legacy.map((ev) => apiClient.post('/calendar-events', {
            title: ev.title, date: ev.date, time: ev.time || '09:00', reminderMinutes: Number(ev.reminderMinutes) || 0,
          }, { silent: true }))
        );
        // Only forget the local copy once every event made it up.
        if (results.every((r) => r.status === 'fulfilled')) {
          try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch { /* ignore */ }
        }
      }
      try {
        const res = await apiClient.get('/calendar-events', { silent: true });
        if (!cancelled) setEvents((res?.data || []).map(fromServer));
      } catch {
        if (!cancelled) setEvents(legacy);
      }
    })();
    return () => { cancelled = true; };
  }, [currentUser?._id]);

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

  const saveEvent = async () => {
    if (!newEvent.title.trim()) return;
    try {
      const res = await apiClient.post('/calendar-events', {
        title: newEvent.title.trim(),
        date: newEvent.date,
        time: newEvent.time,
        reminderMinutes: Number(newEvent.reminderMinutes),
      });
      setEvents((prev) => [...prev, fromServer(res?.data || res)]);
      setShowModal(false);
    } catch {
      // apiClient has already shown why; keep the dialog open so nothing typed is lost.
    }
  };

  const deleteEvent = async (id) => {
    const previous = events;
    setEvents((prev) => prev.filter((e) => e.id !== id));
    try {
      await apiClient.delete(`/calendar-events/${id}`);
    } catch {
      setEvents(previous);
    }
  };

  if (!canAccess) return null;

  return (
    <div className='space-y-5'>

      {/* Header */}
      <div className='flex flex-col md:flex-row md:items-end md:justify-between gap-3'>
        <div>
          <h1 className='text-xl font-bold text-slate-900'>{t('calendar.calendar')}</h1>
          <p className='text-slate-500 mt-0.5'>{t('calendar.tasksFollowUpsAndYourEvents')}</p>
        </div>

        <div className='flex items-center gap-2 flex-wrap'>
          {/* Notification permission badge */}
          {notifPermission === 'denied' && (
            <span className='text-xs text-rose-600 bg-rose-50 border border-rose-200 px-2 py-1 rounded-lg'>{t('calendar.notificationsBlockedEnableInBrowserSettings')}</span>
          )}

          {notifPermission !== 'denied' && notifPermission !== 'unsupported' && (
            <button
              onClick={testNotification}
              className='flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-sm font-medium'
              title='Send a test desktop notification to confirm event reminders can reach you (separate from the notification bell above)'
            >
              <HiOutlineBell className='w-4 h-4' aria-hidden='true' />{t('calendar.testReminderAlerts')}</button>
          )}

          <Link
            to='/clients'
            className='px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-sm font-medium'
          >{t('calendar.openClients')}</Link>

          <button
            onClick={openModal}
            className='flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 text-sm font-medium'
          >
            <HiOutlinePlus className='w-4 h-4' aria-hidden='true' />{t('calendar.addEvent')}</button>

          <button onClick={() => setCursor(startOfMonth(addDays(monthStart, -1)))} className='px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-sm font-medium'>{t('calendar.prev')}</button>
          <button onClick={() => setCursor(startOfMonth(addDays(monthStart, 32)))} className='px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-sm font-medium'>{t('calendar.next')}</button>
          <button
            onClick={() => { const now = new Date(); setCursor(startOfMonth(now)); setSelected(startOfDay(now)); }}
            className='px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 text-sm font-medium'
          >{t('calendar.today')}</button>
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

        {loading && tasks.length === 0 && followUps.length === 0 ? (
          <PageLoader message='Loading calendar…' />
        ) : (
        <div className='grid grid-cols-12 gap-4'>
          {/* ── Calendar grid ── */}
          <div className='col-span-12 xl:col-span-8'>
            <div className='bg-white rounded-2xl border border-slate-200 overflow-hidden'>
              <div className='px-4 py-3 border-b border-slate-200 flex items-center justify-between'>
                <div className='font-semibold text-slate-900'>
                  {formatDate(monthStart, { day: undefined, month: 'long', year: 'numeric' })}
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
                      type='button'
                      onClick={() => setSelected(startOfDay(d))}
                      aria-pressed={isSelected}
                      aria-label={[
                        formatDate(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
                        counts.task ? `${counts.task} task${counts.task > 1 ? 's' : ''}` : '',
                        counts.followUp ? `${counts.followUp} follow-up${counts.followUp > 1 ? 's' : ''}` : '',
                        counts.event ? `${counts.event} event${counts.event > 1 ? 's' : ''}` : '',
                      ].filter(Boolean).join(', ')}
                      className={`h-24 md:h-28 border-b border-r border-slate-200 p-2 text-left hover:bg-slate-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 ${
                        !inMonth ? 'bg-slate-50/50 text-slate-500' : 'bg-white'
                      } ${isSelected ? 'ring-2 ring-inset ring-slate-700' : ''}`}
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
                  <div className='font-semibold text-slate-900'>{t('calendar.agenda')}</div>
                  <div className='text-sm text-slate-600 mt-0.5'>{formatDate(selected)}</div>
                </div>
                <button
                  onClick={openModal}
                  className='flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 px-2 py-1.5 rounded-lg hover:bg-slate-100 transition-colors'
                >
                  <HiOutlinePlus className='w-3.5 h-3.5' aria-hidden='true' />{t('calendar.event')}</button>
              </div>

              <div className='p-4 space-y-5'>

                {agenda.dayTasks.length === 0 && agenda.dayFollowUps.length === 0 && agenda.dayEvents.length === 0 ? (
                  <EmptyState
                    icon={HiOutlineCalendar}
                    title={t('calendar.noEvents')}
                    body={t('calendar.nothingScheduledForThisDay')}
                  />
                ) : (
                <>
                {/* Custom events */}
                {agenda.dayEvents.length > 0 && (
                  <div>
                    <div className='text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2'>{t('calendar.yourEvents')}</div>
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
                                      <HiOutlineBell className='w-3 h-3' aria-hidden='true' />
                                      <span>{reminderLabel}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <button
                                type='button'
                                onClick={() => deleteEvent(ev.id)}
                                className='flex-shrink-0 p-1 rounded-lg text-emerald-700 hover:bg-emerald-100 hover:text-rose-600 transition-colors'
                                title={t('calendar.deleteEvent')}
                                aria-label={`${t('calendar.deleteEvent')}: ${ev.title}`}
                              >
                                <HiOutlineTrash className='w-3.5 h-3.5' aria-hidden='true' />
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
                  <div className='text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2'>{t('calendar.tasks')}</div>
                  {agenda.dayTasks.length === 0 ? (
                    <div className='text-sm text-slate-500'>{t('calendar.noTasks')}</div>
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
                  <div className='text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2'>{t('calendar.followUps')}</div>
                  {agenda.dayFollowUps.length === 0 ? (
                    <div className='text-sm text-slate-500'>{t('calendar.noFollowUps')}</div>
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
                </>
                )}

              </div>
            </div>
          </div>
        </div>
        )}

      {/* ── Add Event Modal ── */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={t('calendar.addEvent')}
        size='sm'
        footer={
          <>
            <button
              onClick={() => setShowModal(false)}
              className='px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50'
            >{t('calendar.cancel')}</button>
            <button
              onClick={saveEvent}
              disabled={!newEvent.title.trim()}
              className='px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50'
            >{t('calendar.saveEvent')}</button>
          </>
        }
      >
        <div className='space-y-4'>
          {!notifGranted && notifPermission !== 'denied' && notifPermission !== 'unsupported' && (
            <div className='flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2'>
              <HiOutlineBell className='w-4 h-4 flex-shrink-0 mt-0.5' aria-hidden='true' />
              <span>{t('calendar.allowNotificationsWhenPromptedToReceive')}</span>
            </div>
          )}

          <div>
            <label htmlFor='calendar-event-title' className='block text-xs font-semibold text-slate-600 mb-1'>{t('calendar.title')}</label>
            <input
              id='calendar-event-title'
              autoFocus
              type='text'
              placeholder={t('calendar.eGClientMeetingSiteVisit')}
              value={newEvent.title}
              onChange={(e) => setNewEvent((p) => ({ ...p, title: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && saveEvent()}
              className='w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent'
            />
          </div>

          <div className='grid grid-cols-2 gap-3'>
            <div>
              <label htmlFor='calendar-event-date' className='block text-xs font-semibold text-slate-600 mb-1'>{t('calendar.date')}</label>
              <input
                id='calendar-event-date'
                type='date'
                value={newEvent.date}
                onChange={(e) => setNewEvent((p) => ({ ...p, date: e.target.value }))}
                className='w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400'
              />
            </div>
            <div>
              <label htmlFor='calendar-event-time' className='block text-xs font-semibold text-slate-600 mb-1'>{t('calendar.time')}</label>
              <input
                id='calendar-event-time'
                type='time'
                value={newEvent.time}
                onChange={(e) => setNewEvent((p) => ({ ...p, time: e.target.value }))}
                className='w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400'
              />
            </div>
          </div>

          <div>
            <label htmlFor='calendar-event-reminder' className='block text-xs font-semibold text-slate-600 mb-1'>
              <HiOutlineBell className='inline w-3.5 h-3.5 mr-1' aria-hidden='true' />{t('calendar.remindMe')}</label>
            <select
              id='calendar-event-reminder'
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
      </Modal>
    </div>
  );
}

import { useMemo } from 'react';
import { HiChevronLeft, HiChevronRight, HiPlus, HiCheck } from 'react-icons/hi';
import { Button } from '../../design-system';
import { localISODate, weekDays, dueDay } from '../../utils/taskDates';

// Complete literal classes — Tailwind cannot see an interpolated colour.
const PRIORITY_DOT = {
  urgent: 'bg-rose-500',
  high: 'bg-orange-500',
  medium: 'bg-amber-500',
  low: 'bg-slate-400',
};

/**
 * Seven day columns, Monday to Sunday, for planning a week at a glance.
 * The parent owns the data and the week; this draws it and reports clicks.
 */
export default function WeekPlanner({ tasks, weekStart, onWeekChange, onAdd, onOpen, onToggleDone, showAssignee }) {
  const days = useMemo(() => weekDays(weekStart), [weekStart]);
  const todayISO = localISODate(new Date());

  const byDay = useMemo(() => {
    const map = new Map();
    for (const t of tasks) {
      const key = dueDay(t.dueAt);
      map.set(key, [...(map.get(key) || []), t]);
    }
    return map;
  }, [tasks]);

  const label = `${days[0].toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${days[6].toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const shift = (n) => onWeekChange(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + n * 7));

  return (
    <div className='p-4'>
      <div className='flex items-center justify-between mb-3'>
        <div className='flex items-center gap-2'>
          <Button size='xs' variant='secondary' icon={HiChevronLeft} onClick={() => shift(-1)} aria-label='Previous week' />
          <Button size='xs' variant='secondary' icon={HiChevronRight} onClick={() => shift(1)} aria-label='Next week' />
          <Button size='xs' variant='secondary' onClick={() => onWeekChange(new Date())}>This week</Button>
        </div>
        <h2 className='text-sm font-semibold text-slate-700'>{label}</h2>
      </div>

      <div className='grid grid-cols-1 md:grid-cols-4 xl:grid-cols-7 gap-3'>
        {days.map((day) => {
          const iso = localISODate(day);
          const items = byDay.get(iso) || [];
          const isToday = iso === todayISO;
          return (
            <section
              key={iso}
              aria-label={day.toDateString()}
              className={`rounded-xl border p-2.5 min-h-[9rem] flex flex-col ${isToday ? 'border-brand-300 bg-brand-50/40' : 'border-slate-200 bg-slate-50/50'}`}
            >
              <header className='flex items-center justify-between mb-2'>
                <div>
                  <div className={`text-xs font-semibold uppercase tracking-wide ${isToday ? 'text-brand-700' : 'text-slate-500'}`}>
                    {day.toLocaleDateString(undefined, { weekday: 'short' })}
                  </div>
                  <div className='text-sm font-medium text-slate-900'>
                    {day.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                    {items.length > 0 && <span className='ml-1.5 text-xs text-slate-500'>{items.length}</span>}
                  </div>
                </div>
                <button
                  type='button'
                  onClick={() => onAdd(iso)}
                  aria-label={`Add a task on ${day.toDateString()}`}
                  className='p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500'
                >
                  <HiPlus className='w-4 h-4' />
                </button>
              </header>

              <ul className='space-y-1.5 flex-1'>
                {items.map((t) => {
                  const done = t.status === 'done';
                  return (
                    <li key={t._id} className='bg-white border border-slate-200 rounded-lg px-2 py-1.5 flex items-start gap-2'>
                      <button
                        type='button'
                        onClick={() => onToggleDone(t)}
                        aria-label={done ? 'Mark as not done' : 'Mark as done'}
                        className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 focus:outline-none focus:ring-2 focus:ring-brand-500 ${done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 hover:border-slate-400'}`}
                      >
                        {done && <HiCheck className='w-3 h-3' />}
                      </button>
                      <button type='button' onClick={() => onOpen(t)} className='min-w-0 flex-1 text-left focus:outline-none focus:underline'>
                        <span className={`block text-sm leading-snug ${done ? 'line-through text-slate-400' : 'text-slate-900'}`}>{t.title}</span>
                        <span className='flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-500'>
                          <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[t.priority] || PRIORITY_DOT.medium}`} aria-hidden='true' />
                          <span className='capitalize'>{t.priority}</span>
                          {showAssignee && t.assigneeName && <span className='truncate'>· {t.assigneeName}</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

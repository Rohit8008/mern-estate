/**
 * Date ranges for the task filters and the week planner.
 *
 * A task's due date is the day someone picked, stored as that day at 00:00 UTC
 * (the form sends `YYYY-MM-DD`). Ranges here are therefore whole calendar days
 * in the viewer's own calendar, sent as `YYYY-MM-DD` and read by the API as the
 * start of the first day and the end of the last — never as clock times, which
 * would slide a task into the neighbouring day for anyone off UTC.
 */

/** `YYYY-MM-DD` of a Date in the viewer's calendar. */
export function localISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(date, days) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
  return next;
}

/** The Monday of the week containing `date`, at local midnight. */
export function weekStartOf(date) {
  const day = (date.getDay() + 6) % 7; // Monday = 0
  return addDays(date, -day);
}

/** The seven days of a week, Monday first. */
export function weekDays(start) {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** The day a stored due date falls on, as `YYYY-MM-DD` (it is stored as UTC midnight). */
export function dueDay(dueAt) {
  return dueAt ? new Date(dueAt).toISOString().slice(0, 10) : '';
}

export const DUE_PRESETS = ['today', 'week', 'next7', 'overdue', 'none'];

/**
 * The API query for a preset (or a custom from/to), or {} for "any date".
 * `overdue` and `none` are the API's own switches, not ranges.
 */
export function dueQuery({ preset, from, to }, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case 'today':
      return { dueFrom: localISODate(today), dueTo: localISODate(today) };
    case 'week': {
      const start = weekStartOf(today);
      return { dueFrom: localISODate(start), dueTo: localISODate(addDays(start, 6)) };
    }
    case 'next7':
      return { dueFrom: localISODate(today), dueTo: localISODate(addDays(today, 6)) };
    case 'overdue':
      return { due: 'overdue' };
    case 'none':
      return { due: 'none' };
    case 'custom': {
      const q = {};
      if (from) q.dueFrom = from;
      if (to) q.dueTo = to;
      return q;
    }
    default:
      return {};
  }
}

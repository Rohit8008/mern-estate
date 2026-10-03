import { describe, it, expect } from 'vitest';
import { localISODate, weekStartOf, weekDays, dueDay, dueQuery } from './taskDates';

// Wed 7 Oct 2026, mid-afternoon local time.
const NOW = new Date(2026, 9, 7, 15, 30);

describe('task date ranges', () => {
  it('formats a date in the local calendar, not UTC', () => {
    expect(localISODate(new Date(2026, 9, 7, 0, 5))).toBe('2026-10-07');
    expect(localISODate(new Date(2026, 9, 7, 23, 55))).toBe('2026-10-07');
  });

  it('starts the week on Monday, including from a Sunday', () => {
    expect(localISODate(weekStartOf(NOW))).toBe('2026-10-05');
    expect(localISODate(weekStartOf(new Date(2026, 9, 11)))).toBe('2026-10-05'); // Sunday
    expect(localISODate(weekStartOf(new Date(2026, 9, 5)))).toBe('2026-10-05'); // Monday
  });

  it('lists seven days Monday to Sunday', () => {
    const days = weekDays(weekStartOf(NOW)).map(localISODate);
    expect(days[0]).toBe('2026-10-05');
    expect(days[6]).toBe('2026-10-11');
    expect(days).toHaveLength(7);
  });

  it('reads a stored due date as the day that was picked', () => {
    expect(dueDay('2026-10-07T00:00:00.000Z')).toBe('2026-10-07');
    expect(dueDay(null)).toBe('');
  });

  it('builds each preset', () => {
    expect(dueQuery({ preset: 'today' }, NOW)).toEqual({ dueFrom: '2026-10-07', dueTo: '2026-10-07' });
    expect(dueQuery({ preset: 'week' }, NOW)).toEqual({ dueFrom: '2026-10-05', dueTo: '2026-10-11' });
    expect(dueQuery({ preset: 'next7' }, NOW)).toEqual({ dueFrom: '2026-10-07', dueTo: '2026-10-13' });
    expect(dueQuery({ preset: 'overdue' }, NOW)).toEqual({ due: 'overdue' });
    expect(dueQuery({ preset: 'none' }, NOW)).toEqual({ due: 'none' });
    expect(dueQuery({ preset: 'custom', from: '2026-10-01' }, NOW)).toEqual({ dueFrom: '2026-10-01' });
    expect(dueQuery({}, NOW)).toEqual({});
  });
});

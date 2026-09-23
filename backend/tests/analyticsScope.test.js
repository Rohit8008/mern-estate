/**
 * Date ranges for analytics are whole days in the workspace's timezone, with
 * the end date INCLUDED.
 *
 * The bug: `new Date('2026-09-23')` is midnight UTC at the START of that day
 * (05:30 IST), and it was used as an inclusive end, so nothing created on the
 * end date — including everything from today — was ever counted.
 */
import { rangeFrom, dayStartIn, todayIn } from '../utils/analyticsScope.js';

const req = (query = {}, tz = 'Asia/Kolkata') => ({ query, tenant: { locale: { timezone: tz } } });

describe('rangeFrom', () => {
  it('starts a day at midnight IST, not midnight UTC', () => {
    expect(dayStartIn('2026-09-23', 'Asia/Kolkata').toISOString()).toBe('2026-09-22T18:30:00.000Z');
  });

  it('includes the whole end date: the range ends at the next midnight', () => {
    const r = rangeFrom(req({ startDate: '2026-09-23', endDate: '2026-09-23' }));
    expect(r.start.toISOString()).toBe('2026-09-22T18:30:00.000Z');
    expect(r.endExclusive.toISOString()).toBe('2026-09-23T18:30:00.000Z');
    // Something created at 14:00 IST on the end date is inside the range.
    const createdToday = new Date('2026-09-23T08:30:00.000Z');
    expect(createdToday >= r.start && createdToday < r.endExclusive).toBe(true);
    expect(r.days).toBe(1);
  });

  it('defaults to the last N days including today, in the workspace timezone', () => {
    // 01:00 IST on 23 Sep is still 22 Sep in UTC; the range must end on the 23rd.
    const now = new Date('2026-09-22T19:30:00.000Z');
    expect(todayIn('Asia/Kolkata', now)).toBe('2026-09-23');
    const r = rangeFrom(req(), 30, now);
    expect(r.endYmd).toBe('2026-09-23');
    expect(r.startYmd).toBe('2026-08-25');
    expect(r.days).toBe(30);
  });

  it('refuses a start date after the end date with a 400', () => {
    expect(() => rangeFrom(req({ startDate: '2026-09-23', endDate: '2026-09-01' }))).toThrow('The start date is after the end date.');
    try { rangeFrom(req({ startDate: '2026-09-23', endDate: '2026-09-01' })); } catch (e) { expect(e.statusCode).toBe(400); }
  });

  it('refuses a malformed date', () => {
    expect(() => rangeFrom(req({ startDate: 'yesterday' }))).toThrow(/start date/);
  });

  it('follows another workspace timezone', () => {
    expect(dayStartIn('2026-09-23', 'America/New_York').toISOString()).toBe('2026-09-23T04:00:00.000Z');
  });
});

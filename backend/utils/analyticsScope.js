/**
 * The shared rules every analytics query follows.
 *
 * Each endpoint used to build its own filter, and each got a different part
 * wrong: soft-deleted clients were counted (14 clients shown for 8), the range
 * end was midnight at the START of the end date (so nothing from today ever
 * counted), some aggregations ignored the range entirely, and several ignored
 * the caller's role (an employee saw the whole agency's commission). One set
 * of helpers, used by every query, fixes all four at once.
 */

import mongoose from 'mongoose';
import { listingScope } from '../middleware/permissions.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

export class RangeError400 extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 400;
  }
}

/** Offset of `tz` from UTC at `date`, in ms (IST is +5:30). */
function tzOffsetMs(date, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+v.year, +v.month - 1, +v.day, +v.hour % 24, +v.minute, +v.second);
  return asUtc - date.getTime();
}

/** The instant a calendar day (YYYY-MM-DD) begins in `tz`. */
export function dayStartIn(ymd, tz) {
  const [y, m, d] = ymd.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  // Two passes settle the offset across a DST change on that day.
  let start = guess - tzOffsetMs(new Date(guess), tz);
  start = guess - tzOffsetMs(new Date(start), tz);
  return new Date(start);
}

/** Today's calendar date (YYYY-MM-DD) in `tz`. */
export function todayIn(tz, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${v.year}-${v.month}-${v.day}`;
}

const addDaysYmd = (ymd, n) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

export const workspaceTimezone = (req) => req.tenant?.locale?.timezone || 'Asia/Kolkata';

/**
 * The requested date range as whole days in the workspace's timezone:
 * `start` inclusive, `endExclusive` the first instant AFTER the end date, so
 * a query uses `{ $gte: start, $lt: endExclusive }` and "today" is counted.
 * Without dates it is the last `defaultDays` days including today.
 */
export function rangeFrom(req, defaultDays = 30, now = new Date()) {
  const tz = workspaceTimezone(req);
  const { startDate, endDate } = req.query || {};
  for (const [name, value] of [['start', startDate], ['end', endDate]]) {
    if (value && !YMD.test(String(value))) throw new RangeError400(`The ${name} date must look like 2026-09-23.`);
  }
  const endYmd = endDate || todayIn(tz, now);
  const startYmd = startDate || addDaysYmd(endYmd, -(defaultDays - 1));
  if (startYmd > endYmd) throw new RangeError400('The start date is after the end date.');
  const start = dayStartIn(startYmd, tz);
  const endExclusive = dayStartIn(addDaysYmd(endYmd, 1), tz);
  return { start, endExclusive, startYmd, endYmd, tz, days: Math.round((endExclusive - start) / DAY_MS) };
}

const oid = (id) => new mongoose.Types.ObjectId(String(id));

/** Live clients the caller may see: never soft-deleted; an employee's own. */
export function clientScope(req) {
  const scope = { isDeleted: { $ne: true } };
  if (req.user?.role !== 'admin') scope.assignedTo = oid(req.user.id);
  return scope;
}

/** Live listings the caller may see — the same rule as the Properties list. */
export function listingScopeFor(req) {
  const scope = { isDeleted: { $ne: true }, ...listingScope(req.user) };
  // listingScope's $or holds string ids; aggregations do not cast, so the
  // ObjectId columns need real ObjectIds to match.
  if (Array.isArray(scope.$or)) {
    scope.$or = scope.$or.map((clause) => {
      const [k, v] = Object.entries(clause)[0];
      return (k === 'assignedAgent' || k === 'userRef') && typeof v === 'string' ? { [k]: oid(v) } : clause;
    });
  } else if (typeof scope.userRef === 'string') {
    scope.userRef = oid(scope.userRef);
  }
  return scope;
}

/**
 * When a deal was won: the last time its stage history moved to closed_won.
 * `deals.updatedAt` changes on any later edit (a note, a commission fix), which
 * moved old wins into the current period.
 */
export const DEAL_WON_AT = {
  $ifNull: [
    {
      $max: {
        $map: {
          input: {
            $filter: {
              input: { $ifNull: ['$deals.stageHistory', []] },
              as: 'h',
              cond: { $eq: ['$$h.stage', 'closed_won'] },
            },
          },
          as: 'h',
          in: '$$h.changedAt',
        },
      },
    },
    '$deals.updatedAt',
  ],
};

/** A price that means something: the importer's 1 and the form's 0 do not. */
export const REAL_PRICE = { $cond: [{ $gt: ['$regularPrice', 1] }, '$regularPrice', null] };

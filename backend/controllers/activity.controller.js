import ActivityLog from '../models/activityLog.model.js';
import Client from '../models/client.model.js';
import Task from '../models/task.model.js';
import Listing from '../models/listing.model.js';
import Owner from '../models/owner.model.js';
import Transaction from '../models/transaction.model.js';
import Document from '../models/document.model.js';
import User from '../models/user.model.js';
import { errorHandler } from '../utils/error.js';
import mongoose from 'mongoose';
import { streamCsv } from '../utils/csvExport.js';
import { dayStartIn, workspaceTimezone } from '../utils/analyticsScope.js';

/**
 * Reading the workspace audit trail.
 *
 * This used to accept only `client` and `task` even though the log records
 * eight entity types, so six of them were written and never readable, and there
 * was no way at all to ask "what happened in this workspace today?". Both are
 * fixed here: every recorded type has a timeline, and admins (or anyone with
 * viewLogs) get a filterable trail across all of them.
 */

/**
 * How to find an entity, and who besides an admin may read its history.
 *
 * `owner` returns the id of the user the record belongs to, or null when the
 * record has no individual owner — in which case only admins and viewLogs
 * holders can read it.
 */
const ENTITIES = {
  client: {
    find: (id) => Client.findById(id).select('assignedTo'),
    owner: (doc) => doc.assignedTo,
  },
  task: {
    find: (id) => Task.findById(id).select('assignedTo'),
    owner: (doc) => doc.assignedTo,
  },
  deal: {
    // Deals are sub-documents of Client, so the parent decides access.
    find: (id) => Client.findOne({ 'deals._id': id }).select('assignedTo'),
    owner: (doc) => doc.assignedTo,
  },
  listing: {
    find: (id) => Listing.findById(id).select('assignedAgent userRef'),
    owner: (doc) => doc.assignedAgent || doc.userRef,
  },
  owner: {
    find: (id) => Owner.findById(id).select('_id'),
    owner: () => null,
  },
  transaction: {
    find: (id) => Transaction.findById(id).select('_id'),
    owner: () => null,
  },
  document: {
    find: (id) => Document.findById(id).select('uploadedBy'),
    owner: (doc) => doc.uploadedBy,
  },
  user: {
    find: (id) => User.findById(id).select('_id'),
    owner: (doc) => doc._id,
  },
};

export const ENTITY_TYPES = Object.keys(ENTITIES);

/**
 * viewLogs is the permission that grants the workspace-wide trail.
 *
 * `req.userRole` is set by requirePermission, which guards /search and /export.
 * On /:timeline there is no such guard, so this is admin-only there and every
 * other caller falls through to the per-record ownership check.
 */
function canReadAllLogs(req) {
  if (req?.user?.role === 'admin') return true;
  return req?.userRole?.hasPermission?.('viewLogs') === true;
}

export const listActivity = async (req, res, next) => {
  try {
    const { entityType, entityId, limit = 50, offset = 0 } = req.query;
    if (!entityType || !entityId) {
      return next(errorHandler(400, 'entityType and entityId are required'));
    }

    const spec = ENTITIES[String(entityType)];
    if (!spec) return next(errorHandler(400, 'Invalid entityType'));

    const entity = await spec.find(entityId);
    if (!entity) return next(errorHandler(404, 'Entity not found'));

    if (!canReadAllLogs(req)) {
      const ownerId = spec.owner(entity);
      if (!ownerId || String(ownerId) !== String(req.user.id)) {
        return next(errorHandler(403, "You don't have permission to do that."));
      }
    }

    const filter = { entityType: String(entityType), entityId };
    const [items, total] = await Promise.all([
      ActivityLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(Math.max(0, Number(offset) || 0))
        .limit(Math.min(200, Math.max(1, Number(limit) || 50)))
        .populate('createdBy', 'username email')
        .lean(),
      ActivityLog.countDocuments(filter),
    ]);

    res.json({ success: true, data: { total, items } });
  } catch (err) {
    next(err);
  }
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** The calendar day after `ymd`, as YYYY-MM-DD. */
const nextDay = (ymd) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};

/**
 * Shared by the admin trail and its CSV export.
 *
 * `since`/`until` arrive from a date picker as YYYY-MM-DD and mean whole days
 * in the workspace's timezone, with `until` INCLUDED. They used to go straight
 * into `new Date()`, which is midnight UTC at the start of the day — so
 * filtering "to today" dropped everything logged today, and a malformed date
 * reached Mongo as an Invalid Date and came back as a 500. A full timestamp is
 * still accepted as an exact bound; anything unparseable is ignored.
 */
export function buildTrailFilter(query, tz = 'Asia/Kolkata') {
  const { entityType, action, userId, since, until, q } = query;
  const filter = {};

  if (entityType && ENTITIES[String(entityType)]) filter.entityType = String(entityType);
  if (action) filter.action = String(action);
  // An id that cannot be an ObjectId would fail the cast with a 500.
  if (userId && mongoose.isValidObjectId(String(userId))) filter.createdBy = String(userId);

  const range = {};
  if (since) {
    const from = YMD.test(String(since)) ? dayStartIn(String(since), tz) : new Date(String(since));
    if (!Number.isNaN(from.getTime())) range.$gte = from;
  }
  if (until) {
    if (YMD.test(String(until))) {
      range.$lt = dayStartIn(nextDay(String(until)), tz);
    } else {
      const to = new Date(String(until));
      if (!Number.isNaN(to.getTime())) range.$lte = to;
    }
  }
  if (Object.keys(range).length) filter.createdAt = range;

  if (q) {
    // Escaped: a user-supplied regex must not become a ReDoS or match everything.
    const safe = String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { message: { $regex: safe, $options: 'i' } },
      { action: { $regex: safe, $options: 'i' } },
    ];
  }

  return filter;
}

/**
 * The workspace-wide trail: what happened, to what, by whom.
 */
export const searchActivity = async (req, res, next) => {
  try {
    if (!canReadAllLogs(req)) return next(errorHandler(403, "You don't have permission to do that."));

    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const filter = buildTrailFilter(req.query, workspaceTimezone(req));

    // `actions` and `actors` feed the filter dropdowns: what has actually been
    // recorded in this workspace, rather than a list that drifts from it. Both
    // are tenant-scoped like every other query here (distinct is covered by
    // the tenant plugin), and both ignore the current filter so choosing one
    // option does not empty the list of the others.
    const [items, total, actions, actorIds] = await Promise.all([
      ActivityLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .populate('createdBy', 'username email')
        .lean(),
      ActivityLog.countDocuments(filter),
      ActivityLog.distinct('action'),
      ActivityLog.distinct('createdBy'),
    ]);
    const actors = actorIds.length
      ? await User.find({ _id: { $in: actorIds } }).select('username email').sort({ username: 1 }).lean()
      : [];

    res.json({
      success: true,
      data: {
        total, items, limit, offset,
        entityTypes: ENTITY_TYPES,
        actions: actions.sort(),
        actors: actors.map((u) => ({ _id: u._id, username: u.username, email: u.email })),
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * The same trail as a CSV, streamed rather than paged, so an admin can hand a
 * complete period to an auditor. Capped so one request cannot pull the whole
 * collection into memory.
 */
export const exportActivity = async (req, res, next) => {
  try {
    if (!canReadAllLogs(req)) return next(errorHandler(403, "You don't have permission to do that."));

    const filter = buildTrailFilter(req.query, workspaceTimezone(req));
    const cursor = ActivityLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(50_000)
      .populate('createdBy', 'username email')
      .lean()
      .cursor();

    await streamCsv(res, {
      filename: 'audit-log',
      headers: ['When', 'Entity type', 'Entity id', 'Action', 'Message', 'By', 'Email', 'IP', 'Changes'],
      cursor,
      toRow: (row) => [
        row.createdAt,
        row.entityType,
        row.entityId,
        row.action,
        row.message || '',
        row.createdBy?.username || '',
        row.createdBy?.email || '',
        row.ip || '',
        row.changes ? JSON.stringify(row.changes) : '',
      ],
    });
  } catch (err) {
    next(err);
  }
};

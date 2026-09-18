import ActivityLog from '../models/activityLog.model.js';
import Client from '../models/client.model.js';
import Task from '../models/task.model.js';
import Listing from '../models/listing.model.js';
import Owner from '../models/owner.model.js';
import Transaction from '../models/transaction.model.js';
import Document from '../models/document.model.js';
import User from '../models/user.model.js';
import { errorHandler } from '../utils/error.js';
import { streamCsv } from '../utils/csvExport.js';

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
        return next(errorHandler(403, 'Forbidden'));
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

/** Shared by the admin trail and its CSV export. */
function buildTrailFilter(query) {
  const { entityType, action, userId, since, until, q } = query;
  const filter = {};

  if (entityType && ENTITIES[String(entityType)]) filter.entityType = String(entityType);
  if (action) filter.action = String(action);
  if (userId) filter.createdBy = userId;

  if (since || until) {
    filter.createdAt = {};
    if (since) filter.createdAt.$gte = new Date(since);
    if (until) filter.createdAt.$lte = new Date(until);
  }

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
    if (!canReadAllLogs(req)) return next(errorHandler(403, 'Forbidden'));

    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const filter = buildTrailFilter(req.query);

    const [items, total] = await Promise.all([
      ActivityLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .populate('createdBy', 'username email')
        .lean(),
      ActivityLog.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: { total, items, limit, offset, entityTypes: ENTITY_TYPES },
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
    if (!canReadAllLogs(req)) return next(errorHandler(403, 'Forbidden'));

    const filter = buildTrailFilter(req.query);
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

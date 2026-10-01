import Task from '../models/task.model.js';
import Client from '../models/client.model.js';
import Listing from '../models/listing.model.js';
import { errorHandler } from '../utils/error.js';
import { logActivity } from '../utils/activity.js';
import { notify } from '../utils/notify.js';
import { emitEvent } from '../utils/webhooks.js';
import { parsePaging, parseSort } from '../utils/listQuery.js';

function canAccessUser(user, targetUserId) {
  return user.role === 'admin' || String(user.id) === String(targetUserId);
}

export const createTask = async (req, res, next) => {
  try {
    const payload = req.body || {};

    // Non-admins can only assign to themselves
    const assignedTo = payload.assignedTo || req.user.id;
    if (!canAccessUser(req.user, assignedTo)) return next(errorHandler(403, 'Forbidden'));

    // Validate related entity access for employees
    if (payload.related?.kind === 'client' && payload.related?.clientId) {
      const c = await Client.findById(payload.related.clientId).select('assignedTo');
      if (!c) return next(errorHandler(404, 'Client not found'));
      if (req.user.role !== 'admin' && String(c.assignedTo) !== req.user.id) return next(errorHandler(403, 'Forbidden'));
    }
    if (payload.related?.kind === 'listing' && payload.related?.listingId) {
      const l = await Listing.findById(payload.related.listingId).select('userRef');
      if (!l) return next(errorHandler(404, 'Listing not found'));
      if (req.user.role !== 'admin' && String(l.userRef) !== req.user.id) return next(errorHandler(403, 'Forbidden'));
    }

    const doc = await Task.create({
      title: payload.title,
      description: payload.description || '',
      dueAt: payload.dueAt || null,
      status: payload.status || 'todo',
      priority: payload.priority || 'medium',
      assignedTo,
      createdBy: req.user.id,
      related: payload.related || { kind: 'none' },
      reminders: payload.reminders || [],
    });

    try {
      await logActivity({
        entityType: 'task',
        entityId: doc._id,
        action: 'task_created',
        message: `Task created: ${doc.title}`,
        meta: { status: doc.status, priority: doc.priority, dueAt: doc.dueAt, assignedTo: doc.assignedTo, related: doc.related },
        createdBy: req.user.id,
      });
    } catch (_) {}

    // Also log to client timeline if task is related to a client
    if (doc.related?.kind === 'client' && doc.related?.clientId) {
      try {
        await logActivity({
          entityType: 'client',
          entityId: doc.related.clientId,
          action: 'task_created',
          message: `Task created: ${doc.title}`,
          meta: { taskId: doc._id, status: doc.status, priority: doc.priority, dueAt: doc.dueAt },
          createdBy: req.user.id,
        });
      } catch (_) {}
    }

    // Tell the person the task is actually for.
    //
    // This used to email process.env.NOTIFY_TO — one global address for the
    // whole deployment — so in a multi-tenant product the assignee was never
    // told and somebody at the vendor got every agency's task mail. It also
    // only fired when a due date happened to be set.
    notify({
      to: assignedTo,
      actorId: req.user.id,
      type: 'task.assigned',
      title: `New task: ${doc.title}`,
      body: doc.dueAt
        ? `Due ${new Date(doc.dueAt).toISOString().slice(0, 16).replace('T', ' ')} UTC`
        : (doc.description || ''),
      link: '/tasks',
      entity: { type: 'task', id: doc._id },
    });

    emitEvent('task.created', {
      id: String(doc._id),
      title: doc.title,
      priority: doc.priority,
      status: doc.status,
      dueAt: doc.dueAt,
      assignedTo: String(doc.assignedTo),
      relatedKind: doc.related?.kind || 'none',
    });

    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
};

/** Columns the Tasks table can sort by — see parseSort. */
const TASK_SORTS = {
  dueAt: 'dueAt',
  title: 'title',
  status: 'status',
  priority: 'priority',
  createdAt: 'createdAt',
};

export const listTasks = async (req, res, next) => {
  try {
    const { q, status, priority, assignedTo, kind, clientId, listingId, dueFrom, dueTo } = req.query;
    const { page, limit, skip } = parsePaging(req.query);
    const sort = parseSort(req.query.sort, TASK_SORTS, { dueAt: 1 });
    const filter = { isDeleted: { $ne: true } };

    if (q) filter.$text = { $search: q };
    if (status) filter.status = status;
    // String() so a query-string object (?priority[$ne]=x) cannot become an operator.
    if (priority) filter.priority = String(priority);
    if (kind) filter['related.kind'] = kind;
    if (clientId) filter['related.clientId'] = clientId;
    if (listingId) filter['related.listingId'] = listingId;

    if (dueFrom || dueTo) {
      filter.dueAt = {};
      if (dueFrom) filter.dueAt.$gte = new Date(String(dueFrom));
      if (dueTo) filter.dueAt.$lte = new Date(String(dueTo));
    }

    if (req.user.role === 'admin') {
      if (assignedTo) filter.assignedTo = assignedTo;
    } else {
      filter.assignedTo = req.user.id;
    }

    const [items, total] = await Promise.all([
      Task.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      Task.countDocuments(filter),
    ]);

    res.json({ success: true, data: items, page, limit, total });
  } catch (err) {
    next(err);
  }
};

export const getTaskById = async (req, res, next) => {
  try {
    const doc = await Task.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!doc) return next(errorHandler(404, 'Task not found'));
    if (!canAccessUser(req.user, doc.assignedTo)) return next(errorHandler(403, 'Forbidden'));
    res.json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
};

export const updateTask = async (req, res, next) => {
  try {
    const doc = await Task.findById(req.params.id);
    if (!doc) return next(errorHandler(404, 'Task not found'));

    // Only admin or assignee can update
    if (!canAccessUser(req.user, doc.assignedTo)) return next(errorHandler(403, 'Forbidden'));

    // Non-admins cannot reassign to another user
    if (req.user.role !== 'admin' && req.body.assignedTo && String(req.body.assignedTo) !== req.user.id) {
      return next(errorHandler(403, 'You cannot reassign tasks'));
    }

    const updates = { ...req.body };
    if (req.user.role !== 'admin') delete updates.assignedTo;

    const prev = {
      status: doc.status,
      dueAt: doc.dueAt,
      priority: doc.priority,
      title: doc.title,
      description: doc.description,
    };
    const updated = await Task.findByIdAndUpdate(req.params.id, updates, { new: true });

    try {
      const statusChanged = updates.status && updates.status !== prev.status;
      await logActivity({
        entityType: 'task',
        entityId: updated._id,
        action: statusChanged ? 'task_status_updated' : 'task_updated',
        message: statusChanged
          ? `Task status changed from ${prev.status} to ${updated.status}`
          : 'Task updated',
        meta: { before: prev, after: { status: updated.status, dueAt: updated.dueAt, priority: updated.priority } },
        createdBy: req.user.id,
      });
    } catch (_) {}

    if (updated.related?.kind === 'client' && updated.related?.clientId) {
      try {
        const statusChanged = updates.status && updates.status !== prev.status;
        await logActivity({
          entityType: 'client',
          entityId: updated.related.clientId,
          action: statusChanged ? 'task_status_updated' : 'task_updated',
          message: statusChanged
            ? `Task status changed: ${updated.title} (${prev.status} → ${updated.status})`
            : `Task updated: ${updated.title}`,
          meta: { taskId: updated._id, before: prev, after: { status: updated.status, dueAt: updated.dueAt, priority: updated.priority } },
          createdBy: req.user.id,
        });
      } catch (_) {}
    }

    if (updates.status === 'done' && prev.status !== 'done') {
      emitEvent('task.completed', {
        id: String(updated._id),
        title: updated.title,
        assignedTo: String(updated.assignedTo),
        relatedKind: updated.related?.kind || 'none',
        completedBy: String(req.user.id),
      });
    }

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
};

export const deleteTask = async (req, res, next) => {
  try {
    const doc = await Task.findById(req.params.id);
    if (!doc) return next(errorHandler(404, 'Task not found'));
    if (!canAccessUser(req.user, doc.assignedTo)) return next(errorHandler(403, 'Forbidden'));

    const clientId = doc.related?.kind === 'client' ? doc.related?.clientId : null;
    await Task.findByIdAndUpdate(req.params.id, {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: req.user.id,
    });

    try {
      await logActivity({
        entityType: 'task',
        entityId: doc._id,
        action: 'task_deleted',
        message: `Task deleted: ${doc.title}`,
        meta: { related: doc.related },
        createdBy: req.user.id,
      });
    } catch (_) {}

    if (clientId) {
      try {
        await logActivity({
          entityType: 'client',
          entityId: clientId,
          action: 'task_deleted',
          message: `Task deleted: ${doc.title}`,
          meta: { taskId: doc._id },
          createdBy: req.user.id,
        });
      } catch (_) {}
    }

    res.json({ success: true, message: 'Task deleted' });
  } catch (err) {
    next(err);
  }
};

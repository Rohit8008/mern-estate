import Task from '../models/task.model.js';
import Client from '../models/client.model.js';
import Listing from '../models/listing.model.js';
import { errorHandler } from '../utils/error.js';
import { sendMail } from '../utils/mailer.js';
import { logActivity } from '../utils/activity.js';

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

    // Notify by email (best-effort)
    if (doc.dueAt) {
      sendMail({
        to: process.env.NOTIFY_TO || '',
        subject: `New Task Assigned: ${doc.title}`,
        text: `A task has been assigned and is due at ${doc.dueAt}.`,
      }).catch(() => {});
    }

    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
};

export const listTasks = async (req, res, next) => {
  try {
    const { q, status, assignedTo, page = 1, limit = 20, kind, clientId, listingId, dueFrom, dueTo } = req.query;
    const filter = { isDeleted: { $ne: true } };

    if (q) filter.$text = { $search: q };
    if (status) filter.status = status;
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

    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      Task.find(filter).sort({ dueAt: 1 }).skip(skip).limit(Number(limit)).lean(),
      Task.countDocuments(filter),
    ]);

    res.json({ success: true, data: items, page: Number(page), limit: Number(limit), total });
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

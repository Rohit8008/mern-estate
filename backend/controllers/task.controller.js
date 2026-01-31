import Task from '../models/task.model.js';
import Client from '../models/client.model.js';
import Listing from '../models/listing.model.js';
import { errorHandler } from '../utils/error.js';
import { sendMail } from '../utils/mailer.js';

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
    const { q, status, assignedTo, page = 1, limit = 20, kind, clientId, listingId } = req.query;
    const filter = {};

    if (q) filter.$text = { $search: q };
    if (status) filter.status = status;
    if (kind) filter['related.kind'] = kind;
    if (clientId) filter['related.clientId'] = clientId;
    if (listingId) filter['related.listingId'] = listingId;

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
    const doc = await Task.findById(req.params.id);
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

    const updated = await Task.findByIdAndUpdate(req.params.id, updates, { new: true });
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
    await doc.deleteOne();
    res.json({ success: true, message: 'Task deleted' });
  } catch (err) {
    next(err);
  }
};

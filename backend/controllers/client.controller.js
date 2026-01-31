import Client from '../models/client.model.js';
import { errorHandler } from '../utils/error.js';

// Create a new client (admin or employee for themselves)
export const createClient = async (req, res, next) => {
  try {
    const payload = req.body || {};

    const assignedTo = payload.assignedTo || req.user.id;
    if (req.user.role !== 'admin' && String(assignedTo) !== req.user.id) {
      return next(errorHandler(403, 'You can only assign clients to yourself'));
    }

    const doc = await Client.create({
      name: payload.name,
      email: payload.email || '',
      phone: payload.phone || '',
      status: payload.status || 'lead',
      notes: payload.notes || '',
      tags: payload.tags || [],
      source: payload.source || '',
      interestedListings: payload.interestedListings || [],
      assignedTo,
      organization: payload.organization || '',
      lastContactAt: payload.lastContactAt || null,
      createdBy: req.user.id,
    });

    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
};

// List clients with filters; non-admins only see their own
export const getClients = async (req, res, next) => {
  try {
    const { q, status, assignedTo, tag, page = 1, limit = 20 } = req.query;
    const filter = {};

    if (q) {
      filter.$text = { $search: q };
    }
    if (status) filter.status = status;
    if (tag) filter.tags = tag;

    if (req.user.role === 'admin') {
      if (assignedTo) filter.assignedTo = assignedTo;
    } else {
      filter.assignedTo = req.user.id;
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      Client.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      Client.countDocuments(filter),
    ]);

    res.json({ success: true, data: items, page: Number(page), limit: Number(limit), total });
  } catch (err) {
    next(err);
  }
};

export const getClientById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const doc = await Client.findById(id).lean();
    if (!doc) return next(errorHandler(404, 'Client not found'));
    if (req.user.role !== 'admin' && String(doc.assignedTo) !== req.user.id) {
      return next(errorHandler(403, 'Forbidden'));
    }
    res.json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
};

export const updateClient = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await Client.findById(id);
    if (!existing) return next(errorHandler(404, 'Client not found'));

    // Non-admins can only update their own
    if (req.user.role !== 'admin' && String(existing.assignedTo) !== req.user.id) {
      return next(errorHandler(403, 'Forbidden'));
    }

    // If non-admin tries to reassign, block
    if (req.user.role !== 'admin' && req.body.assignedTo && String(req.body.assignedTo) !== req.user.id) {
      return next(errorHandler(403, 'You cannot reassign clients'));
    }

    const updates = { ...req.body };
    if (req.user.role !== 'admin') delete updates.assignedTo;

    const updated = await Client.findByIdAndUpdate(id, updates, { new: true });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
};

export const deleteClient = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await Client.findById(id);
    if (!existing) return next(errorHandler(404, 'Client not found'));
    if (req.user.role !== 'admin' && String(existing.assignedTo) !== req.user.id) {
      return next(errorHandler(403, 'Forbidden'));
    }
    await Client.findByIdAndDelete(id);
    res.json({ success: true, message: 'Client deleted' });
  } catch (err) {
    next(err);
  }
};

export const assignClient = async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return next(errorHandler(403, 'Admin only'));
    const { id } = req.params;
    const { assignedTo } = req.body;
    const updated = await Client.findByIdAndUpdate(id, { assignedTo }, { new: true });
    if (!updated) return next(errorHandler(404, 'Client not found'));
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
};

export const addInterestedListing = async (req, res, next) => {
  try {
    const { id } = req.params; // client id
    const { listingId } = req.body;
    const existing = await Client.findById(id);
    if (!existing) return next(errorHandler(404, 'Client not found'));
    if (req.user.role !== 'admin' && String(existing.assignedTo) !== req.user.id) {
      return next(errorHandler(403, 'Forbidden'));
    }
    if (!existing.interestedListings.includes(listingId)) {
      existing.interestedListings.push(listingId);
      await existing.save();
    }
    res.json({ success: true, data: existing });
  } catch (err) {
    next(err);
  }
};

export const removeInterestedListing = async (req, res, next) => {
  try {
    const { id } = req.params; // client id
    const { listingId } = req.body;
    const existing = await Client.findById(id);
    if (!existing) return next(errorHandler(404, 'Client not found'));
    if (req.user.role !== 'admin' && String(existing.assignedTo) !== req.user.id) {
      return next(errorHandler(403, 'Forbidden'));
    }
    existing.interestedListings = existing.interestedListings.filter((x) => String(x) !== String(listingId));
    await existing.save();
    res.json({ success: true, data: existing });
  } catch (err) {
    next(err);
  }
};

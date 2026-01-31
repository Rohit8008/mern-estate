import Owner from '../models/owner.model.js';
import { errorHandler } from '../utils/error.js';
import { io } from '../index.js';

export const createOwner = async (req, res, next) => {
  try {
    const owner = await Owner.create(req.body);
    // Notify all clients that owners list changed
    try { io.emit('owners:changed'); } catch (_) {}
    res.status(201).json(owner);
  } catch (e) {
    next(e);
  }
};

export const updateOwner = async (req, res, next) => {
  try {
    const updated = await Owner.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return next(errorHandler(404, 'Owner not found'));
    try { io.emit('owners:changed'); } catch (_) {}
    res.status(200).json(updated);
  } catch (e) {
    next(e);
  }
};

export const deleteOwner = async (req, res, next) => {
  try {
    const deleted = await Owner.findByIdAndDelete(req.params.id);
    if (!deleted) return next(errorHandler(404, 'Owner not found'));
    try { io.emit('owners:changed'); } catch (_) {}
    res.status(200).json({ success: true });
  } catch (e) {
    next(e);
  }
};

export const getOwner = async (req, res, next) => {
  try {
    const owner = await Owner.findById(req.params.id);
    if (!owner) return next(errorHandler(404, 'Owner not found'));
    res.status(200).json(owner);
  } catch (e) {
    next(e);
  }
};

export const listOwners = async (req, res, next) => {
  try {
    const { q, active } = req.query;
    const filter = {};
    if (q) filter.name = { $regex: String(q), $options: 'i' };
    if (active === 'true') filter.active = true;
    if (active === 'false') filter.active = false;
    const owners = await Owner.find(filter).sort({ createdAt: -1 }).limit(200);
    res.status(200).json(owners);
  } catch (e) {
    next(e);
  }
};



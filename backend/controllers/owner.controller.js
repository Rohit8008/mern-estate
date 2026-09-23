import Owner from '../models/owner.model.js';
import { errorHandler } from '../utils/error.js';
import { emitToTenant } from '../socket.js';
import { logFromRequest, diffFields } from '../utils/activity.js';
import { phoneKeyOf } from '../utils/phoneKey.js';

export const createOwner = async (req, res, next) => {
  try {
    // The same person entered twice (the inline "New owner" on the properties
    // board made a fresh record each time) splits their listings across
    // duplicates. A matching phone number returns the existing owner instead.
    const key = phoneKeyOf(req.body?.phone);
    if (key) {
      const candidates = await Owner.find({ isDeleted: { $ne: true }, phone: { $nin: ['', null] } })
        .select('name phone email companyName')
        .limit(5000)
        .lean();
      const existing = candidates.find((o) => phoneKeyOf(o.phone) === key);
      if (existing) return res.status(200).json({ ...existing, existing: true });
    }
    const owner = await Owner.create(req.body);
    logFromRequest(req, {
      entityType: 'owner',
      entityId: owner._id,
      action: 'owner.created',
      message: `Created owner ${owner.name || ''}`.trim(),
    });
    // Notify all clients that owners list changed
    emitToTenant(req.tenantId, 'owners:changed');
    res.status(201).json(owner);
  } catch (e) {
    next(e);
  }
};

export const updateOwner = async (req, res, next) => {
  try {
    // Read first so the trail can record what the values were before.
    const before = await Owner.findById(req.params.id).lean();
    const updated = await Owner.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return next(errorHandler(404, 'Owner not found'));
    logFromRequest(req, {
      entityType: 'owner',
      entityId: updated._id,
      action: 'owner.updated',
      message: `Updated owner ${updated.name || ''}`.trim(),
      changes: diffFields(before, updated.toObject(), Object.keys(req.body || {})),
    });
    emitToTenant(req.tenantId, 'owners:changed');
    res.status(200).json(updated);
  } catch (e) {
    next(e);
  }
};

export const deleteOwner = async (req, res, next) => {
  try {
    const deleted = await Owner.findByIdAndUpdate(
      req.params.id,
      {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: req.user?.id || null,
      },
      { new: true }
    );
    if (!deleted) return next(errorHandler(404, 'Owner not found'));
    logFromRequest(req, {
      entityType: 'owner',
      entityId: deleted._id,
      action: 'owner.deleted',
      message: `Deleted owner ${deleted.name || ''}`.trim(),
    });
    emitToTenant(req.tenantId, 'owners:changed');
    res.status(200).json({ success: true });
  } catch (e) {
    next(e);
  }
};

export const getOwner = async (req, res, next) => {
  try {
    const owner = await Owner.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!owner) return next(errorHandler(404, 'Owner not found'));
    res.status(200).json(owner);
  } catch (e) {
    next(e);
  }
};

export const listOwners = async (req, res, next) => {
  try {
    const { q, active } = req.query;
    const filter = { isDeleted: { $ne: true } };
    if (q) filter.name = { $regex: String(q), $options: 'i' };
    if (active === 'true') filter.active = true;
    if (active === 'false') filter.active = false;
    const owners = await Owner.find(filter).sort({ createdAt: -1 }).limit(200);
    res.status(200).json(owners);
  } catch (e) {
    next(e);
  }
};



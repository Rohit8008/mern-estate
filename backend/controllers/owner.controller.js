import Owner from '../models/owner.model.js';
import { errorHandler } from '../utils/error.js';
import { emitToTenant } from '../socket.js';
import { logFromRequest, diffFields } from '../utils/activity.js';
import { phoneKeyOf } from '../utils/phoneKey.js';
import { parsePaging, parseSort } from '../utils/listQuery.js';
import { containsInsensitive } from '../utils/escapeRegex.js';

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

/** Columns the Owners table can sort by — see parseSort. */
const OWNER_SORTS = {
  name: 'name',
  email: 'email',
  phone: 'phone',
  createdAt: 'createdAt',
};

export const listOwners = async (req, res, next) => {
  try {
    const { q, active } = req.query;
    const filter = { isDeleted: { $ne: true } };
    if (q) {
      // Escaped: the text is someone's search, not a pattern. Unescaped, a
      // stray "(" was a 500 and "(a+)+$" a way to stall the database.
      const rx = containsInsensitive(q);
      filter.$or = ['name', 'email', 'phone', 'companyName', 'city'].map((field) => ({ [field]: rx }));
    }
    if (active === 'true') filter.active = true;
    if (active === 'false') filter.active = false;

    // Paged only when asked. Without `page` the answer stays a bare array
    // capped at 200: the mobile app, the listing form's owner picker and three
    // other screens read it that way, and changing the shape under them would
    // break every one at once.
    if (req.query.page === undefined) {
      const owners = await Owner.find(filter).sort({ createdAt: -1 }).limit(200);
      return res.status(200).json(owners);
    }

    const { page, limit, skip } = parsePaging(req.query);
    const sort = parseSort(req.query.sort, OWNER_SORTS, { createdAt: -1 });
    const [items, total] = await Promise.all([
      Owner.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      Owner.countDocuments(filter),
    ]);
    return res.status(200).json({ success: true, data: items, page, limit, total });
  } catch (e) {
    next(e);
  }
};



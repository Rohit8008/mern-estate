import Client from '../models/client.model.js';
import { phoneKeyOf } from '../utils/phoneKey.js';
import { errorHandler } from '../utils/error.js';
import { logFromRequest, diffFields } from '../utils/activity.js';
import { notify } from '../utils/notify.js';
import { chooseAssignee } from '../tenancy/leadAssignment.js';
import { runHook } from '../plugins/registry.js';
import { streamCsv, joinNames } from '../utils/csvExport.js';
import { emitEvent } from '../utils/webhooks.js';
import mongoose from 'mongoose';

/**
 * Normalise a phone number for comparison.
 *
 * "+91 98765 43210", "098765 43210" and "9876543210" are one person. Comparing
 * the raw strings — which is what no comparison at all amounts to — means the
 * same lead gets entered three times by three agents and then gets called three
 * times.
 *
 * The rule lives in utils/phoneKey.js, shared with the Client pre-save hook
 * that writes the stored `phoneKey` this is compared against. A second copy
 * here would be free to drift from the values in the database.
 */
const phoneKey = phoneKeyOf;

/**
 * Anyone already on file with this phone or email.
 *
 * Runs across the whole workspace, not just the caller's own leads: the point
 * is to catch the case where a colleague already owns this person.
 */
async function findDuplicateClient({ phone, email }) {
  const clauses = [];

  const key = phoneKey(phone);
  if (key.length >= 10) {
    // Matched on the derived, indexed key rather than a suffix regex, which no
    // index can serve.
    clauses.push({ phoneKey: key });
  }

  if (email && String(email).trim()) {
    clauses.push({ email: String(email).trim().toLowerCase() });
  }

  if (!clauses.length) return null;

  return Client.findOne({ $or: clauses, isDeleted: { $ne: true } })
    .select('name phone email assignedTo status createdAt')
    .populate('assignedTo', 'username')
    .lean();
}

// Create a new client (admin or employee for themselves)
export const createClient = async (req, res, next) => {
  try {
    const payload = req.body || {};

    /*
     * Refuse a duplicate rather than creating a second record for the same
     * person — the same 409-with-a-count shape categories use, so the UI can
     * offer the choice. `?force=true` creates it anyway, for the genuine case
     * of two people sharing a landline.
     */
    if (req.query.force !== 'true') {
      const duplicate = await findDuplicateClient(payload);
      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: `${duplicate.name || 'Someone'} is already on file with that ${
            duplicate.email === String(payload.email || '').trim().toLowerCase() ? 'email' : 'phone number'
          }.`,
          data: {
            duplicate: {
              _id: String(duplicate._id),
              name: duplicate.name,
              phone: duplicate.phone,
              email: duplicate.email,
              status: duplicate.status,
              assignedTo: duplicate.assignedTo?.username || null,
              createdAt: duplicate.createdAt,
            },
            canForce: true,
          },
        });
      }
    }

    // The workspace's leadAssignment rule decides the owner when the caller
    // did not name one. An explicit assignedTo still wins, and a non-admin
    // still cannot hand a lead to somebody else.
    const { assignedTo, mode, automatic } = await chooseAssignee({
      requested: payload.assignedTo,
      fallback: req.user.id,
      locality: Array.isArray(payload.preferredLocations)
        ? payload.preferredLocations[0]
        : payload.preferredLocations,
    });

    if (req.user.role !== 'admin' && payload.assignedTo && String(assignedTo) !== req.user.id) {
      return next(errorHandler(403, 'You can only assign clients to yourself'));
    }

    // Joi has already validated and stripped unknown fields from req.body,
    // so spreading it is safe. We override assignedTo and add createdBy.
    const base = { ...payload, assignedTo, createdBy: req.user.id };

    // Workspace rules may adjust the lead before it is written — setting a
    // priority from the source, for instance.
    const ruled = await runHook('lead.onCreate', { client: base, user: req.user });
    const doc = new Client(ruled.client || base);

    // Score on creation. Until now the score stayed at 0 until somebody logged
    // a communication, so a fresh lead with a stated budget and an urgent
    // priority read as cold.
    doc.calculateScore();
    await doc.save();

    logFromRequest(req, {
      entityType: 'client',
      entityId: doc._id,
      action: 'client.created',
      message: `Created ${doc.name || 'client'}`,
      meta: { assignmentMode: mode, automatic },
    });

    // Only worth a notification when the rule handed it to somebody who did not
    // ask for it; notify() drops the actor anyway.
    if (String(assignedTo) !== String(req.user.id)) {
      notify({
        to: assignedTo,
        actorId: req.user.id,
        type: 'lead.assigned',
        title: `New lead assigned: ${doc.name || 'client'}`,
        body: automatic ? `Assigned automatically (${mode.replace('_', ' ')}).` : '',
        link: `/clients/${doc._id}`,
        entity: { type: 'client', id: doc._id },
      });
    }

    emitEvent('lead.created', {
      id: String(doc._id),
      name: doc.name,
      email: doc.email,
      phone: doc.phone,
      status: doc.status,
      source: doc.source,
      assignedTo: String(assignedTo),
    });

    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
};

// List clients with filters; non-admins only see their own
export const getClients = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const filter = buildClientFilter(req);

    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      // tagIds is populated so the list can render chips without a second
      // request per row.
      Client.find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('tagIds', 'name color')
        .lean(),
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
    const doc = await Client.findOne({ _id: id, isDeleted: { $ne: true } })
      .populate('tagIds', 'name color')
      .lean();
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
    const existing = await Client.findOne({ _id: id, isDeleted: { $ne: true } });
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

    const before = existing.toObject();

    // Applied to the document rather than through findByIdAndUpdate, so the
    // score can be recomputed from the new values — budget, priority and
    // interested listings all feed it, and none of them used to trigger it.
    existing.set(updates);

    // A person choosing a temperature pins it against later recalculation.
    if (updates.temperature) existing.temperatureManual = true;

    existing.calculateScore();
    await existing.save();
    const updated = existing;

    logFromRequest(req, {
      entityType: 'client',
      entityId: updated._id,
      action: 'client.updated',
      message: `Updated ${updated.name || 'client'}`,
      changes: diffFields(before, updated.toObject(), Object.keys(updates)),
    });

    emitEvent('lead.updated', {
      id: String(updated._id),
      name: updated.name,
      status: updated.status,
      changed: Object.keys(updates),
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
};

export const deleteClient = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await Client.findOne({ _id: id, isDeleted: { $ne: true } });
    if (!existing) return next(errorHandler(404, 'Client not found'));
    if (req.user.role !== 'admin' && String(existing.assignedTo) !== req.user.id) {
      return next(errorHandler(403, 'Forbidden'));
    }
    await Client.findByIdAndUpdate(id, {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: req.user.id,
    });

    logFromRequest(req, {
      entityType: 'client',
      entityId: id,
      action: 'client.deleted',
      message: `Deleted ${existing.name || 'client'}`,
    });

    emitEvent('lead.deleted', { id: String(id), name: existing.name });

    res.json({ success: true, message: 'Client deleted' });
  } catch (err) {
    next(err);
  }
};

/**
 * The filter behind the list, shared by the list, the export and bulk actions.
 *
 * Pulled out so an export cannot drift from what the user is looking at — the
 * old client-side export wrote whatever page happened to be loaded, which is
 * how "export my 400 leads" produced a file with 20 rows in it.
 */
function buildClientFilter(req) {
  const { q, status, contactType, assignedTo, tag, temperature } = req.query;
  const filter = { isDeleted: { $ne: true } };

  if (q) filter.$text = { $search: q };
  if (status) filter.status = status;
  if (contactType) filter.contactType = contactType;
  if (tag) filter.tagIds = tag;
  if (['hot', 'warm', 'cold'].includes(temperature)) filter.temperature = temperature;

  // Non-admins only ever act on their own, whatever the query string says.
  if (req.user.role === 'admin') {
    if (assignedTo) filter.assignedTo = assignedTo;
  } else {
    filter.assignedTo = req.user.id;
  }

  return filter;
}

/**
 * Apply one change to many leads at once.
 *
 * No list screen had checkboxes, so reassigning a departing agent's forty leads
 * meant forty round trips through a dropdown. Scoping is the same as a single
 * edit — a non-admin's selection is narrowed to what they own before anything
 * is written, so an id they were not meant to touch is silently excluded
 * rather than acted on.
 */
export const bulkUpdateClients = async (req, res, next) => {
  try {
    const { ids, action, value } = req.body || {};

    if (!Array.isArray(ids) || !ids.length) return next(errorHandler(400, 'Select at least one client'));
    if (ids.length > 500) return next(errorHandler(400, 'Too many at once — select up to 500'));

    const validIds = ids.filter((id) => mongoose.isValidObjectId(id));
    if (!validIds.length) return next(errorHandler(400, 'No valid ids'));

    const scope = { _id: { $in: validIds }, isDeleted: { $ne: true } };
    if (req.user.role !== 'admin') scope.assignedTo = req.user.id;

    let update;
    let message;

    if (action === 'assign') {
      if (req.user.role !== 'admin') return next(errorHandler(403, 'Only an admin can reassign'));
      if (!mongoose.isValidObjectId(value)) return next(errorHandler(400, 'Choose an agent'));
      update = { $set: { assignedTo: value } };
      message = 'reassigned';
    } else if (action === 'status') {
      const allowed = Client.schema.path('status').enumValues;
      if (!allowed.includes(value)) return next(errorHandler(400, 'Unknown status'));
      update = { $set: { status: value } };
      message = `moved to ${value}`;
    } else if (action === 'delete') {
      update = { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: req.user.id } };
      message = 'deleted';
    } else if (action === 'tag' || action === 'untag') {
      if (!mongoose.isValidObjectId(value)) return next(errorHandler(400, 'Choose a tag'));
      update = action === 'tag' ? { $addToSet: { tagIds: value } } : { $pull: { tagIds: value } };
      message = action === 'tag' ? 'tagged' : 'untagged';
    } else {
      return next(errorHandler(400, 'Unknown action'));
    }

    // Read the affected ids first: after the write, a soft delete no longer
    // matches the scope and the audit line could not name what it touched.
    const affected = await Client.find(scope).select('_id name').lean();
    const result = await Client.updateMany(scope, update);

    logFromRequest(req, {
      entityType: 'client',
      entityId: affected[0]?._id || req.user.id,
      action: `client.bulk_${action}`,
      message: `${result.modifiedCount} clients ${message}`,
      meta: { ids: affected.map((c) => String(c._id)), value: value ?? null },
    });

    // Tell each new owner, once, rather than once per lead.
    if (action === 'assign' && affected.length) {
      notify({
        to: value,
        actorId: req.user.id,
        type: 'lead.assigned',
        title: `${affected.length} lead${affected.length === 1 ? '' : 's'} assigned to you`,
        body: affected.slice(0, 3).map((c) => c.name).filter(Boolean).join(', '),
        link: '/clients',
      });
    }

    res.json({
      success: true,
      data: { matched: result.matchedCount, modified: result.modifiedCount, requested: ids.length },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Export the filtered set of leads, not the loaded page.
 */
export const exportClients = async (req, res, next) => {
  try {
    const cursor = Client.find(buildClientFilter(req))
      .sort({ updatedAt: -1 })
      .limit(50_000)
      .populate('assignedTo', 'username email')
      .populate('tagIds', 'name')
      .lean()
      .cursor();

    await streamCsv(res, {
      filename: 'leads',
      headers: [
        'Name', 'Email', 'Phone', 'Status', 'Priority', 'Contact type', 'Source',
        'Assigned to', 'Score', 'Budget min', 'Budget max', 'Preferred locations',
        'Tags', 'Deals', 'Last contact', 'Created',
      ],
      cursor,
      toRow: (c) => [
        c.name || '',
        c.email || '',
        c.phone || '',
        c.status || '',
        c.priority || '',
        c.contactType || '',
        c.source || '',
        c.assignedTo?.username || '',
        c.score ?? 0,
        c.budget?.min ?? 0,
        c.budget?.max ?? 0,
        Array.isArray(c.preferredLocations) ? c.preferredLocations.join('; ') : (c.preferredLocations || ''),
        joinNames(c.tagIds),
        (c.deals || []).length,
        c.lastContactAt,
        c.createdAt,
      ],
    });
  } catch (err) {
    next(err);
  }
};

export const assignClient = async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return next(errorHandler(403, 'Admin only'));
    const { id } = req.params;
    const { assignedTo } = req.body;
    const before = await Client.findOne({ _id: id, isDeleted: { $ne: true } }).select('assignedTo name').lean();
    const updated = await Client.findOneAndUpdate({ _id: id, isDeleted: { $ne: true } }, { assignedTo }, { new: true });
    if (!updated) return next(errorHandler(404, 'Client not found'));

    logFromRequest(req, {
      entityType: 'client',
      entityId: updated._id,
      action: 'client.assigned',
      message: `Assigned ${updated.name || 'client'}`,
      changes: diffFields(before, updated.toObject(), ['assignedTo']),
    });

    // Nothing told the new owner they had been given a lead. Skipped when the
    // assignment did not actually change hands.
    if (String(before?.assignedTo || '') !== String(assignedTo)) {
      notify({
        to: assignedTo,
        actorId: req.user.id,
        type: 'lead.assigned',
        title: `Lead assigned to you: ${updated.name || 'client'}`,
        link: `/clients/${updated._id}`,
        entity: { type: 'client', id: updated._id },
      });
    }

    emitEvent('lead.assigned', {
      id: String(updated._id),
      name: updated.name,
      assignedTo: String(assignedTo),
      previousAssignee: before?.assignedTo ? String(before.assignedTo) : null,
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
};

/**
 * Attach a photo to a lead.
 *
 * The file itself is uploaded to Cloudinary from the browser, as listing images
 * are; only the resulting URL comes here. The model had no image field at all
 * before, so a site-visit photo or a snapped document had nowhere to live.
 */
export const addClientPhoto = async (req, res, next) => {
  try {
    const { url, caption } = req.body || {};
    if (!url || !/^https?:\/\//i.test(String(url))) {
      return next(errorHandler(400, 'A photo needs a URL'));
    }

    const client = await Client.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!client) return next(errorHandler(404, 'Client not found'));

    if (req.user.role !== 'admin' && String(client.assignedTo) !== req.user.id) {
      return next(errorHandler(403, 'Forbidden'));
    }

    // Capped so one record cannot grow without bound.
    if ((client.photos || []).length >= 30) {
      return next(errorHandler(400, 'That is as many photos as one client can hold.'));
    }

    client.photos.push({
      url: String(url).slice(0, 2000),
      caption: String(caption || '').slice(0, 200),
      uploadedBy: req.user.id,
    });
    await client.save();

    logFromRequest(req, {
      entityType: 'client',
      entityId: client._id,
      action: 'client.photo_added',
      message: `Added a photo to ${client.name || 'client'}`,
    });

    res.status(201).json({ success: true, data: client.photos });
  } catch (err) {
    next(err);
  }
};

export const deleteClientPhoto = async (req, res, next) => {
  try {
    const client = await Client.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!client) return next(errorHandler(404, 'Client not found'));

    if (req.user.role !== 'admin' && String(client.assignedTo) !== req.user.id) {
      return next(errorHandler(403, 'Forbidden'));
    }

    const photo = client.photos.id(req.params.photoId);
    if (!photo) return next(errorHandler(404, 'Photo not found'));

    photo.deleteOne();
    await client.save();

    res.json({ success: true, data: client.photos });
  } catch (err) {
    next(err);
  }
};

export const addInterestedListing = async (req, res, next) => {
  try {
    const { id } = req.params; // client id
    const { listingId } = req.body;
    const existing = await Client.findOne({ _id: id, isDeleted: { $ne: true } });
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
    const existing = await Client.findOne({ _id: id, isDeleted: { $ne: true } });
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

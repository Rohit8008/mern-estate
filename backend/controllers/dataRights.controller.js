import User from '../models/user.model.js';
import Client from '../models/client.model.js';
import Owner from '../models/owner.model.js';
import BuyerRequirement from '../models/buyerRequirement.model.js';
import Task from '../models/task.model.js';
import Message from '../models/message.model.js';
import Document from '../models/document.model.js';
import ActivityLog from '../models/activityLog.model.js';
import SecurityLog from '../models/securityLog.model.js';
import Notification from '../models/notification.model.js';
import { errorHandler } from '../utils/error.js';
import { logFromRequest } from '../utils/activity.js';
import { inHomeTenant } from '../tenancy/tenantContext.js';

/**
 * Data subject rights: access and erasure.
 *
 * There was nothing here at all — no export, no erasure, and a "Delete Account"
 * button that soft-deleted the user while telling them it removed all their
 * data. `exportData` existed as a permission name with no endpoint behind it.
 *
 * Two distinct subjects, handled differently:
 *
 *  - **A team member** (a User). Their account is closed and their personal
 *    details are replaced, but the records they created stay: a workspace's
 *    audit trail and its property book belong to the agency, and deleting the
 *    agent would take the agency's own history with it.
 *
 *  - **A contact** (a Client, Owner or BuyerRequirement — someone whose data
 *    the agency holds about them). Erasure here removes the personal details
 *    outright, keeping only the anonymous shape needed for reporting totals to
 *    stay correct.
 *
 * Erasure is deliberately not reversible and deliberately admin-only.
 */

/**
 * Strip Mongo bookkeeping from a document before it goes in an export.
 *
 * `tenantId` is destructured out rather than deleted: an export handed to a
 * data subject should not carry another workspace's identifier, and `__v` is
 * noise to anyone reading the file.
 */
function clean(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  // eslint-disable-next-line no-unused-vars
  const { __v, tenantId, ...rest } = doc;
  return rest;
}

/**
 * Everything the workspace holds about one team member, as JSON.
 *
 * A user may always export themselves; exporting somebody else needs
 * `exportData`, which the route enforces.
 */
export const exportUserData = async (req, res, next) => {
  try {
    const targetId = req.params.id || req.user.id;
    const isSelf = String(targetId) === String(req.user.id);

    if (!isSelf && req.user.role !== 'admin' && req.userRole?.hasPermission?.('exportData') !== true) {
      return next(errorHandler(403, 'Forbidden'));
    }

    // A session lookup is about the CALLER's workspace, so it is pinned; the
    // records below are workspace data and are scoped normally.
    const user = await inHomeTenant(req, () =>
      User.findById(targetId).select('-password -refreshTokens').lean()
    );
    if (!user) return next(errorHandler(404, 'User not found'));

    const [clients, owners, buyers, tasks, documents, activity, security, notifications, messages] =
      await Promise.all([
        Client.find({ $or: [{ assignedTo: targetId }, { createdBy: targetId }] }).lean(),
        Owner.find({ createdBy: targetId }).lean(),
        BuyerRequirement.find({ $or: [{ createdBy: targetId }, { assignedAgent: targetId }] }).lean(),
        Task.find({ $or: [{ assignedTo: targetId }, { createdBy: targetId }] }).lean(),
        Document.find({ uploadedBy: targetId }).select('-path').lean(),
        ActivityLog.find({ createdBy: targetId }).limit(5000).lean(),
        inHomeTenant(req, () => SecurityLog.find({ email: user.email }).limit(1000).lean()),
        Notification.find({ user: targetId }).limit(2000).lean(),
        Message.find({ $or: [{ senderId: targetId }, { receiverId: targetId }] })
          .select('-content') // message bodies may be encrypted and are the other party's too
          .limit(5000)
          .lean(),
      ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      exportedBy: String(req.user.id),
      subject: { kind: 'user', id: String(targetId) },
      account: clean(user),
      records: {
        clients: clients.map(clean),
        owners: owners.map(clean),
        buyerRequirements: buyers.map(clean),
        tasks: tasks.map(clean),
        documents: documents.map(clean),
        notifications: notifications.map(clean),
        messageMetadata: messages.map(clean),
      },
      logs: {
        activity: activity.map(clean),
        security: security.map(clean),
      },
    };

    logFromRequest(req, {
      entityType: 'user',
      entityId: targetId,
      action: 'data.exported',
      message: `Exported all data for ${user.email}`,
    });

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="data-export-${String(targetId)}-${new Date().toISOString().slice(0, 10)}.json"`
    );
    res.send(JSON.stringify(payload, null, 2));
  } catch (err) {
    next(err);
  }
};

/**
 * Everything the workspace holds about one contact.
 */
export const exportContactData = async (req, res, next) => {
  try {
    const { kind, id } = req.params;

    const MODELS = { client: Client, owner: Owner, buyer: BuyerRequirement };
    const Model = MODELS[kind];
    if (!Model) return next(errorHandler(400, 'Unknown contact kind'));

    const record = await Model.findById(id).lean();
    if (!record) return next(errorHandler(404, 'Contact not found'));

    const [documents, activity] = await Promise.all([
      Document.find({ 'related.clientId': id }).select('-path').lean(),
      ActivityLog.find({ entityId: id }).limit(5000).lean(),
    ]);

    logFromRequest(req, {
      entityType: kind === 'client' ? 'client' : 'owner',
      entityId: id,
      action: 'data.exported',
      message: `Exported all data held about this ${kind}`,
    });

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${kind}-export-${id}-${new Date().toISOString().slice(0, 10)}.json"`
    );
    res.send(JSON.stringify({
      exportedAt: new Date().toISOString(),
      exportedBy: String(req.user.id),
      subject: { kind, id: String(id) },
      record: clean(record),
      documents: documents.map(clean),
      activity: activity.map(clean),
    }, null, 2));
  } catch (err) {
    next(err);
  }
};

/**
 * The $set that removes a team member's personal details.
 *
 * Shared by admin erasure and self-service account deletion, so the two cannot
 * drift. Every personal field on the model, by its real name: Mongoose drops
 * unknown $set keys silently under strict mode, so a wrong name here does not
 * fail — it just leaves the data in place.
 */
export const erasedUserFields = (id) => ({
  // Both unique per workspace ({tenantId, username}, {tenantId, email}), so
  // each carries the full id: a constant made every erasure after the first
  // in a workspace fail with a duplicate-key error, leaving the data in place.
  username: `Former team member ${String(id)}`,
  email: `redacted-${String(id)}@removed.invalid`,
  // null, not '': the phone index is partial on strings, so '' would collide
  // across erased users the same way.
  phone: null,
  avatar: '',
  firstName: '',
  lastName: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
  country: '',
  company: '',
  website: '',
  bio: '',
});

/**
 * Erase a team member's personal details.
 *
 * The account is closed and every session ends. What they created stays, now
 * attributed to an anonymised account — the agency's audit trail has to remain
 * intact and internally consistent, and a trail with a dangling author is
 * worse than one naming "Former team member".
 */
export const eraseUser = async (req, res, next) => {
  try {
    const targetId = req.params.id;

    if (String(targetId) === String(req.user.id)) {
      return next(errorHandler(400, 'Ask another admin to erase your own account'));
    }

    const user = await inHomeTenant(req, () => User.findById(targetId));
    if (!user) return next(errorHandler(404, 'User not found'));
    if (user.isPlatformAdmin) return next(errorHandler(403, 'A platform operator cannot be erased from here'));

    const originalEmail = user.email;

    await inHomeTenant(req, () =>
      User.updateOne(
        { _id: targetId },
        {
          $set: {
            ...erasedUserFields(targetId),
            status: 'inactive',
            isDeleted: true,
            deletedAt: new Date(),
            deletedBy: req.user.id,
            erasedAt: new Date(),
            refreshTokens: [],
          },
        }
      )
    );

    // Their own notifications are personal to them and serve no further purpose.
    await Notification.deleteMany({ user: targetId });

    // Security logs key on the email address, which no longer identifies them.
    await inHomeTenant(req, () =>
      SecurityLog.updateMany({ email: originalEmail }, { $set: { email: erasedUserFields(targetId).email } })
    );

    logFromRequest(req, {
      entityType: 'user',
      entityId: targetId,
      action: 'data.erased',
      message: 'Erased a team member’s personal details',
      meta: { retained: 'records they created, now anonymised' },
    });

    res.json({
      success: true,
      message: 'Personal details erased. Records they created remain, anonymised.',
    });
  } catch (err) {
    next(err);
  }
};

/**
 * What erasing each kind of contact clears. Every key must be a real path on
 * its model — tests/erasureFields.test.js checks, because an unknown $set key
 * is dropped without an error and the data it meant to remove stays.
 */
export const ERASABLE_CONTACTS = {
  client: {
    Model: Client,
    fields: {
      name: 'Erased contact',
      email: '',
      phone: '',
      alternatePhone: '',
      organization: '',
      requirements: '',
      preferredLocations: [],
      tags: [],
      notes: '',
      communications: [],
      followUps: [],
      photos: [],
    },
  },
  owner: {
    Model: Owner,
    fields: {
      name: 'Erased owner',
      email: '',
      phone: '',
      companyName: '',
      addressLine1: '',
      addressLine2: '',
      city: '',
      state: '',
      postalCode: '',
      taxId: '',
      notes: '',
    },
  },
  buyer: {
    Model: BuyerRequirement,
    fields: { buyerName: 'Erased buyer', buyerEmail: '', buyerPhone: '', notes: '', additionalRequirements: '' },
  },
};


/**
 * Erase a contact.
 *
 * Unlike a team member, there is no authorship to preserve — so the personal
 * details go, and what is left is a shell that keeps counts and pipeline
 * history correct without identifying anyone.
 */
export const eraseContact = async (req, res, next) => {
  try {
    const { kind, id } = req.params;

    const spec = ERASABLE_CONTACTS[kind];
    if (!spec) return next(errorHandler(400, 'Unknown contact kind'));

    const record = await spec.Model.findById(id);
    if (!record) return next(errorHandler(404, 'Contact not found'));

    await spec.Model.updateOne(
      { _id: id },
      { $set: { ...spec.fields, erasedAt: new Date(), erasedBy: req.user.id } }
    );

    // Documents about them are their personal data too, so they go with it.
    const docFilter = kind === 'client' ? { 'related.clientId': id } : { 'related.kind': kind, 'related.clientId': id };
    await Document.updateMany(docFilter, {
      $set: { isDeleted: true, deletedAt: new Date(), deletedBy: req.user.id, isPublic: false },
    });

    logFromRequest(req, {
      entityType: kind === 'client' ? 'client' : 'owner',
      entityId: id,
      action: 'data.erased',
      message: `Erased personal details of a ${kind}`,
    });

    res.json({ success: true, message: 'Personal details erased. Reporting totals are unaffected.' });
  } catch (err) {
    next(err);
  }
};

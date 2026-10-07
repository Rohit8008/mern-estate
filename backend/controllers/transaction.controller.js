import mongoose from 'mongoose';
import Transaction from '../models/transaction.model.js';
import Listing from '../models/listing.model.js';
import Client from '../models/client.model.js';
import { errorHandler } from '../utils/error.js';
import { logActivity } from '../utils/activity.js';
import { parsePaging, parseSort } from '../utils/listQuery.js';
import { containsInsensitive } from '../utils/escapeRegex.js';
import { listingScope } from '../middleware/permissions.js';

/**
 * A transaction pushes side effects onto the listing it names (status -> sold /
 * rented) and the client it names (a closed_won deal). Those ids come from the
 * request body, so the caller must be able to see both: otherwise any employee
 * could flip a colleague's listing to sold or write a deal onto a lead they do
 * not own. Throws 403 when either is out of scope; skips ids that are absent.
 */
export async function assertCanReference(user, { property, client }) {
  if (property) {
    const ok = await Listing.exists({ _id: property, ...listingScope(user) });
    if (!ok) throw errorHandler(403, 'You do not have access to that property');
  }
  if (client) {
    const scope = user.role === 'admin' ? {} : { assignedTo: user.id };
    const ok = await Client.exists({ _id: client, isDeleted: { $ne: true }, ...scope });
    if (!ok) throw errorHandler(403, 'You do not have access to that client');
  }
}

// When a transaction completes, push a closed_won deal to the linked client.
// Skipped if the transaction already has a dealRef (deal created this transaction).
async function syncDealFromTransaction(tx) {
  if (!tx.client || tx.dealRef) return;
  const client = await Client.findById(tx.client);
  if (!client) return;

  // Don't duplicate — check if a deal already links back to this transaction
  const exists = client.deals.some(d => String(d.transactionRef) === String(tx._id));
  if (exists) return;

  client.deals.push({
    listingId: tx.property || null,
    stage: 'closed_won',
    value: tx.amount,
    type: tx.type || 'sale',
    commission: {
      percentage: tx.commissionPercent || 0,
      amount: tx.commission || 0,
      status: tx.status === 'completed' ? 'paid' : 'pending',
    },
    notes: 'Auto-created from transaction',
    transactionRef: tx._id,
    coAgentRef: tx.coAgent || null,
    coAgentName: tx.coAgentName || '',
    coAgentCommission: tx.coAgentCommission || 0,
    coAgentCommissionPercent: tx.coAgentCommissionPercent || 0,
    stageHistory: [{ stage: 'closed_won', changedAt: new Date(), changedBy: tx.agent }],
  });
  if (client.status !== 'won') {
    client.status = 'won';
    client.convertedAt = new Date();
  }
  await client.save();

  const newDeal = client.deals[client.deals.length - 1];
  await Transaction.findByIdAndUpdate(tx._id, { dealRef: newDeal._id });
}

async function syncListingStatus(propertyId, type, status) {
  if (!propertyId) return;
  let listingStatus;
  if (type === 'sale') {
    listingStatus =
      status === 'completed'                            ? 'sold'               :
      status === 'pending' || status === 'in_progress' ? 'under_negotiation'  :
      /* cancelled */                                     'available';
  } else {
    // rent / lease
    listingStatus =
      status === 'completed'                            ? 'rented'             :
      status === 'pending' || status === 'in_progress' ? 'under_negotiation'  :
      /* cancelled */                                     'available';
  }
  await Listing.findByIdAndUpdate(propertyId, { status: listingStatus });
}

/** Columns the Transactions table can sort by — see parseSort. */
const TRANSACTION_SORTS = {
  date: 'date',
  amount: 'amount',
  status: 'status',
  type: 'type',
  property: 'propertyName',
  client: 'clientName',
  createdAt: 'createdAt',
};

export const listTransactions = async (req, res, next) => {
  try {
    const { q, status, type } = req.query;
    const { page, limit, skip } = parsePaging(req.query);
    const sort = parseSort(req.query.sort, TRANSACTION_SORTS, { date: -1, createdAt: -1 });
    const filter = { isDeleted: { $ne: true } };

    if (q) {
      const rx = containsInsensitive(q);
      filter.$or = [{ propertyName: rx }, { clientName: rx }];
    }
    if (status) filter.status = status;
    if (type) filter.type = type;

    if (req.user.role !== 'admin') {
      filter.agent = req.user.id;
    }

    const [items, total] = await Promise.all([
      Transaction.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      Transaction.countDocuments(filter),
    ]);

    res.json({ success: true, data: items, page, limit, total });
  } catch (err) {
    next(err);
  }
};

export const createTransaction = async (req, res, next) => {
  try {
    const body = req.body;
    await assertCanReference(req.user, { property: body.property, client: body.client });
    const doc = await Transaction.create({
      property: body.property || null,
      propertyName: body.propertyName,
      client: body.client || null,
      clientName: body.clientName,
      type: body.type || 'sale',
      amount: body.amount,
      commissionPercent: body.commissionPercent || 0,
      commission: body.commission || 0,
      status: body.status || 'pending',
      date: body.date || new Date(),
      notes: body.notes || '',
      agent: req.user.id,
      coAgent: body.coAgent || null,
      coAgentName: body.coAgentName || '',
      coAgentCommissionPercent: body.coAgentCommissionPercent || 0,
      coAgentCommission: body.coAgentCommission || 0,
    });

    await syncListingStatus(doc.property, doc.type, doc.status);
    if (doc.status === 'completed') await syncDealFromTransaction(doc);

    try {
      await logActivity({
        entityType: 'transaction',
        entityId: doc._id,
        action: 'transaction_created',
        message: `Transaction created: ${doc.propertyName} — ${doc.clientName}`,
        meta: { type: doc.type, amount: doc.amount, status: doc.status },
        createdBy: req.user.id,
      });
    } catch (_) {}

    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
};

export const updateTransaction = async (req, res, next) => {
  try {
    // Atomic: ownership check and write in one query — eliminates TOCTOU race
    const ownershipFilter = req.user.role === 'admin'
      ? { _id: req.params.id, isDeleted: { $ne: true } }
      : { _id: req.params.id, isDeleted: { $ne: true }, agent: req.user.id };

    // Strip fields the client must never overwrite
    const { dealRef: _dr, agent: _ag, isDeleted: _id, ...safeBody } = req.body;

    await assertCanReference(req.user, { property: safeBody.property, client: safeBody.client });

    // Fetch pre-update state so we can revert the old listing if property changes
    const pre = await Transaction.findOne(ownershipFilter).select('property').lean();
    if (!pre) return next(errorHandler(404, 'Transaction not found or access denied'));

    const updated = await Transaction.findOneAndUpdate(
      ownershipFilter,
      { $set: safeBody },
      { new: true, runValidators: true },
    );
    if (!updated) return next(errorHandler(404, 'Transaction not found or access denied'));

    // Revert old listing only if no other active transaction still references it
    if (pre.property && String(pre.property) !== String(updated.property)) {
      const otherActive = await Transaction.exists({
        property: pre.property,
        _id: { $ne: updated._id },
        status: { $in: ['pending', 'in_progress', 'completed'] },
        isDeleted: { $ne: true },
      });
      if (!otherActive) {
        await Listing.findByIdAndUpdate(pre.property, { status: 'available' });
      }
    }

    await syncListingStatus(updated.property, updated.type, updated.status);
    if (updated.status === 'completed') await syncDealFromTransaction(updated);

    try {
      await logActivity({
        entityType: 'transaction',
        entityId: updated._id,
        action: 'transaction_updated',
        message: `Transaction updated: ${updated.propertyName}`,
        meta: { status: updated.status, amount: updated.amount },
        createdBy: req.user.id,
      });
    } catch (_) {}

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
};

export const deleteTransaction = async (req, res, next) => {
  try {
    const doc = await Transaction.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!doc) return next(errorHandler(404, 'Transaction not found'));
    if (req.user.role !== 'admin' && String(doc.agent) !== req.user.id) {
      return next(errorHandler(403, "You don't have permission to do that."));
    }

    await Transaction.findByIdAndUpdate(req.params.id, {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: req.user.id,
    });

    // Revert listing only if no other active transaction still references it
    if (doc.property && doc.status !== 'cancelled') {
      const otherActive = await Transaction.exists({
        property: doc.property,
        _id: { $ne: doc._id },
        status: { $in: ['pending', 'in_progress', 'completed'] },
        isDeleted: { $ne: true },
      });
      if (!otherActive) {
        await Listing.findByIdAndUpdate(doc.property, { status: 'available' });
      }
    }

    try {
      await logActivity({
        entityType: 'transaction',
        entityId: doc._id,
        action: 'transaction_deleted',
        message: `Transaction deleted: ${doc.propertyName}`,
        meta: {},
        createdBy: req.user.id,
      });
    } catch (_) {}

    res.json({ success: true, message: 'Transaction deleted' });
  } catch (err) {
    next(err);
  }
};

export const getStats = async (req, res, next) => {
  try {
    const match = { isDeleted: { $ne: true } };
    if (req.user.role !== 'admin') match.agent = new mongoose.Types.ObjectId(req.user.id);

    const [result] = await Transaction.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          // Open deals only; completed ones used to be counted as "pipeline".
          totalPipeline:   { $sum: { $cond: [{ $in: ['$status', ['pending', 'in_progress']] }, '$amount', 0] } },
          totalCommission: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$commission', 0] } },
          completed:       { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          pending:         { $sum: { $cond: [{ $in: ['$status', ['pending', 'in_progress']] }, 1, 0] } },
        },
      },
    ]);

    res.json({ success: true, data: result || { totalPipeline: 0, totalCommission: 0, completed: 0, pending: 0 } });
  } catch (err) {
    next(err);
  }
};

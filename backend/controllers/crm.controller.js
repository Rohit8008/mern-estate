/**
 * CRM Controller
 *
 * Handles deal pipeline, follow-ups, and communication history
 * for client relationship management.
 */

import mongoose from 'mongoose';
import Client from '../models/client.model.js';
import Transaction from '../models/transaction.model.js';
import Listing from '../models/listing.model.js';
import { errorHandler, AppError, NotFoundError } from '../utils/error.js';
import { logger } from '../utils/logger.js';
import { logActivity } from '../utils/activity.js';

// ─── helpers ───────────────────────────────────────────────────────────────

/** Find a non-deleted client; returns null if missing or soft-deleted. */
const findActiveClient = (id) =>
  Client.findOne({ _id: id, isDeleted: { $ne: true } });

/** Throw 403 if the requesting user is neither admin nor the assignee. */
const assertCanAccessClient = (client, user) => {
  if (user.role !== 'admin' && String(client.assignedTo) !== user.id) {
    throw new AppError('Not authorized to access this client', 403);
  }
};

// ============= DEAL MANAGEMENT =============

/**
 * Add a new deal to a client
 * POST /api/crm/:id/deals
 */
export const addDeal = async (req, res, next) => {
  try {
    const { id } = req.params;
    const client = await findActiveClient(id);

    if (!client) {
      return next(new NotFoundError('Client not found'));
    }

    assertCanAccessClient(client, req.user);

    const deal = {
      listingId: req.body.listingId,
      stage: req.body.stage || 'new_lead',
      value: req.body.value || 0,
      expectedCloseDate: req.body.expectedCloseDate,
      notes: req.body.notes || '',
      commission: {
        percentage: req.body.commissionPercentage || 0,
        amount: 0,
        status: 'pending',
      },
      stageHistory: [{
        stage: req.body.stage || 'new_lead',
        changedAt: new Date(),
        changedBy: req.user.id,
        notes: 'Deal created',
      }],
    };

    // Calculate commission amount
    if (deal.commission.percentage > 0 && deal.value > 0) {
      deal.commission.amount = (deal.value * deal.commission.percentage) / 100;
    }

    client.deals.push(deal);
    await client.save();

    try {
      await logActivity({
        entityType: 'client',
        entityId: client._id,
        action: 'deal_created',
        message: `Deal created in stage ${deal.stage}`,
        meta: { dealId: client.deals[client.deals.length - 1]._id, stage: deal.stage, value: deal.value },
        createdBy: req.user.id,
      });
    } catch (_) {}

    logger.info('Deal added', { clientId: id, dealId: client.deals[client.deals.length - 1]._id });

    res.status(201).json({
      success: true,
      message: 'Deal added successfully',
      data: client,
    });
  } catch (error) {
    next(error);
  }
};

export const getFollowUpsRange = async (req, res, next) => {
  try {
    const { from, to, includeCompleted } = req.query;
    if (!from || !to) {
      return next(errorHandler(400, 'from and to are required'));
    }

    const start = new Date(String(from));
    const end = new Date(String(to));

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return next(errorHandler(400, 'Invalid date format for from/to'));
    }

    const includeAll = String(includeCompleted || '').toLowerCase() === 'true';
    const followUpMatch = includeAll
      ? { dueAt: { $gte: start, $lte: end } }
      : { completed: false, dueAt: { $gte: start, $lte: end } };

    const matchStage = {
      isDeleted: { $ne: true },
      followUps: { $elemMatch: followUpMatch },
    };

    if (req.user.role !== 'admin') {
      matchStage.assignedTo = req.user.id;
    }

    const clients = await Client.find(matchStage)
      .select('name email phone followUps assignedTo')
      .populate('assignedTo', 'username email')
      .lean();

    const items = [];
    clients.forEach((c) => {
      (c.followUps || [])
        .filter((f) => {
          const due = new Date(f.dueAt);
          if (due < start || due > end) return false;
          if (!String(includeCompleted || '').toLowerCase().includes('true') && f.completed) return false;
          return true;
        })
        .forEach((f) => {
          items.push({
            clientId: c._id,
            clientName: c.name,
            assignedTo: c.assignedTo,
            followUpId: f._id,
            dueAt: f.dueAt,
            type: f.type,
            notes: f.notes,
            completed: !!f.completed,
            completedAt: f.completedAt || null,
          });
        });
    });

    items.sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));

    res.json({
      success: true,
      data: {
        total: items.length,
        items,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Update deal stage
 * PATCH /api/crm/:id/deals/:dealId/stage
 */
export const updateDealStage = async (req, res, next) => {
  try {
    const { id, dealId } = req.params;
    const { stage, notes } = req.body;

    const client = await findActiveClient(id);
    if (!client) {
      return next(new NotFoundError('Client not found'));
    }

    assertCanAccessClient(client, req.user);

    const deal = client.deals.id(dealId);
    if (!deal) {
      return next(new NotFoundError('Deal not found'));
    }

    const prevStage = deal.stage;

    // Add to stage history
    deal.stageHistory.push({
      stage,
      changedAt: new Date(),
      changedBy: req.user.id,
      notes: notes || '',
    });

    deal.stage = stage;

    // Update client status based on deal stage
    let newTxId = null;
    let prevListingStatus = 'available';
    if (stage === 'closed_won') {
      client.status = 'won';
      client.convertedAt = new Date();

      // Auto-create a transaction if not already linked
      if (!deal.transactionRef) {
        // Resolve property name and listing status from deal type
        let propertyName = client.name + ' — Property';
        const dealType = deal.type || 'sale';
        const listingStatus = (dealType === 'rent' || dealType === 'lease') ? 'rented' : 'sold';

        if (deal.listingId) {
          const listing = await Listing.findById(deal.listingId).select('name status').lean();
          if (listing?.name) propertyName = listing.name;
          if (listing?.status) prevListingStatus = listing.status;
        }

        const tx = await Transaction.create({
          property: deal.listingId || null,
          propertyName,
          client: client._id,
          clientName: client.name,
          type: dealType,
          amount: deal.value,
          commissionPercent: deal.commission?.percentage || 0,
          commission: deal.commission?.amount || 0,
          status: 'completed',
          date: new Date(),
          notes: 'Auto-created from sales pipeline',
          agent: req.user.id,
          dealRef: deal._id,
        });

        deal.transactionRef = tx._id;
        newTxId = tx._id;

        if (deal.listingId) {
          await Listing.findByIdAndUpdate(deal.listingId, { status: listingStatus });
        }
      }
    } else if (stage === 'closed_lost') {
      client.status = 'lost';
      client.lostAt = new Date();
      client.lostReason = notes || 'Deal lost';
    }

    // Persist all deal/client changes; roll back auto-created transaction and listing on failure
    try {
      await client.save();
    } catch (saveErr) {
      if (newTxId) {
        await Transaction.findByIdAndUpdate(newTxId, {
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: req.user.id,
        });
        if (deal.listingId) {
          await Listing.findByIdAndUpdate(deal.listingId, { status: prevListingStatus });
        }
      }
      throw saveErr;
    }

    try {
      await logActivity({
        entityType: 'client',
        entityId: client._id,
        action: 'deal_stage_updated',
        message: `Deal stage moved from ${prevStage} to ${stage}`,
        meta: { dealId, from: prevStage, to: stage, notes: notes || '' },
        createdBy: req.user.id,
      });
    } catch (_) {}

    logger.info('Deal stage updated', { clientId: id, dealId, newStage: stage });

    res.json({
      success: true,
      message: 'Deal stage updated',
      data: client,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update deal commission
 * PATCH /api/crm/:id/deals/:dealId/commission
 */
export const updateCommission = async (req, res, next) => {
  try {
    const { id, dealId } = req.params;
    const { percentage, status } = req.body;

    const client = await findActiveClient(id);
    if (!client) {
      return next(new NotFoundError('Client not found'));
    }

    assertCanAccessClient(client, req.user);

    const deal = client.deals.id(dealId);
    if (!deal) {
      return next(new NotFoundError('Deal not found'));
    }

    if (percentage !== undefined) {
      deal.commission.percentage = percentage;
      deal.commission.amount = (deal.value * percentage) / 100;
    }

    if (status) {
      deal.commission.status = status;
    }

    await client.save();

    try {
      await logActivity({
        entityType: 'client',
        entityId: client._id,
        action: 'deal_commission_updated',
        message: 'Deal commission updated',
        meta: { dealId, commission: deal.commission },
        createdBy: req.user.id,
      });
    } catch (_) {}

    logger.info('Commission updated', { clientId: id, dealId, commission: deal.commission });

    res.json({
      success: true,
      message: 'Commission updated',
      data: deal,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get deal pipeline summary
 * GET /api/crm/pipeline
 */
export const getPipeline = async (req, res, next) => {
  try {
    const matchStage = { isDeleted: { $ne: true } };

    // Filter by assigned user unless admin.
    // Must use ObjectId in aggregation — Mongoose doesn't auto-cast in $match.
    if (req.user.role !== 'admin') {
      matchStage.assignedTo = new mongoose.Types.ObjectId(req.user.id);
    }

    // Map client status → pipeline stage for clients who have no deals yet
    const STATUS_TO_STAGE = {
      lead: 'new_lead',
      contacted: 'contacted',
      qualified: 'qualified',
      proposal: 'negotiation',
      negotiation: 'negotiation',
      won: 'closed_won',
      lost: 'closed_lost',
    };

    const [withDealsResult, withoutDealsResult] = await Promise.allSettled([
      // Clients that have at least one deal — group by deal stage
      Client.aggregate([
        { $match: { ...matchStage, 'deals.0': { $exists: true } } },
        { $unwind: '$deals' },
        {
          $group: {
            _id: '$deals.stage',
            count: { $sum: 1 },
            totalValue: { $sum: '$deals.value' },
            deals: {
              $push: {
                clientId: '$_id',
                clientName: '$name',
                dealId: '$deals._id',
                value: '$deals.value',
                expectedCloseDate: '$deals.expectedCloseDate',
              },
            },
          },
        },
      ]),
      // Clients with no deals at all — show by their CRM status
      Client.aggregate([
        {
          $match: {
            ...matchStage,
            $or: [{ deals: { $exists: false } }, { deals: { $size: 0 } }],
          },
        },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            deals: {
              $push: {
                clientId: '$_id',
                clientName: '$name',
                dealId: null,
                value: 0,
                expectedCloseDate: null,
              },
            },
          },
        },
      ]),
    ]);

    const withDeals = withDealsResult.status === 'fulfilled' ? withDealsResult.value : [];
    const withoutDeals = withoutDealsResult.status === 'fulfilled' ? withoutDealsResult.value : [];

    // Build stage map from clients-with-deals
    const stageMap = new Map();
    for (const group of withDeals) {
      stageMap.set(group._id, {
        _id: group._id,
        count: group.count,
        totalValue: group.totalValue,
        deals: group.deals,
      });
    }

    // Merge clients-without-deals into their status-mapped stage
    for (const group of withoutDeals) {
      const stage = STATUS_TO_STAGE[group._id];
      if (!stage) continue; // skip null/undefined/legacy statuses — don't inflate new_lead
      if (!stageMap.has(stage)) {
        stageMap.set(stage, { _id: stage, count: 0, totalValue: 0, deals: [] });
      }
      const existing = stageMap.get(stage);
      existing.count += group.count;
      existing.deals.push(...group.deals);
      stageMap.set(stage, existing);
    }

    // Define stage order
    const stageOrder = [
      'new_lead',
      'contacted',
      'qualified',
      'site_visit_scheduled',
      'negotiation',
      'booking_token',
      'documentation',
      'closed_won',
      'closed_lost',
      // Legacy stages (keep for backward compatibility)
      'initial_contact',
      'site_visit_done',
      'payment_pending',
    ];

    const sortedPipeline = stageOrder.map(stage =>
      stageMap.get(stage) || { _id: stage, count: 0, totalValue: 0, deals: [] }
    );

    res.json({
      success: true,
      data: sortedPipeline,
    });
  } catch (error) {
    next(error);
  }
};

// ============= FOLLOW-UP MANAGEMENT =============

/**
 * Add a follow-up to a client
 * POST /api/crm/:id/follow-ups
 */
export const addFollowUp = async (req, res, next) => {
  try {
    const { id } = req.params;
    const client = await findActiveClient(id);

    if (!client) {
      return next(new NotFoundError('Client not found'));
    }

    assertCanAccessClient(client, req.user);

    const followUp = {
      dueAt: req.body.dueAt,
      type: req.body.type || 'call',
      notes: req.body.notes || '',
      createdBy: req.user.id,
    };

    client.followUps.push(followUp);
    await client.save();

    try {
      await logActivity({
        entityType: 'client',
        entityId: client._id,
        action: 'followup_created',
        message: `Follow-up scheduled (${followUp.type})`,
        meta: { followUpId: client.followUps[client.followUps.length - 1]._id, dueAt: followUp.dueAt, type: followUp.type },
        createdBy: req.user.id,
      });
    } catch (_) {}

    logger.info('Follow-up added', { clientId: id, dueAt: followUp.dueAt });

    res.status(201).json({
      success: true,
      message: 'Follow-up scheduled',
      data: client,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Complete a follow-up
 * PATCH /api/crm/:id/follow-ups/:followUpId/complete
 */
export const completeFollowUp = async (req, res, next) => {
  try {
    const { id, followUpId } = req.params;
    const { notes, outcome } = req.body;

    const client = await findActiveClient(id);
    if (!client) {
      return next(new NotFoundError('Client not found'));
    }

    assertCanAccessClient(client, req.user);

    const followUp = client.followUps.id(followUpId);
    if (!followUp) {
      return next(new NotFoundError('Follow-up not found'));
    }

    followUp.completed = true;
    followUp.completedAt = new Date();
    if (notes) followUp.notes = notes;

    // Update last contact
    client.lastContactAt = new Date();

    // Optionally add a communication log entry
    if (outcome) {
      client.communications.push({
        type: followUp.type,
        direction: 'outbound',
        summary: `Follow-up completed: ${outcome}`,
        details: notes || '',
        createdBy: req.user.id,
      });
    }

    await client.save();

    try {
      await logActivity({
        entityType: 'client',
        entityId: client._id,
        action: 'followup_completed',
        message: `Follow-up completed (${followUp.type})`,
        meta: { followUpId, outcome: outcome || '', notes: notes || '' },
        createdBy: req.user.id,
      });
    } catch (_) {}

    logger.info('Follow-up completed', { clientId: id, followUpId });

    res.json({
      success: true,
      message: 'Follow-up completed',
      data: client,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get upcoming follow-ups
 * GET /api/crm/follow-ups/upcoming
 */
export const getUpcomingFollowUps = async (req, res, next) => {
  try {
    const { days = 7 } = req.query;
    const endDate = new Date(Date.now() + Number(days) * 24 * 60 * 60 * 1000);
    const now = new Date();

    const matchStage = {
      isDeleted: { $ne: true },
      followUps: { $elemMatch: { completed: false, dueAt: { $lte: endDate } } },
    };

    // Filter by assigned user unless admin
    if (req.user.role !== 'admin') {
      matchStage.assignedTo = req.user.id;
    }

    const clients = await Client.find(matchStage)
      .select('name email phone followUps assignedTo')
      .populate('assignedTo', 'username email')
      .lean();

    // Flatten and filter follow-ups
    const followUps = [];
    clients.forEach(client => {
      client.followUps
        .filter(f => !f.completed && new Date(f.dueAt) <= endDate)
        .forEach(f => {
          const dueDate = new Date(f.dueAt);
          followUps.push({
            clientId: client._id,
            clientName: client.name,
            clientPhone: client.phone,
            clientEmail: client.email,
            assignedTo: client.assignedTo,
            followUpId: f._id,
            dueAt: f.dueAt,
            type: f.type,
            notes: f.notes,
            isOverdue: dueDate < now,
            isDueToday: dueDate.toDateString() === now.toDateString(),
          });
        });
    });

    // Sort by due date
    followUps.sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));

    res.json({
      success: true,
      data: {
        total: followUps.length,
        overdue: followUps.filter(f => f.isOverdue).length,
        dueToday: followUps.filter(f => f.isDueToday).length,
        followUps,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ============= COMMUNICATION MANAGEMENT =============

/**
 * Add a communication log entry
 * POST /api/crm/:id/communications
 */
export const addCommunication = async (req, res, next) => {
  try {
    const { id } = req.params;
    const client = await findActiveClient(id);

    if (!client) {
      return next(new NotFoundError('Client not found'));
    }

    assertCanAccessClient(client, req.user);

    const communication = {
      type: req.body.type,
      direction: req.body.direction || 'outbound',
      summary: req.body.summary,
      details: req.body.details || '',
      duration: req.body.duration,
      outcome: req.body.outcome || '',
      createdBy: req.user.id,
    };

    client.communications.push(communication);
    client.lastContactAt = new Date();

    // Recalculate lead score
    client.calculateScore();

    await client.save();

    try {
      await logActivity({
        entityType: 'client',
        entityId: client._id,
        action: 'communication_logged',
        message: `Communication logged: ${communication.type}`,
        meta: { type: communication.type, direction: communication.direction, summary: communication.summary },
        createdBy: req.user.id,
      });
    } catch (_) {}

    logger.info('Communication logged', { clientId: id, type: communication.type });

    res.status(201).json({
      success: true,
      message: 'Communication logged',
      data: client,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get communication history for a client
 * GET /api/crm/:id/communications
 */
export const getCommunications = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const client = await Client.findOne({ _id: id, isDeleted: { $ne: true } })
      .select('name communications assignedTo')
      .populate('communications.createdBy', 'username')
      .lean();

    if (!client) {
      return next(new NotFoundError('Client not found'));
    }

    assertCanAccessClient(client, req.user);

    // Sort by date descending and paginate
    const sorted = (client.communications || [])
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const paginated = sorted.slice(Number(offset), Number(offset) + Number(limit));

    res.json({
      success: true,
      data: {
        total: sorted.length,
        communications: paginated,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ============= ANALYTICS =============

/**
 * Get client analytics/summary
 * GET /api/crm/:id/summary
 */
export const getClientSummary = async (req, res, next) => {
  try {
    const { id } = req.params;

    const client = await Client.findOne({ _id: id, isDeleted: { $ne: true } })
      .populate('assignedTo', 'username email')
      .populate('interestedListings', 'name regularPrice address')
      .lean();

    if (!client) {
      return next(new NotFoundError('Client not found'));
    }

    assertCanAccessClient(client, req.user);

    // Calculate deal summary
    const deals = client.deals || [];
    const dealSummary = {
      total: deals.length,
      active: deals.filter(d => !['closed_won', 'closed_lost'].includes(d.stage)).length,
      won: deals.filter(d => d.stage === 'closed_won').length,
      lost: deals.filter(d => d.stage === 'closed_lost').length,
      totalValue: deals.reduce((sum, d) => sum + (d.value || 0), 0),
      wonValue: deals.filter(d => d.stage === 'closed_won').reduce((sum, d) => sum + (d.value || 0), 0),
      totalCommission: deals.filter(d => d.stage === 'closed_won').reduce((sum, d) => sum + (d.commission?.amount || 0), 0),
      pendingCommission: deals.filter(d => d.commission?.status === 'pending').reduce((sum, d) => sum + (d.commission?.amount || 0), 0),
    };

    // Calculate follow-up summary
    const followUps = client.followUps || [];
    const now = new Date();
    const followUpSummary = {
      total: followUps.length,
      pending: followUps.filter(f => !f.completed).length,
      completed: followUps.filter(f => f.completed).length,
      overdue: followUps.filter(f => !f.completed && new Date(f.dueAt) < now).length,
    };

    // Calculate communication summary
    const communications = client.communications || [];
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const commSummary = {
      total: communications.length,
      last30Days: communications.filter(c => new Date(c.createdAt) > thirtyDaysAgo).length,
      byType: communications.reduce((acc, c) => {
        acc[c.type] = (acc[c.type] || 0) + 1;
        return acc;
      }, {}),
    };

    res.json({
      success: true,
      data: {
        client: {
          _id: client._id,
          name: client.name,
          email: client.email,
          phone: client.phone,
          status: client.status,
          priority: client.priority,
          score: client.score,
          assignedTo: client.assignedTo,
          createdAt: client.createdAt,
          lastContactAt: client.lastContactAt,
        },
        deals: dealSummary,
        followUps: followUpSummary,
        communications: commSummary,
        interestedListings: client.interestedListings,
      },
    });
  } catch (error) {
    next(error);
  }
};

export default {
  addDeal,
  updateDealStage,
  updateCommission,
  getPipeline,
  addFollowUp,
  completeFollowUp,
  getUpcomingFollowUps,
  addCommunication,
  getCommunications,
  getClientSummary,
};

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
import { notify } from '../utils/notify.js';
import { logger } from '../utils/logger.js';
import { logActivity, diffFields } from '../utils/activity.js';
import { streamCsv } from '../utils/csvExport.js';
import { emitEvent } from '../utils/webhooks.js';
import { runHook } from '../plugins/registry.js';
import { stopSequencesForClient } from '../jobs/sequences.js';

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

    /*
     * Workspace rules may veto the move before anything is written — which is
     * where "ask for a reason before marking a deal lost" lives, as config
     * rather than a branch here.
     */
    await runHook('deal.beforeStageChange', {
      client: { id: String(client._id), name: client.name },
      dealId: String(dealId),
      fromStage: prevStage,
      toStage: stage,
      notes,
      user: req.user,
    });

    // Add to stage history
    deal.stageHistory.push({
      stage,
      changedAt: new Date(),
      changedBy: req.user.id,
      notes: notes || '',
    });

    deal.stage = stage;

    // A deal moving changes where this lead stands, so the score follows it.
    client.calculateScore();

    // Update client status based on deal stage
    let newTxId = null;
    let prevListingStatus = 'available';
    if (stage === 'closed_won') {
      client.status = 'won';
      client.convertedAt = new Date();

      // Stop any running sequence now rather than at the next tick — the gap
      // between "marked won" and "sent another chase email" is exactly the gap
      // a customer notices.
      stopSequencesForClient(client._id, 'deal won').catch(() => {});

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

      // Chasing someone who has already said no is the worst thing an
      // automation like this can do.
      stopSequencesForClient(client._id, 'deal lost').catch(() => {});
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

      // Also against the deal itself, so the deal has a readable history of its
      // own rather than only a line buried in the client's timeline.
      await logActivity({
        entityType: 'deal',
        entityId: deal._id,
        action: 'deal.stage_changed',
        message: `Moved from ${prevStage} to ${stage}`,
        meta: { clientId: String(client._id), notes: notes || '' },
        changes: { stage: { from: prevStage, to: stage } },
        createdBy: req.user.id,
      });
    } catch (_) {}

    // Tell the deal's owner it moved. Nothing did this before, so an agent
    // learned their deal had changed stage only by looking at the board.
    notify({
      to: client.assignedTo,
      actorId: req.user.id,
      type: 'deal.stage_changed',
      title: `Deal moved to ${String(stage).replace(/_/g, ' ')}`,
      body: `${client.name || 'Client'} — was ${String(prevStage).replace(/_/g, ' ')}.${notes ? ` ${notes}` : ''}`,
      link: '/pipeline',
      entity: { type: 'client', id: client._id },
    });

    emitEvent('deal.stage_changed', {
      clientId: String(client._id),
      clientName: client.name,
      dealId: String(dealId),
      from: prevStage,
      to: stage,
      value: deal.value || 0,
    });

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
/**
 * Export every deal in the pipeline, one row per deal.
 *
 * Deals are sub-documents of Client, so this unwinds them: a client with three
 * deals produces three rows, which is what anyone opening a pipeline export
 * expects to see.
 */
export const exportDeals = async (req, res, next) => {
  try {
    const match = { isDeleted: { $ne: true }, 'deals.0': { $exists: true } };
    if (req.user.role !== 'admin') {
      match.assignedTo = new mongoose.Types.ObjectId(req.user.id);
    }

    const cursor = Client.aggregate([
      { $match: match },
      { $unwind: '$deals' },
      { $lookup: { from: 'users', localField: 'assignedTo', foreignField: '_id', as: 'agent' } },
      { $unwind: { path: '$agent', preserveNullAndEmptyArrays: true } },
      { $sort: { 'deals.expectedCloseDate': 1 } },
      { $limit: 50000 },
    ]).cursor();

    await streamCsv(res, {
      filename: 'pipeline',
      headers: [
        'Client', 'Client email', 'Client phone', 'Deal stage', 'Deal type', 'Value',
        'Commission %', 'Commission amount', 'Commission status',
        'Expected close', 'Agent', 'Stage changes', 'Created',
      ],
      cursor,
      toRow: (row) => [
        row.name || '',
        row.email || '',
        row.phone || '',
        row.deals?.stage || '',
        row.deals?.type || '',
        row.deals?.value ?? 0,
        row.deals?.commission?.percentage ?? 0,
        row.deals?.commission?.amount ?? 0,
        row.deals?.commission?.status || '',
        row.deals?.expectedCloseDate,
        row.agent?.username || '',
        (row.deals?.stageHistory || []).length,
        row.deals?.createdAt || row.createdAt,
      ],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Where deals are getting stuck.
 *
 * `stageHistory` has been written on every stage change since the pipeline
 * shipped and was never read back, so nobody could answer "which stage is
 * slowing us down?" — the one question a pipeline report exists to answer.
 *
 * Time in a stage is the gap between consecutive history entries; the current
 * stage is measured from its last entry to now, which is what surfaces a deal
 * that has sat untouched.
 */
export const getPipelineBottlenecks = async (req, res, next) => {
  try {
    const match = { isDeleted: { $ne: true }, 'deals.0': { $exists: true } };
    if (req.user.role !== 'admin') {
      match.assignedTo = new mongoose.Types.ObjectId(req.user.id);
    }

    const clients = await Client.find(match).select('name deals assignedTo').lean();
    const now = Date.now();

    /** stage -> { totalMs, samples, openDeals, stalled } */
    const byStage = new Map();
    const stalledDeals = [];

    const record = (stage, ms, { open = false } = {}) => {
      if (!stage) return;
      const entry = byStage.get(stage) || { totalMs: 0, samples: 0, openDeals: 0, stalled: 0 };
      entry.totalMs += ms;
      entry.samples += 1;
      if (open) entry.openDeals += 1;
      byStage.set(stage, entry);
    };

    for (const client of clients) {
      for (const deal of client.deals || []) {
        const history = [...(deal.stageHistory || [])]
          .filter((h) => h?.changedAt)
          .sort((a, b) => new Date(a.changedAt) - new Date(b.changedAt));

        // Completed spells: each entry until the next one.
        for (let i = 0; i < history.length - 1; i += 1) {
          const ms = new Date(history[i + 1].changedAt) - new Date(history[i].changedAt);
          if (ms >= 0) record(history[i].stage, ms);
        }

        const closed = deal.stage === 'closed_won' || deal.stage === 'closed_lost';
        if (closed) continue;

        // The current spell, still running.
        const since = history.length
          ? new Date(history[history.length - 1].changedAt)
          : new Date(deal.createdAt || client.createdAt || now);

        const ms = now - since.getTime();
        record(deal.stage, ms, { open: true });

        const days = Math.floor(ms / 86_400_000);
        if (days >= 14) {
          stalledDeals.push({
            clientId: String(client._id),
            clientName: client.name,
            dealId: String(deal._id),
            stage: deal.stage,
            value: deal.value || 0,
            daysInStage: days,
          });
        }
      }
    }

    const stages = [...byStage.entries()]
      .map(([stage, e]) => ({
        stage,
        avgDays: Math.round((e.totalMs / e.samples / 86_400_000) * 10) / 10,
        samples: e.samples,
        openDeals: e.openDeals,
      }))
      .sort((a, b) => b.avgDays - a.avgDays);

    stalledDeals.sort((a, b) => b.daysInStage - a.daysInStage);

    res.json({
      success: true,
      data: {
        stages,
        // The slowest stage with enough data to mean something.
        bottleneck: stages.find((s) => s.samples >= 3) || stages[0] || null,
        stalledDeals: stalledDeals.slice(0, 50),
        stalledCount: stalledDeals.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

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
 * Correct a logged communication
 * PATCH /api/crm/:id/communications/:communicationId
 *
 * There was no way to change or remove one of these, so a call logged against
 * the wrong client, or with a typo in the summary, was permanent — and the lead
 * score is computed from them, so a mistake skewed the number for good.
 *
 * Only the person who logged it, or an admin, may amend it: a communication is
 * somebody's account of a conversation they had.
 */
export const updateCommunication = async (req, res, next) => {
  try {
    const { id, communicationId } = req.params;
    const client = await findActiveClient(id);
    if (!client) return next(new NotFoundError('Client not found'));

    assertCanAccessClient(client, req.user);

    const communication = client.communications.id(communicationId);
    if (!communication) return next(new NotFoundError('Communication not found'));

    if (req.user.role !== 'admin' && String(communication.createdBy) !== req.user.id) {
      return next(new AppError('You can only edit a communication you logged', 403));
    }

    const before = communication.toObject();
    for (const field of ['type', 'direction', 'summary', 'details', 'duration', 'outcome']) {
      if (field in req.body) communication[field] = req.body[field];
    }

    // The score is derived from these, so it has to be recomputed on an edit.
    client.calculateScore();
    await client.save();

    logActivity({
      entityType: 'client',
      entityId: client._id,
      action: 'communication_updated',
      message: `Communication amended: ${communication.type}`,
      meta: { communicationId },
      changes: diffFields(before, communication.toObject(), Object.keys(req.body || {})),
      createdBy: req.user.id,
    }).catch(() => {});

    res.json({ success: true, message: 'Communication updated', data: client });
  } catch (error) {
    next(error);
  }
};

/**
 * Remove a logged communication
 * DELETE /api/crm/:id/communications/:communicationId
 */
export const deleteCommunication = async (req, res, next) => {
  try {
    const { id, communicationId } = req.params;
    const client = await findActiveClient(id);
    if (!client) return next(new NotFoundError('Client not found'));

    assertCanAccessClient(client, req.user);

    const communication = client.communications.id(communicationId);
    if (!communication) return next(new NotFoundError('Communication not found'));

    if (req.user.role !== 'admin' && String(communication.createdBy) !== req.user.id) {
      return next(new AppError('You can only delete a communication you logged', 403));
    }

    const removed = communication.toObject();
    communication.deleteOne();

    // lastContactAt was derived from the most recent entry, so it has to follow
    // the deletion rather than keep pointing at a conversation that is gone.
    const remaining = (client.communications || [])
      .map((c) => c.createdAt)
      .filter(Boolean)
      .sort((a, b) => new Date(b) - new Date(a));
    client.lastContactAt = remaining[0] || null;

    client.calculateScore();
    await client.save();

    logActivity({
      entityType: 'client',
      entityId: client._id,
      action: 'communication_deleted',
      message: `Communication removed: ${removed.type}`,
      meta: { communicationId, summary: removed.summary },
      createdBy: req.user.id,
    }).catch(() => {});

    res.json({ success: true, message: 'Communication deleted', data: client });
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

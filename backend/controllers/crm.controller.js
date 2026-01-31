/**
 * CRM Controller
 *
 * Handles deal pipeline, follow-ups, and communication history
 * for client relationship management.
 */

import Client from '../models/client.model.js';
import { errorHandler, AppError, NotFoundError } from '../utils/error.js';
import { logger } from '../utils/logger.js';

// ============= DEAL MANAGEMENT =============

/**
 * Add a new deal to a client
 * POST /api/crm/:id/deals
 */
export const addDeal = async (req, res, next) => {
  try {
    const { id } = req.params;
    const client = await Client.findById(id);

    if (!client) {
      return next(new NotFoundError('Client not found'));
    }

    // Check authorization
    if (req.user.role !== 'admin' && String(client.assignedTo) !== req.user.id) {
      return next(new AppError('Not authorized to modify this client', 403));
    }

    const deal = {
      listingId: req.body.listingId,
      stage: req.body.stage || 'initial_contact',
      value: req.body.value || 0,
      expectedCloseDate: req.body.expectedCloseDate,
      notes: req.body.notes || '',
      commission: {
        percentage: req.body.commissionPercentage || 0,
        amount: 0,
        status: 'pending',
      },
      stageHistory: [{
        stage: req.body.stage || 'initial_contact',
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

/**
 * Update deal stage
 * PATCH /api/crm/:id/deals/:dealId/stage
 */
export const updateDealStage = async (req, res, next) => {
  try {
    const { id, dealId } = req.params;
    const { stage, notes } = req.body;

    const client = await Client.findById(id);
    if (!client) {
      return next(new NotFoundError('Client not found'));
    }

    const deal = client.deals.id(dealId);
    if (!deal) {
      return next(new NotFoundError('Deal not found'));
    }

    // Add to stage history
    deal.stageHistory.push({
      stage,
      changedAt: new Date(),
      changedBy: req.user.id,
      notes: notes || '',
    });

    deal.stage = stage;

    // Update client status based on deal stage
    if (stage === 'closed_won') {
      client.status = 'won';
      client.convertedAt = new Date();
    } else if (stage === 'closed_lost') {
      client.status = 'lost';
      client.lostAt = new Date();
      client.lostReason = notes || 'Deal lost';
    }

    await client.save();

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

    const client = await Client.findById(id);
    if (!client) {
      return next(new NotFoundError('Client not found'));
    }

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
    const matchStage = {};

    // Filter by assigned user unless admin
    if (req.user.role !== 'admin') {
      matchStage.assignedTo = req.user.id;
    }

    const pipeline = await Client.aggregate([
      { $match: matchStage },
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
      { $sort: { _id: 1 } },
    ]);

    // Define stage order
    const stageOrder = [
      'initial_contact',
      'site_visit_scheduled',
      'site_visit_done',
      'negotiation',
      'documentation',
      'payment_pending',
      'closed_won',
      'closed_lost',
    ];

    // Sort by stage order and add empty stages
    const sortedPipeline = stageOrder.map(stage => {
      const found = pipeline.find(p => p._id === stage);
      return found || { _id: stage, count: 0, totalValue: 0, deals: [] };
    });

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
    const client = await Client.findById(id);

    if (!client) {
      return next(new NotFoundError('Client not found'));
    }

    const followUp = {
      dueAt: req.body.dueAt,
      type: req.body.type || 'call',
      notes: req.body.notes || '',
      createdBy: req.user.id,
    };

    client.followUps.push(followUp);
    await client.save();

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

    const client = await Client.findById(id);
    if (!client) {
      return next(new NotFoundError('Client not found'));
    }

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
      'followUps.completed': false,
      'followUps.dueAt': { $lte: endDate },
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
    const client = await Client.findById(id);

    if (!client) {
      return next(new NotFoundError('Client not found'));
    }

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

    const client = await Client.findById(id)
      .select('name communications')
      .populate('communications.createdBy', 'username')
      .lean();

    if (!client) {
      return next(new NotFoundError('Client not found'));
    }

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

    const client = await Client.findById(id)
      .populate('assignedTo', 'username email')
      .populate('interestedListings', 'name regularPrice address')
      .lean();

    if (!client) {
      return next(new NotFoundError('Client not found'));
    }

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

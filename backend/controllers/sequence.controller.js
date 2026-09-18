import Sequence, { STEP_ACTIONS, STEP_ACTION_NAMES } from '../models/sequence.model.js';
import SequenceEnrollment from '../models/sequenceEnrollment.model.js';
import Client from '../models/client.model.js';
import { errorHandler } from '../utils/error.js';
import { logFromRequest } from '../utils/activity.js';

/** Keep only the fields a step is allowed to carry, and in a valid shape. */
function cleanSteps(steps) {
  if (!Array.isArray(steps)) return null;

  return steps
    .filter((step) => STEP_ACTION_NAMES.includes(step?.action))
    .map((step) => ({
      action: step.action,
      delayDays: Math.max(0, Math.min(365, Number(step.delayDays) || 0)),
      subject: String(step.subject || '').slice(0, 200),
      body: String(step.body || '').slice(0, 5000),
    }));
}

export const listSequences = async (req, res, next) => {
  try {
    const sequences = await Sequence.find({}).sort({ name: 1 }).lean();

    // Active enrollment counts, so the list shows which sequences are actually
    // in use without opening each one.
    const counts = await SequenceEnrollment.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: '$sequence', n: { $sum: 1 } } },
    ]);
    const byId = new Map(counts.map((c) => [String(c._id), c.n]));

    res.json({
      success: true,
      data: {
        sequences: sequences.map((s) => ({ ...s, activeEnrollments: byId.get(String(s._id)) || 0 })),
        actions: STEP_ACTIONS,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const createSequence = async (req, res, next) => {
  try {
    const { name, description, steps } = req.body || {};
    if (!name || !String(name).trim()) return next(errorHandler(400, 'Give the sequence a name'));

    const cleaned = cleanSteps(steps) || [];

    const sequence = await Sequence.create({
      name: String(name).trim(),
      description: String(description || '').slice(0, 500),
      steps: cleaned,
      createdBy: req.user.id,
    });

    logFromRequest(req, {
      entityType: 'user',
      entityId: req.user.id,
      action: 'sequence.created',
      message: `Created sequence "${sequence.name}"`,
    });

    res.status(201).json({ success: true, data: sequence });
  } catch (err) {
    next(err);
  }
};

export const updateSequence = async (req, res, next) => {
  try {
    const { name, description, steps, isActive } = req.body || {};
    const update = {};

    if (name && String(name).trim()) update.name = String(name).trim();
    if (typeof description === 'string') update.description = description.slice(0, 500);
    if (isActive !== undefined) update.isActive = Boolean(isActive);

    if (steps !== undefined) {
      const cleaned = cleanSteps(steps);
      if (!cleaned) return next(errorHandler(400, 'Steps must be a list'));
      update.steps = cleaned;
    }

    if (!Object.keys(update).length) return next(errorHandler(400, 'Nothing to update'));

    const sequence = await Sequence.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
    if (!sequence) return next(errorHandler(404, 'Sequence not found'));

    res.json({ success: true, data: sequence });
  } catch (err) {
    next(err);
  }
};

/**
 * Deleting a sequence stops its enrollments rather than leaving them pointing
 * at nothing — an orphaned enrollment would be picked up by the job and
 * silently stopped there, with no record of why.
 */
export const deleteSequence = async (req, res, next) => {
  try {
    const sequence = await Sequence.findById(req.params.id);
    if (!sequence) return next(errorHandler(404, 'Sequence not found'));

    const active = await SequenceEnrollment.countDocuments({ sequence: sequence._id, status: 'active' });

    if (active > 0 && req.query.force !== 'true') {
      return res.status(409).json({
        success: false,
        message: `${active} lead${active === 1 ? ' is' : 's are'} part-way through this sequence.`,
        data: { active, canForce: true },
      });
    }

    await SequenceEnrollment.updateMany(
      { sequence: sequence._id, status: 'active' },
      { $set: { status: 'stopped', stoppedReason: 'sequence deleted' } }
    );
    await sequence.deleteOne();

    res.json({ success: true, message: 'Sequence deleted' });
  } catch (err) {
    next(err);
  }
};

/** Put a lead onto a sequence. */
export const enrollClient = async (req, res, next) => {
  try {
    const { clientId } = req.body || {};

    const [sequence, client] = await Promise.all([
      Sequence.findById(req.params.id),
      Client.findOne({ _id: clientId, isDeleted: { $ne: true } }).select('assignedTo status name'),
    ]);

    if (!sequence) return next(errorHandler(404, 'Sequence not found'));
    if (!client) return next(errorHandler(404, 'Client not found'));
    if (!sequence.steps?.length) return next(errorHandler(400, 'That sequence has no steps yet'));

    // Same ownership rule as editing the lead.
    if (req.user.role !== 'admin' && String(client.assignedTo) !== req.user.id) {
      return next(errorHandler(403, 'Forbidden'));
    }

    if (['won', 'lost'].includes(client.status)) {
      return next(errorHandler(400, `This lead is already marked ${client.status}.`));
    }

    const firstDelay = sequence.steps[0]?.delayDays || 0;

    // Upsert: re-enrolling restarts rather than failing on the unique index,
    // which is what someone clicking "enroll" a second time means.
    const enrollment = await SequenceEnrollment.findOneAndUpdate(
      { sequence: sequence._id, client: client._id },
      {
        $set: {
          currentStep: 0,
          nextStepAt: new Date(Date.now() + firstDelay * 86400000),
          status: 'active',
          stoppedReason: '',
          history: [],
          enrolledBy: req.user.id,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    logFromRequest(req, {
      entityType: 'client',
      entityId: client._id,
      action: 'sequence.enrolled',
      message: `Enrolled in "${sequence.name}"`,
    });

    res.status(201).json({ success: true, data: enrollment });
  } catch (err) {
    next(err);
  }
};

export const unenrollClient = async (req, res, next) => {
  try {
    const result = await SequenceEnrollment.updateOne(
      { sequence: req.params.id, client: req.params.clientId, status: 'active' },
      { $set: { status: 'stopped', stoppedReason: 'removed by hand' } }
    );

    if (!result.matchedCount) return next(errorHandler(404, 'Not enrolled'));
    res.json({ success: true, message: 'Removed from the sequence' });
  } catch (err) {
    next(err);
  }
};

/** What this lead is on, and where it has got to. */
export const clientEnrollments = async (req, res, next) => {
  try {
    const enrollments = await SequenceEnrollment.find({ client: req.params.clientId })
      .populate('sequence', 'name steps isActive')
      .sort({ updatedAt: -1 })
      .lean();

    res.json({
      success: true,
      data: {
        enrollments: enrollments.map((e) => ({
          ...e,
          totalSteps: e.sequence?.steps?.length || 0,
          nextStep: e.sequence?.steps?.[e.currentStep] || null,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
};

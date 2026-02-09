import ActivityLog from '../models/activityLog.model.js';
import Client from '../models/client.model.js';
import Task from '../models/task.model.js';
import { errorHandler } from '../utils/error.js';

function canAccessEntity(reqUser, entityType, entity) {
  if (reqUser.role === 'admin') return true;
  if (!entity) return false;

  if (entityType === 'client') {
    return String(entity.assignedTo) === String(reqUser.id);
  }

  if (entityType === 'task') {
    return String(entity.assignedTo) === String(reqUser.id);
  }

  return false;
}

export const listActivity = async (req, res, next) => {
  try {
    const { entityType, entityId, limit = 50, offset = 0 } = req.query;
    if (!entityType || !entityId) {
      return next(errorHandler(400, 'entityType and entityId are required'));
    }

    const entityTypeNorm = String(entityType);
    if (!['client', 'task'].includes(entityTypeNorm)) {
      return next(errorHandler(400, 'Invalid entityType'));
    }

    const entityModel = entityTypeNorm === 'client' ? Client : Task;
    const entity = await entityModel.findById(entityId).select('assignedTo');
    if (!entity) return next(errorHandler(404, 'Entity not found'));
    if (!canAccessEntity(req.user, entityTypeNorm, entity)) return next(errorHandler(403, 'Forbidden'));

    const items = await ActivityLog.find({ entityType: entityTypeNorm, entityId })
      .sort({ createdAt: -1 })
      .skip(Number(offset))
      .limit(Number(limit))
      .populate('createdBy', 'username email')
      .lean();

    const total = await ActivityLog.countDocuments({ entityType: entityTypeNorm, entityId });

    res.json({ success: true, data: { total, items } });
  } catch (err) {
    next(err);
  }
};

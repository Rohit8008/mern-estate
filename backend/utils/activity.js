import ActivityLog from '../models/activityLog.model.js';

export async function logActivity({
  entityType,
  entityId,
  action,
  message = '',
  meta = {},
  createdBy,
}) {
  if (!entityType || !entityId || !action || !createdBy) return null;
  return ActivityLog.create({
    entityType,
    entityId,
    action,
    message,
    meta,
    createdBy,
  });
}

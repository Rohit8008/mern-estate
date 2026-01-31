import mongoose from 'mongoose';
import Listing from '../models/listing.model.js';
import Client from '../models/client.model.js';
import Task from '../models/task.model.js';
import User from '../models/user.model.js';
import { errorHandler } from '../utils/error.js';

function startOfDay(d = new Date()) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d = new Date()) { const x = new Date(d); x.setHours(23,59,59,999); return x; }

export const getAdminMetrics = async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return next(errorHandler(403, 'Admin only'));

    const now = new Date();
    const [totalListings, totalClients, totalTasks, teamCount] = await Promise.all([
      Listing.estimatedDocumentCount(),
      Client.estimatedDocumentCount(),
      Task.estimatedDocumentCount(),
      User.countDocuments({ role: { $in: ['employee'] } }),
    ]);

    const clientsByStatus = await Client.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $project: { status: '$_id', count: 1, _id: 0 } },
      { $sort: { status: 1 } }
    ]);

    const tasksDueToday = await Task.countDocuments({
      dueAt: { $gte: startOfDay(now), $lte: endOfDay(now) },
      status: { $ne: 'done' },
    });

    const tasksOverdue = await Task.countDocuments({
      dueAt: { $lt: startOfDay(now) },
      status: { $ne: 'done' },
    });

    // Top agents by client count (last 30 days)
    const since = new Date(now.getTime() - 30*24*60*60*1000);
    const topAgents = await Client.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: '$assignedTo', clients: { $sum: 1 } } },
      { $sort: { clients: -1 } },
      { $limit: 5 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $project: { _id: 0, userId: '$user._id', username: '$user.username', email: '$user.email', clients: 1 } }
    ]);

    res.json({
      success: true,
      data: {
        totals: { listings: totalListings, clients: totalClients, tasks: totalTasks, team: teamCount },
        clientsByStatus,
        tasks: { dueToday: tasksDueToday, overdue: tasksOverdue },
        topAgents,
      }
    });
  } catch (err) { next(err); }
};

export const getMyMetrics = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const now = new Date();

    const [myClients, myTasksTotal, myTasksDueToday, myTasksOverdue] = await Promise.all([
      Client.countDocuments({ assignedTo: userId }),
      Task.countDocuments({ assignedTo: userId }),
      Task.countDocuments({ assignedTo: userId, dueAt: { $gte: startOfDay(now), $lte: endOfDay(now) }, status: { $ne: 'done' } }),
      Task.countDocuments({ assignedTo: userId, dueAt: { $lt: startOfDay(now) }, status: { $ne: 'done' } }),
    ]);

    const myStatus = await Client.aggregate([
      { $match: { assignedTo: new mongoose.Types.ObjectId(userId) } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $project: { status: '$_id', count: 1, _id: 0 } },
      { $sort: { status: 1 } }
    ]);

    res.json({
      success: true,
      data: {
        my: { clients: myClients, tasks: myTasksTotal },
        myTasks: { dueToday: myTasksDueToday, overdue: myTasksOverdue },
        myClientsByStatus: myStatus,
      }
    });
  } catch (err) { next(err); }
};

import express from 'express';
import { verifyToken } from '../utils/verifyUser.js';
import { requirePermission } from '../middleware/permissions.js';
import { createTask, listTasks, getTaskById, updateTask, deleteTask } from '../controllers/task.controller.js';

const router = express.Router();

router.use(verifyToken);

// Use client permissions for now; could add dedicated task permissions later
router.get('/', requirePermission('viewClients'), listTasks);
router.post('/', requirePermission('viewClients'), createTask);
router.get('/:id', requirePermission('viewClients'), getTaskById);
router.patch('/:id', requirePermission('viewClients'), updateTask);
router.delete('/:id', requirePermission('viewClients'), deleteTask);

export default router;

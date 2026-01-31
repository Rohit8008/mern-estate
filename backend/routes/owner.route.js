import express from 'express';
import { verifyToken, requireAdmin } from '../utils/verifyUser.js';
import { requirePermission } from '../middleware/permissions.js';
import { createOwner, updateOwner, deleteOwner, getOwner, listOwners } from '../controllers/owner.controller.js';

const router = express.Router();

// Owner routes with permission-based access
router.get('/list', verifyToken, requirePermission('viewOwners'), listOwners);
router.get('/:id', verifyToken, requirePermission('viewOwners'), getOwner);
router.post('/', verifyToken, requirePermission('createOwner'), createOwner);
router.put('/:id', verifyToken, requirePermission('updateOwner'), updateOwner);
router.post('/:id', verifyToken, requirePermission('updateOwner'), updateOwner); // Keep POST for backward compatibility
router.delete('/:id', verifyToken, requirePermission('deleteOwner'), deleteOwner);

export default router;



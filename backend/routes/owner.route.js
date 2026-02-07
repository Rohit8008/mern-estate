import express from 'express';
import { verifyToken, requireAdmin } from '../utils/verifyUser.js';
import { requirePermission } from '../middleware/permissions.js';
import { createOwner, updateOwner, deleteOwner, getOwner, listOwners } from '../controllers/owner.controller.js';
import { validateBody, ownerValidation } from '../middleware/validation.js';

const router = express.Router();

// Owner routes with permission-based access
router.get('/list', verifyToken, requirePermission('viewOwners'), listOwners);
router.get('/:id', verifyToken, requirePermission('viewOwners'), getOwner);
router.post('/', verifyToken, requirePermission('createOwner'), validateBody(ownerValidation.create), createOwner);
router.put('/:id', verifyToken, requirePermission('updateOwner'), validateBody(ownerValidation.update), updateOwner);
router.post('/:id', verifyToken, requirePermission('updateOwner'), validateBody(ownerValidation.update), updateOwner); // Keep POST for backward compatibility
router.delete('/:id', verifyToken, requirePermission('deleteOwner'), deleteOwner);

export default router;



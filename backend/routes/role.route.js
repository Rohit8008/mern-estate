import express from 'express';
import { verifyToken, requireAdmin } from '../utils/verifyUser.js';
import { validateBody, roleValidation } from '../middleware/validation.js';
import {
  createRole,
  getRoles,
  getRole,
  updateRole,
  deleteRole,
  assignRoleToUser,
  removeRoleFromUser,
  getUsersByRole,
  getAvailablePermissions,
  initializeDefaultRoles
} from '../controllers/role.controller.js';

const router = express.Router();

// All routes require authentication and admin privileges
router.use(verifyToken);
router.use(requireAdmin);

// Role management routes
router.post('/', validateBody(roleValidation.create), createRole);
router.get('/', getRoles);
router.get('/permissions', getAvailablePermissions);
router.get('/initialize-defaults', initializeDefaultRoles);
router.get('/:id', getRole);
router.put('/:id', validateBody(roleValidation.update), updateRole);
router.delete('/:id', deleteRole);

// User role assignment routes
router.post('/assign', validateBody(roleValidation.assign), assignRoleToUser);
router.post('/remove', validateBody(roleValidation.remove), removeRoleFromUser);
router.get('/:id/users', getUsersByRole);

export default router;

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

/** Marks the old state-changing GET as deprecated for any client that looks. */
function deprecatedInitializeDefaults(req, res, next) {
  res.set('Deprecation', 'true');
  res.set('Link', '</api/roles/initialize-defaults>; rel="successor-version"; title="use POST"');
  next();
}

// All routes require authentication and admin privileges
router.use(verifyToken);
router.use(requireAdmin);

// Role management routes
router.post('/', validateBody(roleValidation.create), createRole);
router.get('/', getRoles);
router.get('/permissions', getAvailablePermissions);
// Creates the built-in roles that are missing. It writes, so POST is the real
// method; the GET stays only for older clients and is deprecated.
router.post('/initialize-defaults', validateBody(roleValidation.empty), initializeDefaultRoles);
router.get('/initialize-defaults', deprecatedInitializeDefaults, initializeDefaultRoles);
router.get('/:id', getRole);
router.put('/:id', validateBody(roleValidation.update), updateRole);
router.delete('/:id', deleteRole);

// User role assignment routes
router.post('/assign', validateBody(roleValidation.assign), assignRoleToUser);
router.post('/remove', validateBody(roleValidation.remove), removeRoleFromUser);
router.get('/:id/users', getUsersByRole);

export default router;

import express from 'express';
import {
  getAllPropertyTypes,
  getPropertyTypeBySlug,
  createPropertyType,
  updatePropertyType,
  deletePropertyType,
  seedDefaultPropertyTypes,
} from '../controllers/propertyType.controller.js';
import { verifyToken } from '../utils/verifyUser.js';
import { requirePermission } from '../middleware/permissions.js';
import { validateBody, propertyTypeValidation } from '../middleware/validation.js';

const router = express.Router();

// Property types described the public browse filters, which no longer exist.
// Behind a session, like everything else about the property book.
router.get('/list', verifyToken, getAllPropertyTypes);
router.get('/:slug', verifyToken, getPropertyTypeBySlug);
router.post('/create', verifyToken, requirePermission('systemSettings'), validateBody(propertyTypeValidation.create), createPropertyType);
router.put('/:id', verifyToken, requirePermission('systemSettings'), validateBody(propertyTypeValidation.update), updatePropertyType);
router.delete('/:id', verifyToken, requirePermission('systemSettings'), deletePropertyType);
router.post('/seed', verifyToken, requirePermission('systemSettings'), seedDefaultPropertyTypes);

export default router;

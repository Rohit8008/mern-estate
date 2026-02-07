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

router.get('/list', getAllPropertyTypes);
router.get('/:slug', getPropertyTypeBySlug);
router.post('/create', verifyToken, requirePermission('manage_settings'), validateBody(propertyTypeValidation.create), createPropertyType);
router.put('/:id', verifyToken, requirePermission('manage_settings'), validateBody(propertyTypeValidation.update), updatePropertyType);
router.delete('/:id', verifyToken, requirePermission('manage_settings'), deletePropertyType);
router.post('/seed', verifyToken, requirePermission('manage_settings'), seedDefaultPropertyTypes);

export default router;

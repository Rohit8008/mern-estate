import express from 'express';
import {
  getAllPropertyTypes,
  getPropertyTypeBySlug,
  createPropertyType,
  updatePropertyType,
  deletePropertyType,
  seedDefaultPropertyTypes,
} from '../controllers/propertyType.controller.js';
import { verifyToken } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';

const router = express.Router();

router.get('/list', getAllPropertyTypes);
router.get('/:slug', getPropertyTypeBySlug);
router.post('/create', verifyToken, requirePermission('manage_settings'), createPropertyType);
router.put('/:id', verifyToken, requirePermission('manage_settings'), updatePropertyType);
router.delete('/:id', verifyToken, requirePermission('manage_settings'), deletePropertyType);
router.post('/seed', verifyToken, requirePermission('manage_settings'), seedDefaultPropertyTypes);

export default router;

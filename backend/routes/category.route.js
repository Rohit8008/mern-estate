import express from 'express';
import { verifyToken } from '../utils/verifyUser.js';
import { requirePermission } from '../middleware/permissions.js';
import { createCategory, getCategories, deleteCategory, getCategoryBySlug, updateCategoryFields } from '../controllers/category.controller.js';
import { validateBody, categoryValidation } from '../middleware/validation.js';

const router = express.Router();

router.post('/create', verifyToken, requirePermission('createCategory'), validateBody(categoryValidation.create), createCategory);
router.get('/list', getCategories);
router.delete('/delete/:id', verifyToken, requirePermission('deleteCategory'), deleteCategory);
router.get('/by-slug/:slug', getCategoryBySlug);
router.post('/update-fields/:id', verifyToken, requirePermission('updateCategory'), validateBody(categoryValidation.updateFields), updateCategoryFields);

export default router;



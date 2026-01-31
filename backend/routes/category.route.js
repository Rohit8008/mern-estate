import express from 'express';
import { verifyToken, requireAdmin } from '../utils/verifyUser.js';
import { createCategory, getCategories, deleteCategory, getCategoryBySlug, updateCategoryFields } from '../controllers/category.controller.js';

const router = express.Router();

router.post('/create', verifyToken, requireAdmin, createCategory);
router.get('/list', getCategories);
router.delete('/delete/:id', verifyToken, requireAdmin, deleteCategory);
router.get('/by-slug/:slug', getCategoryBySlug);
router.post('/update-fields/:id', verifyToken, requireAdmin, updateCategoryFields);

export default router;



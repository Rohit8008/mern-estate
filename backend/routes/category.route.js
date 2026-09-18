import express from 'express';
import { verifyToken } from '../utils/verifyUser.js';
import { requirePermission } from '../middleware/permissions.js';
import {
  createCategory,
  getCategories,
  deleteCategory,
  getCategoryBySlug,
  updateCategoryFields,
  updateCategoryLocation,
  renameCategory,
  restoreCategory,
  getDeletedCategories,
} from '../controllers/category.controller.js';
import { validateBody, categoryValidation } from '../middleware/validation.js';

const router = express.Router();

// Categories described the public browse filters, and there is no public
// browsing any more. `publicView()` in the controller is kept for the reduced
// shape a share link needs, but nothing reaches these without a session.
router.get('/list', verifyToken, getCategories);
router.get('/by-slug/:slug', verifyToken, getCategoryBySlug);

router.post('/create', verifyToken, requirePermission('createCategory'), validateBody(categoryValidation.create), createCategory);
router.patch('/:id', verifyToken, requirePermission('updateCategory'), validateBody(categoryValidation.rename), renameCategory);
router.delete('/delete/:id', verifyToken, requirePermission('deleteCategory'), deleteCategory);

router.post('/update-fields/:id', verifyToken, requirePermission('updateCategory'), validateBody(categoryValidation.updateFields), updateCategoryFields);
router.post('/update-location/:id', verifyToken, requirePermission('updateCategory'), validateBody(categoryValidation.updateLocation), updateCategoryLocation);

// Undoing a delete. Deleting is the only destructive action here, so it is the
// one that most needs a way back.
router.get('/deleted', verifyToken, requirePermission('deleteCategory'), getDeletedCategories);
router.post('/restore/:id', verifyToken, requirePermission('deleteCategory'), restoreCategory);

export default router;

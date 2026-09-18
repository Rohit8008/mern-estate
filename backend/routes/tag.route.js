import express from 'express';
import { verifyToken, requireAdmin } from '../utils/verifyUser.js';
import {
  listTags,
  createTag,
  updateTag,
  deleteTag,
  attachTag,
  detachTag,
} from '../controllers/tag.controller.js';

const router = express.Router();

router.use(verifyToken);

// Anyone in the workspace reads the taxonomy — a tag picker needs it.
router.get('/', listTags);

// Creating is open to CRM staff so an inline "add tag" box works; renaming,
// recolouring and deleting change the taxonomy for everyone, so those are admin.
router.post('/', createTag);
router.patch('/:id', requireAdmin, updateTag);
router.delete('/:id', requireAdmin, deleteTag);

// Applying a tag to a record. Ownership of the record is checked per kind in
// the controller.
router.post('/:kind/:id/:tagId', attachTag);
router.delete('/:kind/:id/:tagId', detachTag);

export default router;

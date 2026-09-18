import express from 'express';
import { verifyToken, requireAdmin } from '../utils/verifyUser.js';
import { requirePermission } from '../middleware/permissions.js';
import {
  exportUserData,
  exportContactData,
  eraseUser,
  eraseContact,
} from '../controllers/dataRights.controller.js';

const router = express.Router();

router.use(verifyToken);

// Anyone may export themselves — that is the point of a subject access request.
router.get('/export/me', exportUserData);

// Exporting somebody else, or a contact, is a reporting action.
router.get('/export/user/:id', requirePermission('exportData'), exportUserData);
router.get('/export/:kind/:id', requirePermission('exportData'), exportContactData);

// Erasure is irreversible, so it is admin-only and never self-service.
router.delete('/erase/user/:id', requireAdmin, eraseUser);
router.delete('/erase/:kind/:id', requireAdmin, eraseContact);

export default router;

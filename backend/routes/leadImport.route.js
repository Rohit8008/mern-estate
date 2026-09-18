import express from 'express';
import { verifyToken } from '../utils/verifyUser.js';
import { requirePermission } from '../middleware/permissions.js';
import {
  getLeadImportFields,
  suggestLeadMapping,
  previewLeadImport,
  commitLeadImport,
} from '../controllers/leadImport.controller.js';

const router = express.Router();

router.use(verifyToken);

// Reading the field list is harmless; everything that reads or writes lead data
// needs the same permission creating one by hand does.
router.get('/fields', getLeadImportFields);
router.post('/suggest-mapping', requirePermission('createClient'), suggestLeadMapping);
router.post('/preview', requirePermission('createClient'), previewLeadImport);
router.post('/commit', requirePermission('createClient'), commitLeadImport);

export default router;

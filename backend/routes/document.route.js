import express from 'express';
import { verifyToken } from '../utils/verifyUser.js';
import { requirePermission } from '../middleware/permissions.js';
import { uploadMiddleware, uploadDocument, listDocuments, deleteDocument } from '../controllers/document.controller.js';

const router = express.Router();

router.use(verifyToken);

router.get('/', requirePermission('viewClients'), listDocuments);
router.post('/upload', requirePermission('uploadFiles'), (req, res, next) => {
  uploadMiddleware(req, res, (err) => {
    if (err) return next(err);
    return uploadDocument(req, res, next);
  });
});
router.delete('/:id', requirePermission('uploadFiles'), deleteDocument);

export default router;

import express from 'express';
import { verifyToken } from '../utils/verifyUser.js';
import { requirePermission } from '../middleware/permissions.js';
import {
  uploadMiddleware,
  uploadDocument,
  listDocuments,
  deleteDocument,
  getCategoryDocTypes,
  listPublicCategoryDocuments,
  serveDocumentFile,
} from '../controllers/document.controller.js';

const router = express.Router();

router.use(verifyToken);

// A colony's published paperwork — RERA certificate, layout, photographs.
//
// This was public when it was written, on the reasoning that checking a RERA
// registration should not need an account. It sits behind a session now, to
// match the decision that nothing about a property is browsable without one.
// A share link is how this reaches someone outside the agency.
router.get('/public/category/:categoryId', listPublicCategoryDocuments);

router.get('/category-types', getCategoryDocTypes);

// The document bytes. Deliberately not `requirePermission('uploadFiles')` —
// reading a document you are already entitled to see is not an upload right.
// The handler re-applies the same ownership rules deleteDocument uses.
router.get('/file/:filename', serveDocumentFile);

// `uploadFiles` rather than `viewClients`: these are attached to clients,
// properties AND categories, and someone who may see a colony's layout plan
// should not need permission over the client book to do it.
router.get('/', requirePermission('uploadFiles'), listDocuments);
router.post('/upload', requirePermission('uploadFiles'), (req, res, next) => {
  uploadMiddleware(req, res, (err) => {
    if (err) return next(err);
    return uploadDocument(req, res, next);
  });
});
router.delete('/:id', requirePermission('uploadFiles'), deleteDocument);

export default router;

import express from 'express';
import { verifyToken } from '../utils/verifyUser.js';
import { requirePermission } from '../middleware/permissions.js';
import { validateBody, clientValidation } from '../middleware/validation.js';
import {
  createClient,
  getClients,
  getClientById,
  updateClient,
  deleteClient,
  assignClient,
  addInterestedListing,
  removeInterestedListing,
  bulkUpdateClients,
  exportClients,
  addClientPhoto,
  deleteClientPhoto,
} from '../controllers/client.controller.js';

const router = express.Router();

// All routes require auth
router.use(verifyToken);

// List and create
router.get('/', requirePermission('viewClients'), getClients);
router.post('/', requirePermission('createClient'), validateBody(clientValidation.create), createClient);

// Export the filtered set. Declared before '/:id' so "export" is not read as
// an id. Gated on exportData, which is what that permission is for.
router.get('/export', requirePermission('exportData'), exportClients);

// Act on a selection. `updateClient` is the floor; reassignment and deletion
// are additionally checked inside the controller.
router.post('/bulk', requirePermission('updateClient'), validateBody(clientValidation.bulk), bulkUpdateClients);

// Detail
router.get('/:id', requirePermission('viewClients'), getClientById);
router.patch('/:id', requirePermission('updateClient'), validateBody(clientValidation.update), updateClient);
router.delete('/:id', requirePermission('deleteClient'), deleteClient);

// Admin reassignment
router.post('/:id/assign', requirePermission('updateUser'), validateBody(clientValidation.assign), assignClient);

// Photos. The file goes to Cloudinary from the browser; only the URL arrives here.
router.post('/:id/photos', requirePermission('updateClient'), addClientPhoto);
router.delete('/:id/photos/:photoId', requirePermission('updateClient'), deleteClientPhoto);

// Interested listings management
router.post('/:id/interested/add', requirePermission('updateClient'), validateBody(clientValidation.interestedListing), addInterestedListing);
router.post('/:id/interested/remove', requirePermission('updateClient'), validateBody(clientValidation.interestedListing), removeInterestedListing);

export default router;

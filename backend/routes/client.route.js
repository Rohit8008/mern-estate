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
} from '../controllers/client.controller.js';

const router = express.Router();

// All routes require auth
router.use(verifyToken);

// List and create
router.get('/', requirePermission('viewClients'), getClients);
router.post('/', requirePermission('createClient'), validateBody(clientValidation.create), createClient);

// Detail
router.get('/:id', requirePermission('viewClients'), getClientById);
router.patch('/:id', requirePermission('updateClient'), validateBody(clientValidation.update), updateClient);
router.delete('/:id', requirePermission('deleteClient'), deleteClient);

// Admin reassignment
router.post('/:id/assign', requirePermission('updateUser'), validateBody(clientValidation.assign), assignClient);

// Interested listings management
router.post('/:id/interested/add', requirePermission('updateClient'), validateBody(clientValidation.interestedListing), addInterestedListing);
router.post('/:id/interested/remove', requirePermission('updateClient'), validateBody(clientValidation.interestedListing), removeInterestedListing);

export default router;

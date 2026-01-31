import express from 'express';
import { verifyToken } from '../utils/verifyUser.js';
import { requirePermission } from '../middleware/permissions.js';
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
router.post('/', requirePermission('createClient'), createClient);

// Detail
router.get('/:id', requirePermission('viewClients'), getClientById);
router.patch('/:id', requirePermission('updateClient'), updateClient);
router.delete('/:id', requirePermission('deleteClient'), deleteClient);

// Admin reassignment
router.post('/:id/assign', requirePermission('updateUser'), assignClient);

// Interested listings management
router.post('/:id/interested/add', requirePermission('updateClient'), addInterestedListing);
router.post('/:id/interested/remove', requirePermission('updateClient'), removeInterestedListing);

export default router;

import express from 'express';
import { verifyToken } from '../utils/verifyUser.js';
import { requirePermission } from '../middleware/permissions.js';
import { validateBody, transactionValidation } from '../middleware/validation.js';
import {
  listTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  getStats,
} from '../controllers/transaction.controller.js';

const router = express.Router();

router.use(verifyToken);

router.get('/stats', requirePermission('viewClients'), getStats);
router.get('/', requirePermission('viewClients'), listTransactions);
router.post('/', requirePermission('viewClients'), validateBody(transactionValidation.create), createTransaction);
router.patch('/:id', requirePermission('viewClients'), validateBody(transactionValidation.update), updateTransaction);
router.delete('/:id', requirePermission('viewClients'), deleteTransaction);

export default router;

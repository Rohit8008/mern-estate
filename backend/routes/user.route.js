import express from 'express';
import { deleteUser, adminDeleteUser, adminToggleUserStatus, test, updateUser,  getUserListings, getUser, setUserRole, listUsers, createEmployee, getUserPublic, requestPasswordReset, resetPasswordWithOtp, me, searchUsers, adminSetEmployeePassword} from '../controllers/user.controller.js';
import SecurityLog from '../models/securityLog.model.js';
import { requireAdmin, verifyToken } from '../utils/verifyUser.js';
import { validateBody, userRouteValidation } from '../middleware/validation.js';


const router = express.Router();

router.get('/test', test);
router.get('/list', verifyToken, requireAdmin, listUsers)
router.get('/me', verifyToken, me)
router.get('/security/logs', verifyToken, requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 200, 1000);
    const skip = Math.max(Number(req.query.skip) || 0, 0);
    const { method, status, email, since, until } = req.query || {};
    const query = {};
    if (method && ['password','google','signup','other'].includes(method)) query.method = method;
    if (status && ['blocked','invalid','success'].includes(status)) query.status = status;
    if (email && String(email).trim()) query.email = { $regex: String(email).trim(), $options: 'i' };
    if (since || until) {
      query.createdAt = {};
      if (since) {
        const d = new Date(since);
        if (!isNaN(d.getTime())) query.createdAt.$gte = d;
      }
      if (until) {
        const d = new Date(until);
        if (!isNaN(d.getTime())) query.createdAt.$lte = d;
      }
      if (Object.keys(query.createdAt).length === 0) delete query.createdAt;
    }
    const total = await SecurityLog.countDocuments(query);
    const logs = await SecurityLog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    res.json({ logs, total });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to fetch logs' });
  }
})
router.post('/employee', verifyToken, requireAdmin, validateBody(userRouteValidation.createEmployee), createEmployee)
router.post('/update/:id', verifyToken, validateBody(userRouteValidation.updateProfile), updateUser)
router.delete('/delete/:id', verifyToken, deleteUser)
router.delete('/admin/delete/:id', verifyToken, requireAdmin, adminDeleteUser)
router.post('/admin/toggle-status/:id', verifyToken, requireAdmin, validateBody(userRouteValidation.adminToggleUserStatus), adminToggleUserStatus)
router.post('/admin/set-employee-password/:id', verifyToken, requireAdmin, validateBody(userRouteValidation.adminSetEmployeePassword), adminSetEmployeePassword)
router.get('/search', verifyToken, searchUsers)
router.get('/listings/:id', verifyToken, getUserListings)
router.get('/:id', verifyToken, getUser)
router.get('/public/:id', getUserPublic)
router.post('/role/:id', verifyToken, validateBody(userRouteValidation.setUserRole), setUserRole)
router.post('/password/request-otp', validateBody(userRouteValidation.requestPasswordOtp), requestPasswordReset)
router.post('/password/reset', validateBody(userRouteValidation.resetPasswordWithOtp), resetPasswordWithOtp)

export default router;
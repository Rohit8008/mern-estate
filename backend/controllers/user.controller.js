import bcryptjs from 'bcryptjs';
import crypto from 'crypto';
import { sendMail } from '../utils/mailer.js';
import SecurityLog from '../models/securityLog.model.js';
import User from '../models/user.model.js';
import { errorHandler } from '../utils/error.js';
import Listing from '../models/listing.model.js';

export const test = (req, res) => {
  res.json({
    message: 'Api route is working!',
  });
};

export const updateUser = async (req, res, next) => {
  if (req.user.id !== req.params.id)
    return next(errorHandler(401, 'You can only update your own account!'));
  try {
    // Email cannot be updated
    if (req.body.email && req.body.email !== undefined) {
      delete req.body.email;
    }
    // Password cannot be changed via this endpoint
    if (req.body.password) delete req.body.password;

    const existing = await User.findById(req.params.id);
    if (!existing) return next(errorHandler(404, 'User not found'));
    const oldPhone = existing.phone || '';
    const nextPhone = req.body.phone !== undefined ? req.body.phone : oldPhone;
    const phoneChanged = req.body.phone !== undefined && String(nextPhone) !== String(oldPhone);
    
    // Check if phone number is already in use by another user
    if (phoneChanged && nextPhone && nextPhone.trim() !== '') {
      const existingUserWithPhone = await User.findOne({ 
        phone: nextPhone.trim(), 
        _id: { $ne: req.params.id } 
      });
      if (existingUserWithPhone) {
        return next(errorHandler(409, 'Phone number is already in use by another account'));
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          username: req.body.username,
          firstName: req.body.firstName,
          lastName: req.body.lastName,
          avatar: req.body.avatar,
          phone: req.body.phone,
          addressLine1: req.body.addressLine1,
          addressLine2: req.body.addressLine2,
          city: req.body.city,
          state: req.body.state,
          postalCode: req.body.postalCode,
          country: req.body.country,
          bio: req.body.bio,
        },
      },
      { new: true }
    );

    const { password, ...rest } = updatedUser._doc;

    // Log phone changes to security logs
    if (phoneChanged) {
      const mask = (p) => String(p || '').replace(/.(?=.{4})/g, '*');
      try {
        await SecurityLog.create({
          email: updatedUser.email,
          method: 'other',
          status: 'success',
          reason: `phone_changed:${mask(oldPhone)}->${mask(updatedUser.phone)}`,
          ip: (req.headers['x-forwarded-for'] || '').split(',')[0]?.trim() || req.socket?.remoteAddress || '',
          userAgent: req.headers['user-agent'] || '',
          path: req.originalUrl || '',
        });
      } catch (_) {}
    }

    res.status(200).json(rest);
  } catch (error) {
    next(error);
  }
};


export const requestPasswordReset = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return next(errorHandler(400, 'Email is required'));
    const user = await User.findOne({ email }).select('+passwordResetOtpHash +passwordResetOtpExpires');
    if (!user) return next(errorHandler(404, 'User not found'));
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const hash = crypto.createHash('sha256').update(otp).digest('hex');
    user.passwordResetOtpHash = hash;
    user.passwordResetOtpExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();
    const masked = email.replace(/(^.).+(@.*$)/, (_, a, b) => a + '***' + b);
    // Try to send email. If SMTP not configured, return devOtp for convenience in dev
    const subject = 'Your password reset OTP';
    const text = `Your OTP is ${otp}. It expires in 10 minutes.`;
    const html = `<p>Your OTP is <b>${otp}</b>. It expires in 10 minutes.</p>`;
    const result = await sendMail({ to: email, subject, text, html });
    // If mail fails, still allow proceeding by returning devOtp for troubleshooting
    const devOtp = result.sent ? undefined : otp;
    res.status(200).json({
      message: result.sent ? 'OTP sent to email' : 'OTP generated (email delivery failed)'.trim(),
      to: masked,
      devOtp,
      mailDelivery: result.sent ? 'sent' : 'failed',
      errorReason: result.sent ? undefined : result.reason || 'unknown',
    });
  } catch (e) {
    next(e);
  }
};

export const resetPasswordWithOtp = async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) return next(errorHandler(400, 'Missing fields'));
    const user = await User.findOne({ email }).select('+passwordResetOtpHash +passwordResetOtpExpires');
    if (!user) return next(errorHandler(404, 'User not found'));
    if (!user.passwordResetOtpHash || !user.passwordResetOtpExpires || user.passwordResetOtpExpires < new Date()) {
      return next(errorHandler(400, 'OTP expired'));
    }
    const hash = crypto.createHash('sha256').update(String(otp)).digest('hex');
    if (hash !== user.passwordResetOtpHash) return next(errorHandler(400, 'Invalid OTP'));
    user.password = newPassword;
    user.passwordResetOtpHash = null;
    user.passwordResetOtpExpires = null;
    await user.save();
    res.status(200).json({ message: 'Password updated' });
  } catch (e) {
    next(e);
  }
};

export const deleteUser = async (req, res, next) => {
  if (req.user.id !== req.params.id)
    return next(errorHandler(401, 'You can only delete your own account!'));
  try {
    await User.findByIdAndUpdate(req.params.id, { status: 'inactive' });
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
    res.status(200).json({ success: true, message: 'Account deactivated successfully' });
  } catch (error) {
    next(error);
  }
};

export const adminDeleteUser = async (req, res, next) => {
  try {
    const targetId = req.params.id;

    // Cannot delete yourself
    if (req.user.id === targetId) {
      return next(errorHandler(403, 'You cannot delete your own account from the admin panel'));
    }

    const targetUser = await User.findById(targetId);
    if (!targetUser) {
      return next(errorHandler(404, 'User not found'));
    }

    // Cannot delete another admin
    if (targetUser.role === 'admin') {
      return next(errorHandler(403, 'Cannot delete an admin account'));
    }

    await User.findByIdAndUpdate(targetId, { status: 'inactive' });

    res.status(200).json({ success: true, message: 'User has been deactivated successfully' });
  } catch (error) {
    next(error);
  }
};

export const adminToggleUserStatus = async (req, res, next) => {
  try {
    const targetId = req.params.id;
    const { status } = req.body;

    if (!['active', 'inactive'].includes(status)) {
      return next(errorHandler(400, 'Status must be "active" or "inactive"'));
    }

    if (req.user.id === targetId) {
      return next(errorHandler(403, 'You cannot change your own status'));
    }

    const targetUser = await User.findById(targetId);
    if (!targetUser) {
      return next(errorHandler(404, 'User not found'));
    }

    if (targetUser.role === 'admin') {
      return next(errorHandler(403, 'Cannot change status of an admin account'));
    }

    targetUser.status = status;
    await targetUser.save();

    res.status(200).json({ success: true, message: `User ${status === 'active' ? 'reactivated' : 'deactivated'} successfully` });
  } catch (error) {
    next(error);
  }
};

export const getUserListings = async (req, res, next) => {
  if (req.user.id === req.params.id) {
    try {
      const listings = await Listing.find({ userRef: req.params.id });
      res.status(200).json(listings);
    } catch (error) {
      next(error);
    }
  } else {
    return next(errorHandler(401, 'You can only view your own listings!'));
  }
};

export const getUser = async (req, res, next) => {
  try {
    
    const user = await User.findById(req.params.id);
  
    if (!user) return next(errorHandler(404, 'User not found!'));
  
    const { password: pass, ...rest } = user._doc;
  
    res.status(200).json(rest);
  } catch (error) {
    next(error);
  }
};

export const getUserPublic = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('username email avatar phone role _id createdAt');
    if (!user) return next(errorHandler(404, 'User not found!'));
    res.status(200).json(user);
  } catch (error) {
    next(error);
  }
};

export const me = async (req, res, next) => {
  try {
    // verifyToken middleware sets req.user
    if (!req.user?.id) return next(errorHandler(401, 'Unauthorized'));
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return next(errorHandler(404, 'User not found!'));
    res.status(200).json(user);
  } catch (error) {
    next(error);
  }
};

export const setUserRole = async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') return next(errorHandler(403, 'Admin only'));
    const { role, assignedCategories } = req.body;
    const target = await User.findById(req.params.id);
    if (!target) return next(errorHandler(404, 'User not found!'));
    // Prevent admins from changing their own role
    if (String(target._id) === String(req.user.id) && role && role !== target.role) {
      return next(errorHandler(400, 'Admins cannot change their own role'));
    }
    // Prevent admins from changing another admin's role
    if (target.role === 'admin' && String(target._id) !== String(req.user.id)) {
      return next(errorHandler(403, 'Cannot modify the role of another admin'));
    }
    const updated = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { role, assignedCategories: assignedCategories || [] } },
      { new: true }
    ).select('-password');
    if (!updated) return next(errorHandler(404, 'User not found!'));
    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
};

export const listUsers = async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') return next(errorHandler(403, 'Admin only'));
    const users = await User.find().select('-password').populate('assignedRole', 'name description isActive');
    res.status(200).json(users);
  } catch (error) {
    next(error);
  }
};

export const searchUsers = async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q || q.length < 2) return res.status(200).json([]);
    const regex = { $regex: q, $options: 'i' };
    const users = await User.find({
      _id: { $ne: req.user.id },
      status: { $ne: 'inactive' },
      $or: [{ username: regex }, { firstName: regex }, { lastName: regex }, { email: regex }],
    })
      .select('username firstName lastName avatar _id')
      .limit(20)
      .lean();
    res.status(200).json(users);
  } catch (error) {
    next(error);
  }
};

export const createEmployee = async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') return next(errorHandler(403, 'Admin only'));
    const { username, firstName, lastName, email, password, assignedCategories, phone } = req.body;
    if (!username || !email || !password) return next(errorHandler(400, 'Missing fields'));
    const exists = await User.findOne({ email });
    if (exists) return next(errorHandler(409, 'Email already in use'));
    
    // Check if phone number is already in use
    if (phone && phone.trim() !== '') {
      const existingUserWithPhone = await User.findOne({ phone: phone.trim() });
      if (existingUserWithPhone) {
        return next(errorHandler(409, 'Phone number is already in use by another account'));
      }
    }
    
    const hashed = bcryptjs.hashSync(password, 10);
    const user = await User.create({
      username,
      firstName: firstName || '',
      lastName: lastName || '',
      email,
      password: hashed,
      role: 'employee',
      assignedCategories: assignedCategories || [],
      phone: phone || '',
    });
    const { password: pass, ...rest } = user._doc;
    res.status(201).json(rest);
  } catch (error) {
    next(error);
  }
};

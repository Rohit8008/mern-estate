import bcryptjs from 'bcryptjs';
import crypto from 'crypto';
import { sendMail } from '../utils/mailer.js';
import SecurityLog from '../models/securityLog.model.js';
import User from '../models/user.model.js';
import { errorHandler } from '../utils/error.js';
import Listing from '../models/listing.model.js';
import { validatePassword } from '../middleware/security.js';
import { config } from '../config/environment.js';

export const test = (req, res) => {
  res.json({
    message: 'Api route is working!',
  });
};

export const updateUser = async (req, res, next) => {
  if (req.user.id !== req.params.id)
    return next(errorHandler(403, 'You can only update your own account!'));
  try {
    // Email cannot be updated
    if (req.body.email && req.body.email !== undefined) {
      delete req.body.email;
    }
    // Password cannot be changed via this endpoint
    if (req.body.password) delete req.body.password;

    // B-005: Validate and deduplicate username before writing.
    if (req.body.username !== undefined) {
      const newUsername = String(req.body.username || '').trim().toLowerCase();
      if (newUsername.length < 3) {
        return next(errorHandler(400, 'Username must be at least 3 characters'));
      }
      if (!/^[a-z0-9_]+$/.test(newUsername)) {
        return next(errorHandler(400, 'Username can only contain letters, numbers, and underscores'));
      }
      const taken = await User.findOne({ username: newUsername, _id: { $ne: req.params.id } });
      if (taken) {
        return next(errorHandler(409, 'Username is already taken'));
      }
      req.body.username = newUsername;
    }

    const existing = await User.findById(req.params.id);
    if (!existing) return next(errorHandler(404, 'User not found'));
    const oldPhone = existing.phone || null;
    // Normalize empty string → null so the sparse unique index stays consistent
    const nextPhone = req.body.phone !== undefined
      ? (req.body.phone?.trim() || null)
      : oldPhone;
    const phoneChanged = req.body.phone !== undefined && nextPhone !== oldPhone;

    // Check if phone number is already in use by another user
    if (phoneChanged && nextPhone) {
      const existingUserWithPhone = await User.findOne({
        phone: nextPhone,
        _id: { $ne: req.params.id },
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
          phone: nextPhone,
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
    const subject = 'Your password reset OTP';
    const text = `Your OTP is ${otp}. It expires in 10 minutes.`;
    const html = `<p>Your OTP is <b>${otp}</b>. It expires in 10 minutes.</p>`;
    const result = await sendMail({ to: email, subject, text, html });

    // SEC-002: Never return the OTP in a production response, even when email
    // delivery fails. In development, expose it only when SMTP is unconfigured
    // so engineers can test the flow without a real mail server.
    const devOtp = (!config.server.isProduction && !result.sent) ? otp : undefined;

    res.status(200).json({
      message: result.sent ? 'OTP sent to email' : 'OTP generated (email delivery failed)',
      to: masked,
      ...(devOtp !== undefined && { devOtp }),
      mailDelivery: result.sent ? 'sent' : 'failed',
      ...(!result.sent && !config.server.isProduction && { errorReason: result.reason || 'unknown' }),
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
    return next(errorHandler(403, 'You can only delete your own account!'));
  try {
    // BUG-005: Also clear all refresh tokens so existing sessions can't be reused.
    await User.findByIdAndUpdate(req.params.id, {
      $set: {
        status: 'inactive',
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: req.user.id,
        refreshTokens: [],
      },
    });
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

    await User.findByIdAndUpdate(targetId, {
      status: 'inactive',
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: req.user.id,
    });

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
      const listings = await Listing.find({ userRef: req.params.id, isDeleted: { $ne: true } });
      res.status(200).json(listings);
    } catch (error) {
      next(error);
    }
  } else {
    return next(errorHandler(403, 'You can only view your own listings!'));
  }
};

export const getUser = async (req, res, next) => {
  try {
    
    // B-006: Exclude soft-deleted users from the public lookup.
    const user = await User.findOne({ _id: req.params.id, isDeleted: { $ne: true } });

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

export const myPermissions = async (req, res, next) => {
  try {
    if (!req.user?.id) return next(errorHandler(401, 'Unauthorized'));

    // Admins get all permissions
    if (req.user.role === 'admin') {
      const Role = (await import('../models/role.model.js')).default;
      // Get all permission keys from the schema definition
      const permissionPaths = Object.keys(Role.schema.paths).filter(p => p.startsWith('permissions.'));
      const allPerms = permissionPaths.reduce((acc, p) => {
        acc[p.replace('permissions.', '')] = true;
        return acc;
      }, {});
      return res.status(200).json({ permissions: allPerms, role: 'admin', isAdmin: true });
    }

    const user = await User.findById(req.user.id).populate('assignedRole');
    if (!user) return next(errorHandler(404, 'User not found!'));

    if (!user.assignedRole || !user.assignedRole.isActive) {
      return res.status(200).json({ permissions: {}, role: user.role, isAdmin: false });
    }

    const perms = {};
    const roleObj = user.assignedRole.toObject();
    if (roleObj.permissions) {
      for (const [key, val] of Object.entries(roleObj.permissions)) {
        if (val === true) perms[key] = true;
      }
    }

    return res.status(200).json({
      permissions: perms,
      role: user.role,
      roleName: user.assignedRole.name,
      isAdmin: false,
    });
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
    const users = await User.find({ isDeleted: { $ne: true } }).select('-password').populate('assignedRole', 'name description isActive');
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
      isDeleted: { $ne: true },
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
    const { username, firstName, lastName, email, password, assignedCategories, phone, message } = req.body;
    if (!username || !email || !password) return next(errorHandler(400, 'Missing fields'));

    const pw = validatePassword(String(password));
    if (!pw.isValid) return next(errorHandler(400, 'Password does not meet security requirements'));

    const exists = await User.findOne({ email });
    if (exists) return next(errorHandler(409, 'Email already in use'));

    if (phone && phone.trim() !== '') {
      const existingUserWithPhone = await User.findOne({ phone: phone.trim() });
      if (existingUserWithPhone) {
        return next(errorHandler(409, 'Phone number is already in use by another account'));
      }
    }

    const user = await User.create({
      username,
      firstName: firstName || '',
      lastName: lastName || '',
      email,
      password: String(password),
      role: 'employee',
      assignedCategories: assignedCategories || [],
      phone: phone?.trim() || null,
    });

    // Send welcome email with credentials (fire-and-forget — don't fail the request if mail fails)
    const appUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const displayName = firstName ? `${firstName}${lastName ? ' ' + lastName : ''}` : username;
    const personalNote = message?.trim()
      ? `<p style="background:#f8fafc;border-left:3px solid #6366f1;padding:12px 16px;border-radius:4px;color:#334155;font-style:italic;">${message.trim()}</p>`
      : '';

    sendMail({
      to: email,
      subject: "You've been invited to join the team",
      text: [
        `Hi ${displayName},`,
        '',
        "You've been added as a team member. Here are your login credentials:",
        `  Email:    ${email}`,
        `  Password: ${password}`,
        '',
        `Sign in at: ${appUrl}/sign-in`,
        '',
        'Please change your password after your first login.',
        message?.trim() ? `\nMessage from your admin:\n${message.trim()}` : '',
      ].join('\n'),
      html: `
        <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:520px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#0f172a,#1e293b);padding:28px 32px;">
            <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">You've been invited!</h1>
            <p style="margin:6px 0 0;color:#94a3b8;font-size:14px;">You now have access to the team workspace.</p>
          </div>
          <div style="padding:28px 32px;">
            <p style="color:#334155;margin:0 0 20px;">Hi <strong>${displayName}</strong>,</p>
            ${personalNote}
            <p style="color:#334155;margin:16px 0 12px;">Your login credentials:</p>
            <table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:8px;overflow:hidden;">
              <tr>
                <td style="padding:12px 16px;color:#64748b;font-size:13px;width:90px;border-bottom:1px solid #e2e8f0;">Email</td>
                <td style="padding:12px 16px;color:#0f172a;font-weight:600;font-size:13px;border-bottom:1px solid #e2e8f0;">${email}</td>
              </tr>
              <tr>
                <td style="padding:12px 16px;color:#64748b;font-size:13px;">Password</td>
                <td style="padding:12px 16px;color:#0f172a;font-weight:600;font-size:13px;font-family:monospace;">${password}</td>
              </tr>
            </table>
            <div style="margin:24px 0;">
              <a href="${appUrl}/sign-in" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">Sign in now →</a>
            </div>
            <p style="color:#94a3b8;font-size:12px;margin:0;">Please change your password after your first login.</p>
          </div>
        </div>`,
    }).catch((e) => console.error('[invite] email send failed:', e));

    const { password: pass, ...rest } = user._doc;
    res.status(201).json({ ...rest, emailSent: true });
  } catch (error) {
    next(error);
  }
};

export const adminSetEmployeePassword = async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') return next(errorHandler(403, 'Admin only'));

    const targetId = req.params.id;
    const { newPassword } = req.body || {};
    if (!newPassword) return next(errorHandler(400, 'Missing newPassword'));

    if (String(req.user.id) === String(targetId)) {
      return next(errorHandler(403, 'You cannot change your own password from this endpoint'));
    }

    const target = await User.findById(targetId).select('+password');
    if (!target) return next(errorHandler(404, 'User not found'));

    if (target.role === 'admin') return next(errorHandler(403, 'Cannot reset password for an admin account'));
    if (target.role !== 'employee') return next(errorHandler(403, 'Only employee passwords can be changed here'));

    const pw = validatePassword(String(newPassword));
    if (!pw.isValid) return next(errorHandler(400, 'Password does not meet security requirements'));

    target.password = String(newPassword);
    target.passwordResetOtpHash = null;
    target.passwordResetOtpExpires = null;
    target.refreshTokens = [];
    await target.save();

    try {
      await SecurityLog.create({
        email: target.email,
        method: 'password',
        status: 'success',
        reason: 'admin_password_reset',
        ip: (req.headers['x-forwarded-for'] || '').split(',')[0]?.trim() || req.socket?.remoteAddress || '',
        userAgent: req.headers['user-agent'] || '',
        path: req.originalUrl || '',
      });
    } catch (_) {}

    res.status(200).json({ success: true, message: 'Password updated' });
  } catch (error) {
    next(error);
  }
};

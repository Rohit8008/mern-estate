import bcryptjs from 'bcryptjs';
import crypto from 'crypto';
import { sendMail, isMailConfigured } from '../utils/mailer.js';
import SecurityLog from '../models/securityLog.model.js';
import User from '../models/user.model.js';
import { errorHandler } from '../utils/error.js';
import { assertWithinLimit } from '../tenancy/limits.js';
import Listing from '../models/listing.model.js';
import { validatePassword } from '../middleware/security.js';
import { config } from '../config/environment.js';
import { inHomeTenant } from '../tenancy/tenantContext.js';
import { logger } from '../utils/logger.js';
import { attachInvite, sendInviteEmail } from '../tenancy/invites.js';

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


/**
 * How many wrong codes before the OTP is burned.
 *
 * Low on purpose: a legitimate person mistypes once or twice, an attacker needs
 * thousands. Burning the code rather than locking the account means the remedy
 * is simply to request a new one, so this cannot be used to lock somebody out.
 */
const MAX_OTP_ATTEMPTS = 5;

/** Mask whatever address was submitted, without implying it exists. */
function maskEmail(email) {
  return String(email).replace(/(^.).+(@.*$)/, (_, a, b) => `${a}***${b}`);
}

/**
 * Start a password reset.
 *
 * The response is identical whether or not the address has an account. It used
 * to answer 404 "User not found", which turned this endpoint into a membership
 * oracle: anyone could test an address and learn whether it belonged to a
 * customer of this workspace. Password reset is reachable without a session, so
 * that was readable by anyone at all.
 *
 * The tell to avoid is not just the status code — it is every observable
 * difference. Same message, same shape, same fields, and the mail send is not
 * awaited so a real address does not take measurably longer than a fictional
 * one.
 */
export const requestPasswordReset = async (req, res, next) => {
  try {
    const { email } = req.body;
    // A missing field is about the REQUEST, not about any account, so this one
    // may still be answered honestly.
    if (!email) return next(errorHandler(400, 'Email is required'));

    const user = await User.findOne({ email, isDeleted: { $ne: true } })
      .select('+passwordResetOtpHash +passwordResetOtpExpires +passwordResetOtpAttempts');

    let otp = null;

    if (user) {
      otp = String(Math.floor(100000 + Math.random() * 900000));
      user.passwordResetOtpHash = crypto.createHash('sha256').update(otp).digest('hex');
      user.passwordResetOtpExpires = new Date(Date.now() + 10 * 60 * 1000);
      user.passwordResetOtpAttempts = 0;
      await user.save({ validateBeforeSave: false });

      // Deliberately not awaited: awaiting it makes a real address take an SMTP
      // round trip longer than an unknown one, which is the same leak measured
      // with a stopwatch instead of read off the status code.
      sendMail({
        to: email,
        subject: 'Your password reset OTP',
        text: `Your OTP is ${otp}. It expires in 10 minutes.`,
        html: `<p>Your OTP is <b>${otp}</b>. It expires in 10 minutes.</p>`,
      }).catch(() => {});
    } else {
      logger.security?.('password_reset_unknown_address', { email: maskEmail(email), ip: req.ip });
    }

    // In development with no SMTP server, hand the code back so the flow can be
    // tested without a mail server. Never in production, and never for an
    // address that has no account — that would restore the oracle.
    const devOtp = otp && !config.server.isProduction && !(await isMailConfigured()) ? otp : undefined;

    res.status(200).json({
      message: 'If that address has an account, a code is on its way.',
      to: maskEmail(email),
      ...(devOtp !== undefined && { devOtp }),
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Finish a password reset.
 *
 * Every failure answers the same way. Distinguishing "no such account" from
 * "wrong code" here would give back exactly the membership oracle the request
 * endpoint no longer offers — the second half of the flow is just as reachable
 * as the first.
 */
export const resetPasswordWithOtp = async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) return next(errorHandler(400, 'Missing fields'));

    // One message for every way this can fail.
    const reject = () => next(errorHandler(400, 'That code is not valid or has expired.'));

    const user = await User.findOne({ email, isDeleted: { $ne: true } })
      .select('+passwordResetOtpHash +passwordResetOtpExpires +passwordResetOtpAttempts');

    if (!user) return reject();
    if (!user.passwordResetOtpHash || !user.passwordResetOtpExpires) return reject();
    if (user.passwordResetOtpExpires < new Date()) return reject();

    // Cap the guesses before comparing, so a burned code cannot be ground down
    // by simply continuing to ask.
    if ((user.passwordResetOtpAttempts || 0) >= MAX_OTP_ATTEMPTS) {
      logger.security?.('password_reset_otp_attempts_exceeded', {
        userId: String(user._id),
        ip: req.ip,
      });
      return reject();
    }

    const supplied = crypto.createHash('sha256').update(String(otp)).digest('hex');
    const expected = user.passwordResetOtpHash;
    const ok =
      supplied.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));

    if (!ok) {
      // Counted, and the code dies at the cap — the whole point of a cap is
      // that it is enforced across requests, not within one.
      user.passwordResetOtpAttempts = (user.passwordResetOtpAttempts || 0) + 1;
      if (user.passwordResetOtpAttempts >= MAX_OTP_ATTEMPTS) {
        user.passwordResetOtpHash = null;
        user.passwordResetOtpExpires = null;
      }
      await user.save({ validateBeforeSave: false });
      return reject();
    }

    // Hold the new password to the same policy as every other place one is set;
    // a reset was the way to sidestep it.
    const strength = validatePassword(String(newPassword));
    if (!strength.isValid) {
      return next(
        errorHandler(
          400,
          'Use at least 8 characters with an uppercase letter, a lowercase letter, a number and a symbol.'
        )
      );
    }

    user.password = newPassword;
    user.passwordResetOtpHash = null;
    user.passwordResetOtpExpires = null;
    user.passwordResetOtpAttempts = 0;
    await user.save();

    logger.security?.('password_reset_completed', { userId: String(user._id), ip: req.ip });

    res.status(200).json({ message: 'Password updated' });
  } catch (e) {
    next(e);
  }
};

/**
 * A signed-in user changing their own password.
 *
 * The Profile form used to post the current password to the OTP reset as if it
 * were the code, which the 6-digit validator rejected every time. This checks
 * the current password instead. Saving bumps passwordChangedAt, so every
 * session — this one included — is signed out, which the caller must expect.
 */
export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user.id).select('+password');
    if (!user || user.isDeleted) return next(errorHandler(404, 'User not found'));

    // Google-only accounts have no password to check against; they set one
    // through Forgot password, which proves they own the address.
    if (!user.password) {
      return next(errorHandler(400, 'This account has no password yet. Use "Forgot password" to set one.'));
    }

    const ok = await user.correctPassword(String(currentPassword), user.password);
    if (!ok) {
      logger.security?.('password_change_wrong_current', { userId: String(user._id), ip: req.ip });
      return next(errorHandler(400, 'Current password is incorrect.'));
    }

    if (currentPassword === newPassword) {
      return next(errorHandler(400, 'New password must be different from the current one.'));
    }

    const strength = validatePassword(String(newPassword));
    if (!strength.isValid) {
      return next(
        errorHandler(
          400,
          'Use at least 8 characters with an uppercase letter, a lowercase letter, a number and a symbol.'
        )
      );
    }

    user.password = newPassword;
    await user.save();

    logger.security?.('password_changed', { userId: String(user._id), ip: req.ip });

    res.status(200).json({ success: true, message: 'Password changed. Please sign in again.' });
  } catch (e) {
    next(e);
  }
};

// A screen name used as a key under preferences.savedViews.
const SAVED_VIEW_NAMESPACE = /^[a-z][a-z0-9-]{0,39}$/;

export const getSavedViews = async (req, res, next) => {
  try {
    const { namespace } = req.params;
    if (!SAVED_VIEW_NAMESPACE.test(namespace)) return next(errorHandler(400, 'Unknown screen'));
    const user = await inHomeTenant(req, () => User.findById(req.user.id).select('preferences.savedViews').lean());
    res.status(200).json({ success: true, data: user?.preferences?.savedViews?.[namespace] || [] });
  } catch (e) {
    next(e);
  }
};

export const putSavedViews = async (req, res, next) => {
  try {
    const { namespace } = req.params;
    if (!SAVED_VIEW_NAMESPACE.test(namespace)) return next(errorHandler(400, 'Unknown screen'));
    await inHomeTenant(req, () =>
      User.updateOne({ _id: req.user.id }, { $set: { [`preferences.savedViews.${namespace}`]: req.body.items } })
    );
    res.status(200).json({ success: true, data: req.body.items });
  } catch (e) {
    next(e);
  }
};

export const getDashboardWidgets = async (req, res, next) => {
  try {
    const user = await inHomeTenant(req, () => User.findById(req.user.id).select('preferences.dashboardWidgets').lean());
    const items = user?.preferences?.dashboardWidgets;
    // null (never saved) is different from [] (removed them all): the browser
    // uploads its old local widgets only in the first case.
    res.status(200).json({ success: true, data: Array.isArray(items) ? items : null });
  } catch (e) {
    next(e);
  }
};

export const putDashboardWidgets = async (req, res, next) => {
  try {
    await inHomeTenant(req, () =>
      User.updateOne({ _id: req.user.id }, { $set: { 'preferences.dashboardWidgets': req.body.items } })
    );
    res.status(200).json({ success: true, data: req.body.items });
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
      // An agent's listings are the ones they added AND the ones assigned to
      // them; most of an employee's book is assigned by an admin, so reading
      // only userRef showed them an empty list.
      const listings = await Listing.find({
        $or: [{ userRef: req.params.id }, { assignedAgent: req.params.id }],
        isDeleted: { $ne: true },
      });
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
    // isDeleted filter matches getUser above: a de-provisioned employee's
    // contact details should not stay readable after their account is gone.
    // Tenant scoping is automatic, so this cannot reach another workspace.
    const user = await User.findOne({
      _id: req.params.id,
      isDeleted: { $ne: true },
    }).select('username email avatar phone role _id createdAt');
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
    // The caller's own record, which lives in their home workspace — not
    // necessarily the one this request is scoped to. See inHomeTenant.
    const user = await inHomeTenant(req, () => User.findById(req.user.id).select('-password'));
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

    const user = await inHomeTenant(req, () => User.findById(req.user.id).populate('assignedRole'));
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
    const { username, firstName, lastName, email, assignedCategories, phone, message } = req.body;
    if (!username || !email) return next(errorHandler(400, 'Missing fields'));

    const exists = await User.findOne({ email });
    if (exists) return next(errorHandler(409, 'Email already in use'));

    if (phone && phone.trim() !== '') {
      const existingUserWithPhone = await User.findOne({ phone: phone.trim() });
      if (existingUserWithPhone) {
        return next(errorHandler(409, 'Phone number is already in use by another account'));
      }
    }

    // Seats are counted before the write, not after: an agency that has filled
    // its plan should be told so, not billed for an overage they didn't choose.
    await assertWithinLimit('maxUsers', () =>
      User.countDocuments({ isDeleted: { $ne: true } })
    );

    const user = await User.create({
      username,
      firstName: firstName || '',
      lastName: lastName || '',
      email,
      // Never chosen by the admin and never sent anywhere. The account is
      // unusable until the recipient sets their own password through the
      // invite link, so there is no credential in existence to leak.
      password: crypto.randomBytes(32).toString('base64url'),
      role: 'employee',
      assignedCategories: assignedCategories || [],
      phone: phone?.trim() || null,
    });

    // An invitation, not a credential.
    //
    // This used to email the password in plaintext, in both the text and HTML
    // bodies, so it persisted in two mailboxes and every SMTP hop between them
    // — outside any rotation the product controls. tenancy/invites.js already
    // had the right answer and provisionTenant already used it: a 32-byte
    // single-use token, stored only as a SHA-256 hash, expiring in a week, with
    // the recipient choosing their own password. This path now uses it too.
    const inviteToken = attachInvite(user, { invitedBy: req.user.id });
    await user.save({ validateBeforeSave: false });

    let inviteUrlForAdmin = null;
    try {
      const sent = await sendInviteEmail({
        to: email,
        token: inviteToken,
        tenant: req.tenant,
        inviterName: req.user?.username || null,
      });
      // Returned to the ADMIN so they can pass it on by hand when mail is down.
      // Never logged: the token is the credential.
      inviteUrlForAdmin = sent.url;
      if (!sent.sent) {
        logger.warn('Employee invite email not delivered', { email, reason: sent.reason });
      }
    } catch (err) {
      logger.warn('Employee invite email failed', { email, error: err?.message });
    }

    if (message?.trim()) {
      logger.info('Employee invited with a personal note', { userId: String(user._id) });
    }

    const { password: pass, inviteTokenHash, ...rest } = user._doc;
    res.status(201).json({ ...rest, invited: true, inviteUrl: inviteUrlForAdmin });
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

import crypto from 'crypto';
import User from '../models/user.model.js';
import SecurityLog from '../models/securityLog.model.js';
import {
  ValidationError,
  AuthenticationError,
  asyncHandler,
} from '../utils/error.js';
import jwt from 'jsonwebtoken';
import { config } from '../config/environment.js';
import { logger } from '../utils/logger.js';
import { validateEmail } from '../middleware/security.js';

// SEC-008: Never store plain-text refresh tokens in the database.
// Store the SHA-256 hash; compare by hashing the incoming cookie value.
// A DB breach then yields only hashes — useless without the original tokens.
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const cookieOptions = {
  httpOnly: true,
  sameSite: config.server.isProduction ? 'none' : 'lax',
  secure: config.server.isProduction,
  // Match the access token JWT lifetime (16m gives a 1m buffer over the 15m JWT expiry)
  maxAge: 16 * 60 * 1000,
};

const refreshCookieOptions = {
  httpOnly: true,
  sameSite: config.server.isProduction ? 'none' : 'lax', // 'none' for cross-domain in production
  secure: config.server.isProduction,
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
};

// Async logging helper — writes to MongoDB SecurityLog + OpenObserve security_logs
const logSecurityEvent = async (logData) => {
  try {
    await SecurityLog.create(logData);
  } catch (error) {
    console.error('Failed to log security event:', error);
  }
  logger.security(logData.event || logData.action || 'security_event', logData);
};

// Generate token pair
const generateTokenPair = (userId) => {
  const accessToken = jwt.sign(
    { id: userId }, 
    config.jwt.secret, 
    { 
      expiresIn: config.jwt.accessTokenExpiry,
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    }
  );
  const refreshToken = jwt.sign(
    { id: userId }, 
    config.jwt.refreshSecret, 
    { 
      expiresIn: config.jwt.refreshTokenExpiry,
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    }
  );
  return { accessToken, refreshToken };
};

export const signin = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;
  const clientIP = req.ip || req.socket?.remoteAddress;
  const userAgent = req.headers['user-agent'] || '';

  if (!email || !password) {
    throw new ValidationError('Email and password are required');
  }

  // Validate email format
  if (!validateEmail(email)) {
    throw new ValidationError('Please provide a valid email address', 'email');
  }

  const validUser = await User.findOne({ email, isDeleted: { $ne: true } }).select('+password +loginAttempts +lockedUntil');
  if (!validUser) {
    logSecurityEvent({
      email: email || '',
      method: 'password',
      status: 'blocked',
      reason: 'User not found',
      ip: clientIP,
      userAgent: userAgent,
      path: req.originalUrl,
    });
    throw new AuthenticationError('Invalid email or password');
  }

  // Check account lockout
  if (validUser.lockedUntil && validUser.lockedUntil > new Date()) {
    const minutesLeft = Math.ceil((validUser.lockedUntil - Date.now()) / 60000);
    logSecurityEvent({
      email: validUser.email,
      method: 'password',
      status: 'blocked',
      reason: 'Account locked due to too many failed attempts',
      ip: clientIP,
      userAgent: userAgent,
      path: req.originalUrl,
    });
    throw new AuthenticationError(`Account locked. Try again in ${minutesLeft} minute(s).`);
  }

  // Check if user has a password (OAuth users may not have one)
  if (!validUser.password) {
    logSecurityEvent({
      email: validUser.email,
      method: 'password',
      status: 'blocked',
      reason: 'Account created with OAuth, password login not available',
      ip: clientIP,
      userAgent: userAgent,
      path: req.originalUrl,
    });
    throw new AuthenticationError('This account does not have a password. Please contact support.');
  }

  // Check account status
  if (validUser.status === 'inactive') {
    logSecurityEvent({
      email: validUser.email,
      method: 'password',
      status: 'blocked',
      reason: 'Account inactive',
      ip: clientIP,
      userAgent: userAgent,
      path: req.originalUrl,
    });
    throw new AuthenticationError('Your account is inactive. Please contact support.');
  }
  if (validUser.status === 'suspended') {
    logSecurityEvent({
      email: validUser.email,
      method: 'password',
      status: 'blocked',
      reason: 'Account suspended',
      ip: clientIP,
      userAgent: userAgent,
      path: req.originalUrl,
    });
    throw new AuthenticationError('Your account has been suspended. Please contact support.');
  }

  const validPassword = await validUser.correctPassword(password, validUser.password);
  if (!validPassword) {
    const maxAttempts = config.security.maxLoginAttempts;
    const attempts = (validUser.loginAttempts || 0) + 1;
    const updateOp = attempts >= maxAttempts
      ? { $set: { loginAttempts: attempts, lockedUntil: new Date(Date.now() + config.security.lockoutDuration) } }
      : { $inc: { loginAttempts: 1 } };
    await User.findByIdAndUpdate(validUser._id, updateOp);
    logSecurityEvent({
      email: email || '',
      method: 'password',
      status: 'blocked',
      reason: 'Wrong password',
      ip: clientIP,
      userAgent: userAgent,
      path: req.originalUrl,
    });
    throw new AuthenticationError('Invalid email or password');
  }

  // Generate token pair
  const { accessToken, refreshToken } = generateTokenPair(validUser._id);

  // Cap concurrent sessions at 10; $slice: -10 keeps the 10 most-recent tokens.
  // SEC-008: Store hash of the refresh token, never the raw JWT.
  await User.findByIdAndUpdate(validUser._id, {
    $push: {
      refreshTokens: {
        $each: [{ token: hashToken(refreshToken), ip: clientIP, userAgent: userAgent }],
        $slice: -10,
      },
    },
    $set: { lastLogin: new Date(), loginAttempts: 0, lockedUntil: null },
    $inc: { loginCount: 1 },
  });

  // Log successful login
  logSecurityEvent({
    email: validUser.email,
    method: 'password',
    status: 'success',
    reason: 'Successful login',
    ip: clientIP,
    userAgent: userAgent,
    path: req.originalUrl,
  });

  const { password: pass, refreshTokens, ...rest } = validUser.toObject();
  res
    .cookie('access_token', accessToken, cookieOptions)
    .cookie('refresh_token', refreshToken, refreshCookieOptions)
    .status(200)
    .json({ success: true, ...rest });
});

// Refresh token endpoint
export const refreshToken = asyncHandler(async (req, res, next) => {
  const { refresh_token } = req.cookies;
  const clientIP = req.ip || req.socket?.remoteAddress;
  const userAgent = req.headers['user-agent'] || '';

  if (!refresh_token) {
    throw new AuthenticationError('Refresh token not provided');
  }

  let decoded;
  try {
    const refreshSecret = process.env.REFRESH_SECRET || config.jwt.refreshSecret;
    decoded = jwt.verify(refresh_token, refreshSecret);
  } catch (error) {
    logSecurityEvent({
      method: 'refresh_token',
      status: 'blocked',
      reason: `Invalid refresh token: ${error.message}`,
      ip: clientIP,
      userAgent: userAgent,
      path: req.originalUrl,
    });
    throw new AuthenticationError('Invalid refresh token');
  }

  const user = await User.findById(decoded.id);

  if (!user) {
    throw new AuthenticationError('User not found');
  }

  // SEC-008: Compare against the stored hash, not the raw token.
  const tokenIndex = user.refreshTokens.findIndex((tokenObj) => tokenObj?.token === hashToken(refresh_token));
  if (tokenIndex === -1) {
    // If token is not found, it might be a token reuse attempt. Invalidate all tokens.
    await User.findByIdAndUpdate(user._id, { $set: { refreshTokens: [] } });
    logSecurityEvent({
      email: user.email,
      method: 'refresh_token',
      status: 'blocked',
      reason: 'Refresh token reuse detected. All tokens invalidated.',
      ip: clientIP,
      userAgent: userAgent,
      path: req.originalUrl,
    });
    throw new AuthenticationError('Invalid refresh token. Please log in again.');
  }

  // Generate new token pair
  const { accessToken, refreshToken: newRefreshToken } = generateTokenPair(user._id);

  // SEC-006 + SEC-008: Atomic token rotation — $pull then $push avoids the
  // race condition from splice+save, and stores hashes not raw JWTs.
  await User.findByIdAndUpdate(user._id, {
    $pull: { refreshTokens: { token: hashToken(refresh_token) } },
  });
  await User.findByIdAndUpdate(user._id, {
    $push: {
      refreshTokens: {
        $each: [{ token: hashToken(newRefreshToken), ip: clientIP, userAgent: userAgent }],
        $slice: -10,
      },
    },
  });

  // Log token refresh
  logSecurityEvent({
    email: user.email,
    method: 'refresh_token',
    status: 'success',
    reason: 'Token refreshed',
    ip: clientIP,
    userAgent: userAgent,
    path: req.originalUrl,
  });

  const { password: pass, refreshTokens: userRefreshTokens, ...rest } = user.toObject();
  res
    .cookie('access_token', accessToken, cookieOptions)
    .cookie('refresh_token', newRefreshToken, refreshCookieOptions)
    .status(200)
    .json({ success: true, ...rest });
});

export const signOut = asyncHandler(async (req, res, next) => {
  const { refresh_token } = req.cookies;
  const clientIP = req.ip || req.socket?.remoteAddress;
  const userAgent = req.headers['user-agent'] || '';

  const clearCookieOptions = { ...cookieOptions };
  delete clearCookieOptions.maxAge;

  const clearRefreshCookieOptions = { ...refreshCookieOptions };
  delete clearRefreshCookieOptions.maxAge;

  if (req.user) {
    logSecurityEvent({
      email: req.user.email,
      method: 'logout',
      status: 'success',
      reason: 'User signed out',
      ip: clientIP,
      userAgent: userAgent,
      path: req.originalUrl,
    });

    // Remove the specific refresh token from user's token list (SEC-008: compare by hash)
    if (refresh_token) {
      await User.findByIdAndUpdate(req.user.id, {
        $pull: { refreshTokens: { token: hashToken(refresh_token) } }
      });
    }
  }

  res
    .clearCookie('access_token', clearCookieOptions)
    .clearCookie('refresh_token', clearRefreshCookieOptions)
    .status(200)
    .json({ success: true, message: 'User signed out successfully!' });
});

export const signOutAll = asyncHandler(async (req, res, next) => {
  const clientIP = req.ip || req.socket?.remoteAddress;
  const userAgent = req.headers['user-agent'] || '';

  const clearCookieOptions = { ...cookieOptions };
  delete clearCookieOptions.maxAge;

  const clearRefreshCookieOptions = { ...refreshCookieOptions };
  delete clearRefreshCookieOptions.maxAge;

  if (req.user?.id) {
    try {
      await User.findByIdAndUpdate(req.user.id, { $set: { refreshTokens: [] } });
    } catch (_) {}

    logSecurityEvent({
      email: req.user.email,
      method: 'logout',
      status: 'success',
      reason: 'User signed out from all devices',
      ip: clientIP,
      userAgent: userAgent,
      path: req.originalUrl,
    });
  }

  res
    .clearCookie('access_token', clearCookieOptions)
    .clearCookie('refresh_token', clearRefreshCookieOptions)
    .status(200)
    .json({ success: true, message: 'Signed out from all devices' });
});

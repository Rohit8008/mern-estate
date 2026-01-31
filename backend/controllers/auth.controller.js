import User from '../models/user.model.js';
import SecurityLog from '../models/securityLog.model.js';
import bcryptjs from 'bcryptjs';
import { 
  errorHandler, 
  AppError, 
  ValidationError, 
  AuthenticationError, 
  ConflictError,
  asyncHandler,
  sendSuccessResponse,
  sendErrorResponse
} from '../utils/error.js';
import jwt from 'jsonwebtoken';
import { config } from '../config/environment.js';
import { logger } from '../utils/logger.js';
import { validateEmail, validatePassword } from '../middleware/security.js';

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.server.isProduction,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

const refreshCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.server.isProduction,
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
};

// Async logging helper - fire and forget
const logSecurityEvent = async (logData) => {
  try {
    await SecurityLog.create(logData);
  } catch (error) {
    console.error('Failed to log security event:', error);
  }
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
export const signup = asyncHandler(async (req, res, next) => {
  const { username, firstName, lastName, email, password, phone } = req.body;
  
  // Validate email format
  if (!validateEmail(email)) {
    throw new ValidationError('Please provide a valid email address', 'email');
  }

  // Validate password strength
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.isValid) {
    throw new ValidationError('Password does not meet security requirements', 'password');
  }

  // Check if email already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new ConflictError('Email is already in use');
  }

  // Check if username already exists
  const existingUsername = await User.findOne({ username });
  if (existingUsername) {
    throw new ConflictError('Username is already taken');
  }
  
  // Check if phone number is already in use
  if (phone && phone.trim() !== '') {
    const existingUserWithPhone = await User.findOne({ phone: phone.trim() });
    if (existingUserWithPhone) {
      throw new ConflictError('Phone number is already in use by another account');
    }
  }
  
  // Hash password with configurable rounds
  const hashedPassword = await bcryptjs.hash(password, config.security.bcryptRounds);
  
  const newUser = new User({ 
    username, 
    firstName: firstName || '', 
    lastName: lastName || '', 
    email, 
    password: hashedPassword, 
    phone: phone?.trim() || '',
    status: 'active',
    lastLogin: new Date(),
  });

  await newUser.save();

  // Log successful registration
  logger.info('User registered successfully', {
    userId: newUser._id,
    email: newUser.email,
    username: newUser.username,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });

  // Log security event
  logSecurityEvent({
    email: newUser.email,
    method: 'registration',
    status: 'success',
    reason: 'User registered successfully',
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    path: req.originalUrl,
  });

  sendSuccessResponse(res, null, 'User created successfully!', 201);
});

export const signin = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;
  const clientIP = req.ip || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'] || '';

  if (!email || !password) {
    throw new ValidationError('Email and password are required');
  }

  // Validate email format
  if (!validateEmail(email)) {
    throw new ValidationError('Please provide a valid email address', 'email');
  }

  const validUser = await User.findOne({ email }).select('+password');
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

  // Update user login tracking
  await User.findByIdAndUpdate(validUser._id, {
    $push: { refreshTokens: { token: refreshToken, ip: clientIP, userAgent: userAgent } },
    $set: { lastLogin: new Date() },
    $inc: { loginCount: 1 }
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
  const clientIP = req.ip || req.connection.remoteAddress;
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

  // Check if refresh token exists in user's token list and is valid
  const tokenIndex = user.refreshTokens.findIndex((tokenObj) => tokenObj?.token === refresh_token);
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

  // Remove old refresh token and add new one (token rotation)
  user.refreshTokens.splice(tokenIndex, 1); // Remove old token
  user.refreshTokens.push({ token: newRefreshToken, ip: clientIP, userAgent: userAgent }); // Add new token
  await user.save(); // Save the user document to update refreshTokens array

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
  const clientIP = req.ip || req.connection.remoteAddress;
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

    // Remove the specific refresh token from user's token list
    if (refresh_token) {
      await User.findByIdAndUpdate(req.user.id, {
        $pull: { refreshTokens: { token: refresh_token } }
      });
    }
  }

  res
    .clearCookie('access_token', clearCookieOptions)
    .clearCookie('refresh_token', clearRefreshCookieOptions)
    .status(200)
    .json({ success: true, message: 'User signed out successfully!' });
});

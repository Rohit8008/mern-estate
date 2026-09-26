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
import { issueCsrfToken, clearCsrfToken, CSRF_COOKIE } from '../middleware/csrf.js';
import { validateEmail } from '../middleware/security.js';
import { runWithTenant, inHomeTenant } from '../tenancy/tenantContext.js';

// SEC-008: Never store plain-text refresh tokens in the database.
// Store the SHA-256 hash; compare by hashing the incoming cookie value.
// A DB breach then yields only hashes — useless without the original tokens.
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// Parses simple JWT-style duration strings ('15m', '10d', '30s', '2h') to milliseconds.
// Cookie maxAge must be derived from the SAME config value used to sign the JWT — a
// hardcoded maxAge silently drifts from config.jwt.*Expiry (e.g. REFRESH_TOKEN_EXPIRY=10d
// in .env vs a hardcoded 30-day cookie), leaving a stale cookie that outlives the token it
// carries and produces a confusing "invalid/expired token" logout days after it stops working.
const UNIT_MS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
function durationToMs(value, fallbackMs) {
  const match = /^(\d+)(s|m|h|d)$/.exec(String(value || '').trim());
  return match ? Number(match[1]) * UNIT_MS[match[2]] : fallbackMs;
}

const cookieOptions = {
  httpOnly: true,
  sameSite: config.server.isProduction ? 'none' : 'lax',
  secure: config.server.isProduction,
  // 1-minute buffer over the JWT's own expiry so the cookie always outlives the token.
  maxAge: durationToMs(config.jwt.accessTokenExpiry, 15 * 60 * 1000) + 60 * 1000,
};

const refreshCookieOptions = {
  httpOnly: true,
  sameSite: config.server.isProduction ? 'none' : 'lax', // 'none' for cross-domain in production
  secure: config.server.isProduction,
  maxAge: durationToMs(config.jwt.refreshTokenExpiry, 30 * 24 * 60 * 60 * 1000),
};

/**
 * End the browser session: all three cookies, each cleared with the same
 * sameSite/secure it was set with. A bare clearCookie('access_token') does not
 * match a SameSite=None; Secure cookie in production, so the browser keeps it.
 */
export function clearSessionCookies(res) {
  const { maxAge: _a, ...clearAccess } = cookieOptions;
  const { maxAge: _r, ...clearRefresh } = refreshCookieOptions;
  clearCsrfToken(res);
  return res.clearCookie('access_token', clearAccess).clearCookie('refresh_token', clearRefresh);
}

// Async logging helper — writes to MongoDB SecurityLog + OpenObserve security_logs
const logSecurityEvent = async (logData) => {
  try {
    await SecurityLog.create(logData);
  } catch (error) {
    console.error('Failed to log security event:', error);
  }
  logger.security(logData.event || logData.action || 'security_event', logData);
};

// Generate token pair.
//
// `tid` carries the workspace the session belongs to. It is the most
// authoritative tenant signal there is — signed, so it cannot be forged by
// changing a host or a header — and resolveTenant() prefers it over everything
// else, refusing the request outright if the host names a different workspace.
const generateTokenPair = (userId, tenantId, extraClaims = {}) => {
  // `tid` is the workspace the USER belongs to — where their account lives and
  // where verifyToken must look them up. When a platform operator is viewing
  // another workspace, that arrives as a separate `act` claim rather than by
  // rewriting `tid`: overwriting it would move the operator's identity into a
  // workspace their account is not in, and the session would fail to resolve.
  const claims = { id: userId, tid: String(tenantId), ...extraClaims };
  const accessToken = jwt.sign(
    claims,
    config.jwt.secret,
    {
      expiresIn: config.jwt.accessTokenExpiry,
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    }
  );
  const refreshToken = jwt.sign(
    claims,
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
  const { accessToken, refreshToken } = generateTokenPair(validUser._id, validUser.tenantId);

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

  // `isPlatformAdmin` is select:false, so it is absent from validUser. It is
  // safe — and necessary — to tell a user their own status: the console link
  // has to appear for operators and stay hidden for everyone else. Every
  // platform endpoint re-checks the flag server-side regardless.
  const { isPlatformAdmin } = await User.findById(validUser._id)
    .select('+isPlatformAdmin')
    .lean();

  const { password: pass, refreshTokens, ...rest } = validUser.toObject();
  rest.isPlatformAdmin = Boolean(isPlatformAdmin);
  issueCsrfToken(res);
  res
    .cookie('access_token', accessToken, cookieOptions)
    .cookie('refresh_token', refreshToken, refreshCookieOptions)
    .status(200)
    .json({ success: true, ...rest });
});

// ─── Re-issuing a session with different claims ───────────────────────────────

/**
 * Mint a fresh cookie pair for a user who is already signed in.
 *
 * Used by the platform console to enter and leave a customer's workspace.
 * Everything about the session stays the same except the claims — same user,
 * same home workspace, same audit identity — so this is a change of view, not
 * a change of who is asking.
 *
 * The refresh token is rotated exactly as it is on `/refresh`: the old hash is
 * pulled and the new one pushed, so entering a workspace does not leave a
 * second usable refresh token behind.
 */
export async function reissueSession(res, { userId, tenantId, extraClaims = {}, replacing, ip, userAgent }) {
  const { accessToken, refreshToken } = generateTokenPair(userId, tenantId, extraClaims);

  await runWithTenant({ tenantId: String(tenantId) }, async () => {
    if (replacing) {
      await User.findByIdAndUpdate(userId, {
        $pull: { refreshTokens: { token: hashToken(replacing) } },
      });
    }
    await User.findByIdAndUpdate(userId, {
      $push: {
        refreshTokens: {
          $each: [{ token: hashToken(refreshToken), ip, userAgent }],
          $slice: -10,
        },
      },
    });
  });

  issueCsrfToken(res);
  res
    .cookie('access_token', accessToken, cookieOptions)
    .cookie('refresh_token', refreshToken, refreshCookieOptions);
}

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
    inHomeTenant(req, () => logSecurityEvent({
      method: 'refresh_token',
      status: 'blocked',
      reason: `Invalid refresh token: ${error.message}`,
      ip: clientIP,
      userAgent: userAgent,
      path: req.originalUrl,
    }));
    throw new AuthenticationError('Invalid refresh token');
  }

  // The refresh token's `tid` is the workspace the account lives in. When a
  // platform operator is viewing another agency, resolveTenant has scoped this
  // request to THAT agency — so every identity read below has to be pinned back
  // to the home workspace explicitly, or the operator's own record is invisible
  // and refreshing silently signs them out.
  const homeTenantId = String(decoded.tid || req.homeTenantId || req.tenantId);
  const inHome = (fn) => runWithTenant({ tenantId: homeTenantId }, fn);

  const user = await inHome(() => User.findById(decoded.id).select('+refreshTokens'));

  if (!user) {
    throw new AuthenticationError('User not found');
  }

  // SEC-008: Compare against the stored hash, not the raw token.
  const tokenIndex = user.refreshTokens.findIndex((tokenObj) => tokenObj?.token === hashToken(refresh_token));
  if (tokenIndex === -1) {
    // If token is not found, it might be a token reuse attempt. Invalidate all tokens.
    await inHome(() => User.findByIdAndUpdate(user._id, { $set: { refreshTokens: [] } }));
    inHomeTenant(req, () => logSecurityEvent({
      email: user.email,
      method: 'refresh_token',
      status: 'blocked',
      reason: 'Refresh token reuse detected. All tokens invalidated.',
      ip: clientIP,
      userAgent: userAgent,
      path: req.originalUrl,
    }));
    throw new AuthenticationError('Invalid refresh token. Please log in again.');
  }

  // An acting session survives a refresh, but the privilege behind it is
  // re-checked rather than carried on trust: `pa` was true 15 minutes ago, and
  // revoking someone's platform access should end their view into a customer's
  // workspace at the next refresh rather than whenever they happen to sign out.
  let acting = {};
  if (decoded.pa === true && decoded.act) {
    const current = await inHome(() =>
      User.findById(user._id).select('+isPlatformAdmin status').lean()
    );
    if (current?.isPlatformAdmin && current.status === 'active') {
      acting = { act: String(decoded.act), pa: true };
    } else {
      logger.security?.('acting_claim_dropped_on_refresh', {
        userId: String(user._id),
        act: String(decoded.act),
      });
    }
  }

  // Generate new token pair
  const { accessToken, refreshToken: newRefreshToken } = generateTokenPair(user._id, homeTenantId, acting);

  // SEC-006 + SEC-008: Atomic token rotation — $pull then $push avoids the
  // race condition from splice+save, and stores hashes not raw JWTs.
  await inHome(() =>
    User.findByIdAndUpdate(user._id, {
      $pull: { refreshTokens: { token: hashToken(refresh_token) } },
    })
  );
  await inHome(() =>
    User.findByIdAndUpdate(user._id, {
      $push: {
        refreshTokens: {
          $each: [{ token: hashToken(newRefreshToken), ip: clientIP, userAgent: userAgent }],
          $slice: -10,
        },
      },
    })
  );

  // Log token refresh
  inHomeTenant(req, () => logSecurityEvent({
    email: user.email,
    method: 'refresh_token',
    status: 'success',
    reason: 'Token refreshed',
    ip: clientIP,
    userAgent: userAgent,
    path: req.originalUrl,
  }));

  const { password: pass, refreshTokens: userRefreshTokens, ...rest } = user.toObject();
  issueCsrfToken(res);
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
    inHomeTenant(req, () => logSecurityEvent({
      email: req.user.email,
      method: 'logout',
      status: 'success',
      reason: 'User signed out',
      ip: clientIP,
      userAgent: userAgent,
      path: req.originalUrl,
    }));

    // Remove the specific refresh token from user's token list (SEC-008: compare by hash)
    //
    // Pinned to the home workspace. A platform operator signing out while
    // viewing a customer's workspace is scoped to THAT workspace, where their
    // user record does not exist — the $pull would match nothing, the endpoint
    // would still answer "signed out", and the refresh token would stay valid
    // for its full 30 days. Signing out has to actually sign you out.
    if (refresh_token) {
      await inHomeTenant(req, () =>
        User.findByIdAndUpdate(req.user.id, {
          $pull: { refreshTokens: { token: hashToken(refresh_token) } },
        })
      );
    }
  }

  clearCsrfToken(res);
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
    // Pinned for the same reason as signOut. The swallowed error is gone with
    // it: "signed out from all devices" is a promise, and a silent failure
    // turns it into a false one.
    await inHomeTenant(req, () =>
      User.findByIdAndUpdate(req.user.id, { $set: { refreshTokens: [] } })
    );

    inHomeTenant(req, () => logSecurityEvent({
      email: req.user.email,
      method: 'logout',
      status: 'success',
      reason: 'User signed out from all devices',
      ip: clientIP,
      userAgent: userAgent,
      path: req.originalUrl,
    }));
  }

  clearCsrfToken(res);
  res
    .clearCookie('access_token', clearCookieOptions)
    .clearCookie('refresh_token', clearRefreshCookieOptions)
    .status(200)
    .json({ success: true, message: 'Signed out from all devices' });
});

/**
 * Hand the caller the CSRF token for its own session.
 *
 * Browser JS can read the `csrf_token` cookie directly, but a Flutter web build
 * cannot (no dart:html in a cross-platform client), and on native the cookie jar
 * is only populated after a sign-in. This endpoint works everywhere: the browser
 * or jar sends the cookie, we echo the value back.
 *
 * Not a secret leak. Same-origin script can already read the cookie, and a
 * cross-origin page cannot read this response — CORS refuses it, which is the
 * same property the whole double-submit scheme rests on.
 */
export const getCsrfToken = asyncHandler(async (req, res) => {
  const existing = req.cookies?.[CSRF_COOKIE];
  const token = existing || issueCsrfToken(res);
  res.status(200).json({ success: true, csrfToken: token });
});

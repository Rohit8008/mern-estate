/**
 * The platform boundary.
 *
 * There are two kinds of administrator in this product and conflating them
 * would be the worst bug in it:
 *
 *   • a WORKSPACE admin (`role: 'admin'`) runs one agency. There is one in
 *     every tenant, and there will eventually be hundreds of them.
 *   • a PLATFORM admin (`isPlatformAdmin`) runs the product. They can create,
 *     suspend and inspect every workspace.
 *
 * `role: 'admin'` is therefore NOT sufficient for anything in this file. If it
 * were, every customer's own admin could provision workspaces and read across
 * the whole estate.
 */

import User from '../models/user.model.js';
import { AuthorizationError } from '../utils/error.js';
import { logger } from '../utils/logger.js';
import { runWithTenant } from '../tenancy/tenantContext.js';

/**
 * Require a platform operator.
 *
 * Runs after verifyToken, and re-reads the flag from the database rather than
 * trusting anything on the token or on `req.user`. `isPlatformAdmin` is
 * `select: false`, so it is absent from the object verifyToken loaded — which
 * is deliberate: a privilege this broad should be looked up explicitly at the
 * point of use, not carried around on every request.
 */
export const requirePlatformAdmin = async (req, res, next) => {
  try {
    if (!req.user?.id) {
      return next(new AuthorizationError('Sign in to continue.'));
    }

    // Pinned to the operator's HOME workspace. While they are viewing a
    // customer's workspace the request is scoped to that customer, and their
    // own account record does not live there — an unpinned lookup would find
    // nothing and lock them out of the console they are standing in.
    const user = await runWithTenant({ tenantId: String(req.homeTenantId || req.tenantId) }, () =>
      User.findById(req.user.id).select('+isPlatformAdmin email status username firstName lastName').lean()
    );

    if (!user || user.status !== 'active' || !user.isPlatformAdmin) {
      // Logged at security level: someone reaching a platform endpoint without
      // the flag is either a bug in the UI or an attempt worth seeing.
      logger.security?.('platform_access_denied', {
        userId: req.user.id,
        tenantId: req.tenantId,
        path: req.originalUrl,
        ip: req.ip,
      });
      return next(new AuthorizationError('This area is restricted to platform operators.'));
    }

    req.platformAdmin = {
      id: String(user._id),
      email: user.email,
      // For "Rohit Mittal has invited you", which read as a bare email address.
      name: [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.username || '',
    };
    return next();
  } catch (err) {
    return next(err);
  }
};

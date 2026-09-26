import Client from '../models/client.model.js';
import Tenant from '../models/tenant.model.js';
import { runWithTenant, runWithoutTenantScope } from '../tenancy/tenantContext.js';
import { verifyUnsubscribeToken, suppress, isSuppressed } from '../utils/unsubscribe.js';
import { logger } from '../utils/logger.js';

/**
 * The unsubscribe link at the foot of every automated email.
 *
 * No session: the signed token is the whole credential, and it can do exactly
 * one thing — stop email to the address on the lead it names. The workspace
 * comes from the token, not the host, so a link keeps working after an agency
 * changes domain.
 *
 * Nothing about the lead is returned except a masked address and the agency's
 * name: whoever holds a forwarded email should learn nothing from the page.
 */

const mask = (email) => {
  const [user = '', domain = ''] = String(email || '').split('@');
  if (!user || !domain) return '';
  return `${user.slice(0, 1)}${'•'.repeat(Math.max(1, Math.min(user.length - 1, 6)))}@${domain}`;
};

async function resolve(token) {
  const claim = verifyUnsubscribeToken(token);
  if (!claim) return null;
  const tenant = await runWithoutTenantScope('naming the agency on an unsubscribe page', () =>
    Tenant.findById(claim.tenantId).select('name branding').lean()
  );
  if (!tenant) return null;
  return { ...claim, agency: tenant.branding?.productName || tenant.name };
}

const INVALID = { success: false, message: 'This unsubscribe link is not valid. If you keep receiving emails, reply to one and ask to be removed.' };

// GET /api/unsubscribe/:token — what the page shows before and after.
export const describeUnsubscribe = async (req, res, next) => {
  try {
    const found = await resolve(req.params.token);
    if (!found) return res.status(404).json(INVALID);
    const data = await runWithTenant({ tenantId: found.tenantId }, async () => {
      const client = await Client.findById(found.clientId).select('email').lean();
      return {
        agency: found.agency,
        email: mask(client?.email),
        unsubscribed: client?.email ? await isSuppressed(client.email) : true,
      };
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/unsubscribe/:token — record it.
 *
 * Also the target of the List-Unsubscribe-Post header, so a mail client's
 * one-click button lands here with `List-Unsubscribe=One-Click` as a form body
 * and no page ever loads. Idempotent: a second click answers the same.
 */
export const confirmUnsubscribe = async (req, res, next) => {
  try {
    const found = await resolve(req.params.token);
    if (!found) return res.status(404).json(INVALID);
    const oneClick = req.body?.['List-Unsubscribe'] === 'One-Click';

    await runWithTenant({ tenantId: found.tenantId }, async () => {
      const client = await Client.findById(found.clientId).select('email').lean();
      // An erased or deleted lead has no address left to suppress, and no
      // email can be sent to it either — the answer is still "unsubscribed".
      if (client?.email) {
        await suppress({ email: client.email, clientId: found.clientId, source: oneClick ? 'one_click' : 'link' });
      }
    });

    logger.info('Unsubscribed from follow-up email', { tenantId: found.tenantId, clientId: found.clientId, oneClick });
    res.json({ success: true, data: { agency: found.agency, unsubscribed: true } });
  } catch (err) {
    next(err);
  }
};

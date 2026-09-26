import { config } from '../config/environment.js';

/**
 * The address a link in an email should point at, for one workspace.
 *
 * The workspace's own domain when it has one, then its subdomain of the app
 * domain, then FRONTEND_URL. A link a customer's lead receives is on the
 * customer's domain rather than the vendor's, and the request it makes can be
 * resolved to the workspace by host.
 */
export function workspaceBaseUrl(tenant) {
  const appDomain = config.tenancy?.appDomain;
  const base =
    tenant?.customDomain ? `https://${tenant.customDomain}`
    : tenant?.slug && appDomain ? `https://${tenant.slug}.${appDomain}`
    : process.env.FRONTEND_URL || 'http://localhost:5173';
  return String(base).replace(/\/+$/, '');
}

/**
 * Where the API is reachable from outside, for links a mail client calls
 * directly (the one-click unsubscribe POST). The production image serves the
 * API and the app from one origin, so it is the same base; a split deployment
 * sets PUBLIC_API_URL.
 */
export function workspaceApiBaseUrl(tenant) {
  const explicit = process.env.PUBLIC_API_URL;
  return explicit ? String(explicit).replace(/\/+$/, '') : workspaceBaseUrl(tenant);
}

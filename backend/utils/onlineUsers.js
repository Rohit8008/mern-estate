/**
 * Who is online, partitioned by workspace.
 *
 * This was a single process-global `Set` of user ids shared by every tenant on
 * the deployment. Two things leaked out of it: `presence:bulk` handed each
 * connecting socket the whole set, enumerating every signed-in user across every
 * agency, and `getOnlineUsers` returned the same set over REST. Those ids are
 * not inert — `user:<id>` rooms are the socket routing key, so a harvested id
 * from another workspace was directly addressable.
 *
 * Presence is per-workspace state, so the store is keyed that way and there is
 * no API that returns "everyone". A caller must name a tenant to read anything.
 */

/** tenantId -> Set<userId> */
const byTenant = new Map();

/** Normalise: ids and tenant ids arrive as both ObjectId and string. */
const k = (v) => String(v ?? '');

export function markOnline(tenantId, userId) {
  const t = k(tenantId);
  if (!t) return;
  if (!byTenant.has(t)) byTenant.set(t, new Set());
  byTenant.get(t).add(k(userId));
}

export function markOffline(tenantId, userId) {
  const t = k(tenantId);
  const set = byTenant.get(t);
  if (!set) return;
  set.delete(k(userId));
  // Don't leave empty sets behind for every workspace that ever connected.
  if (set.size === 0) byTenant.delete(t);
}

/** The ids online in ONE workspace. The only way to read the store. */
export function onlineInTenant(tenantId) {
  return Array.from(byTenant.get(k(tenantId)) || []);
}

export function isOnline(tenantId, userId) {
  return Boolean(byTenant.get(k(tenantId))?.has(k(userId)));
}

/** Test hook. */
export function _reset() {
  byTenant.clear();
}

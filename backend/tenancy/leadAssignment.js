import User from '../models/user.model.js';
import Client from '../models/client.model.js';
import { getTenant } from './tenantContext.js';

/**
 * Choosing which agent a new lead goes to.
 *
 * `workflow.leadAssignment` has been in the tenant schema from the start with
 * three modes — and nothing ever read it. A workspace could set "round robin"
 * in settings and every lead would still land on whoever created it.
 *
 * The modes:
 *  - `manual`      the caller decides (the previous behaviour, still the default)
 *  - `round_robin` spread evenly over the agents who can own leads
 *  - `by_locality` whoever already owns the most leads in that locality, so a
 *                  lead goes to the person with the local relationships; falls
 *                  back to round robin when the locality is new
 */

/** Agents eligible to receive a lead: active CRM staff in this workspace. */
async function eligibleAgents() {
  return User.find({
    role: { $in: ['admin', 'employee'] },
    status: 'active',
    isDeleted: { $ne: true },
  })
    .select('_id username')
    .sort({ _id: 1 }) // stable order, so round robin is deterministic
    .lean();
}

/**
 * Round robin without a counter to keep in sync: give it to whoever currently
 * holds the fewest open leads, breaking ties by the stable id order.
 *
 * A stored pointer would drift the moment a lead is reassigned or an agent
 * leaves; counting is self-correcting.
 */
async function leastLoaded(agents) {
  const counts = await Client.aggregate([
    { $match: { isDeleted: { $ne: true }, status: { $nin: ['won', 'lost'] } } },
    { $group: { _id: '$assignedTo', n: { $sum: 1 } } },
  ]);

  const byAgent = new Map(counts.map((c) => [String(c._id), c.n]));
  let best = agents[0];
  let bestCount = Infinity;

  for (const agent of agents) {
    const n = byAgent.get(String(agent._id)) || 0;
    if (n < bestCount) {
      best = agent;
      bestCount = n;
    }
  }

  return best?._id || null;
}

/** Whoever already owns the most leads in this locality. */
async function localityOwner(locality) {
  if (!locality) return null;

  const [top] = await Client.aggregate([
    {
      $match: {
        isDeleted: { $ne: true },
        assignedTo: { $ne: null },
        preferredLocations: { $regex: `^${String(locality).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
      },
    },
    { $group: { _id: '$assignedTo', n: { $sum: 1 } } },
    { $sort: { n: -1 } },
    { $limit: 1 },
  ]);

  return top?._id || null;
}

/**
 * Decide the owner of a new lead.
 *
 * @param {object} opts
 * @param {string} [opts.requested] assignedTo the caller asked for
 * @param {string} opts.fallback    who to use when no rule applies (the creator)
 * @param {string} [opts.locality]  for by_locality
 * @returns {Promise<{assignedTo: string, mode: string, automatic: boolean}>}
 */
export async function chooseAssignee({ requested, fallback, locality } = {}) {
  const mode = getTenant()?.workflow?.leadAssignment || 'manual';

  // An explicit choice always wins: a rule is for leads arriving with nobody
  // named, not for overriding a person who said where it should go.
  if (requested) {
    return { assignedTo: String(requested), mode, automatic: false };
  }

  if (mode === 'manual') {
    return { assignedTo: String(fallback), mode, automatic: false };
  }

  const agents = await eligibleAgents();
  if (!agents.length) {
    return { assignedTo: String(fallback), mode, automatic: false };
  }

  if (mode === 'by_locality') {
    const owner = await localityOwner(locality);
    if (owner) return { assignedTo: String(owner), mode, automatic: true };
  }

  const chosen = await leastLoaded(agents);
  return {
    assignedTo: String(chosen || fallback),
    mode,
    automatic: Boolean(chosen),
  };
}

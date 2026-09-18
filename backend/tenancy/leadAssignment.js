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

/**
 * Assign a whole batch in one go.
 *
 * `chooseAssignee` costs two aggregates per call, which is fine for one lead
 * arriving from a form and ruinous for an import: a 5,000-row portal export
 * became 10,000 queries, each slower than the last as the rows it had just
 * written changed the counts.
 *
 * This reads the agents and their current load ONCE, then deals the batch out
 * in memory — keeping round robin's actual promise, which is an even spread,
 * rather than re-deriving it per row.
 *
 * @param {number} count how many leads to assign
 * @param {object} opts
 * @param {string} opts.fallback owner when no rule applies
 * @returns {Promise<{assignees: string[], mode: string, automatic: boolean}>}
 */
export async function chooseAssigneesForBatch(count, { fallback } = {}) {
  const mode = getTenant()?.workflow?.leadAssignment || 'manual';

  if (mode === 'manual' || count <= 0) {
    return { assignees: Array(Math.max(0, count)).fill(String(fallback)), mode, automatic: false };
  }

  const agents = await eligibleAgents();
  if (!agents.length) {
    return { assignees: Array(count).fill(String(fallback)), mode, automatic: false };
  }

  // Current open load per agent, read once.
  const counts = await Client.aggregate([
    { $match: { isDeleted: { $ne: true }, status: { $nin: ['won', 'lost'] } } },
    { $group: { _id: '$assignedTo', n: { $sum: 1 } } },
  ]);

  const load = new Map(agents.map((a) => [String(a._id), 0]));
  counts.forEach((c) => {
    const id = String(c._id);
    if (load.has(id)) load.set(id, c.n);
  });

  const assignees = [];
  for (let i = 0; i < count; i += 1) {
    // Always hand the next lead to whoever is currently lightest, counting the
    // ones this batch has already dealt out.
    let best = null;
    let bestLoad = Infinity;
    for (const agent of agents) {
      const id = String(agent._id);
      const n = load.get(id) ?? 0;
      if (n < bestLoad) {
        best = id;
        bestLoad = n;
      }
    }

    assignees.push(best || String(fallback));
    if (best) load.set(best, bestLoad + 1);
  }

  return { assignees, mode, automatic: true };
}

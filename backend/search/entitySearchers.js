// Per-entity search functions. Each function:
//   • enforces ABAC (category scope for employees, role gates for admin-only)
//   • applies structured filters from the NLP parser
//   • scores and highlights results
//   • returns a uniform { entity, label, icon, items[] } shape

import Client            from '../models/client.model.js';
import Owner             from '../models/owner.model.js';
import BuyerRequirement  from '../models/buyerRequirement.model.js';
import Task              from '../models/task.model.js';
import User              from '../models/user.model.js';
import { buildFuzzyRegex } from '../utils/search.js';
import { searchListings as runListingSearch } from './listingSearch.js';
import { fmtPrice } from './parser.js';

const DEFAULT_LIMIT = 5;

/**
 * The caller's own id, as a string.
 *
 * `verifyToken` builds req.user as `{ id, email, username, ... }` — there is no
 * `_id` on it. Reading `user._id` yields undefined, and Mongoose DROPS undefined
 * values out of a query filter rather than matching on them, so an ABAC clause
 * written as `assignedTo: user._id` disappears at runtime: the restriction reads
 * as present in the source and is simply absent in the query. Resolve it here,
 * once, and throw rather than silently widen if there is no identity at all.
 */
function actorId(user) {
  const id = user?.id || user?._id;
  if (!id) throw new Error('entitySearchers: no caller identity — refusing to run an unscoped search.');
  return String(id);
}

// ─── Listings ────────────────────────────────────────────────────────────────

export async function searchListings(parsed, user, limit = DEFAULT_LIMIT) {
  const { filters, remaining } = parsed;

  if (!remaining && !filters.hasStructuredFilters) {
    return emptyGroup('listings', 'Properties', 'property');
  }

  // Delegates to the one search service, so the palette, the board and the
  // public search agree on what matches and on who may see it.
  //
  // This used to take the twenty NEWEST matches and only then score them for
  // relevance, so an exact name match was invisible if twenty newer listings
  // also matched loosely. Ranking now happens in the database, over the whole
  // matching set.
  const { listings } = await runListingSearch({
    q: [remaining, filters._locationHint, filters._sectorHint].filter(Boolean).join(' '),
    params: {
      status: filters.status,
      propertyType: filters.propertyType,
      minPrice: filters.minPrice,
      maxPrice: filters.maxPrice,
      minBedrooms: filters.bedrooms,
      minBathrooms: filters.bathrooms,
    },
    user,
    limit,
    skip: 0,
    sort: 'relevance',
    projection: 'name address city locality regularPrice bedrooms propertyType status createdAt',
  });

  return {
    entity: 'listings',
    label: 'Properties',
    icon: 'property',
    items: listings.map((d) => ({
      _id: d._id,
      title: d.name,
      subtitle: [d.address, d.city].filter(Boolean).join(', '),
      meta: [
        d.bedrooms ? `${d.bedrooms} BHK` : null,
        d.regularPrice ? fmtPrice(d.regularPrice) : null,
      ].filter(Boolean).join(' · '),
      url: `/listing/${d._id}`,
      score: d.score ?? 1,
    })),
  };
}

// ─── Clients (Leads) ─────────────────────────────────────────────────────────

export async function searchClients(parsed, user, limit = DEFAULT_LIMIT) {
  const { remaining, filters } = parsed;
  if (!remaining || remaining.length < 2) return emptyGroup('clients', 'Leads / Clients', 'client');

  // Same rule the list endpoint enforces (client.controller.js): an admin sees
  // the workspace, everyone else sees only what is assigned to them. The palette
  // must not be a way around the controller.
  const must = { isDeleted: { $ne: true } };
  if (user.role !== 'admin') must.assignedTo = actorId(user);

  const regex = buildFuzzyRegex(remaining, { fuzzyLevel: 'medium' });
  const docs = await Client.find({
    ...must,
    $or: [
      { name: regex }, { email: regex }, { phone: regex },
      { notes: regex }, { requirements: regex },
    ],
  })
    .select('name email phone city deals _id updatedAt')
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();

  return {
    entity: 'clients',
    label:  'Leads / Clients',
    icon:   'client',
    items:  docs.map(d => {
      const active = (d.deals || []).filter(deal => !['closed_won', 'closed_lost'].includes(deal.stage));
      return {
        _id:      d._id,
        title:    d.name,
        subtitle: [d.email, d.phone].filter(Boolean).join(' · '),
        meta:     active.length ? `${active.length} active deal${active.length > 1 ? 's' : ''}` : (d.city || ''),
        url:      `/clients/${d._id}`,
        score:    1,
      };
    }),
  };
}

// ─── Owners ──────────────────────────────────────────────────────────────────

export async function searchOwners(parsed, user, limit = DEFAULT_LIMIT) {
  const { remaining } = parsed;
  if (!remaining || remaining.length < 2) return emptyGroup('owners', 'Property Owners', 'owner');

  const regex = buildFuzzyRegex(remaining, { fuzzyLevel: 'medium' });
  const docs = await Owner.find({
    isDeleted: { $ne: true },
    $or: [{ name: regex }, { email: regex }, { phone: regex }, { companyName: regex }],
  })
    .select('name email phone companyName city active _id')
    .limit(limit)
    .lean();

  return {
    entity: 'owners',
    label:  'Property Owners',
    icon:   'owner',
    items:  docs.map(d => ({
      _id:      d._id,
      title:    d.name,
      subtitle: [d.companyName, d.email].filter(Boolean).join(' · '),
      meta:     d.city || (d.active ? 'Active' : 'Inactive'),
      url:      `/owners`,
      score:    1,
    })),
  };
}

// ─── Buyer Requirements ───────────────────────────────────────────────────────

export async function searchBuyers(parsed, user, limit = DEFAULT_LIMIT) {
  const { remaining, filters } = parsed;
  if (!remaining || remaining.length < 2) return emptyGroup('buyers', 'Buyer Requirements', 'buyer');

  const regex = buildFuzzyRegex(remaining, { fuzzyLevel: 'medium' });

  const must = {};
  if (user.role === 'employee') must.assignedAgent = actorId(user);

  const docs = await BuyerRequirement.find({
    ...must,
    $or: [{ buyerName: regex }, { buyerEmail: regex }, { buyerPhone: regex }, { preferredCity: regex }, { preferredLocality: regex }],
  })
    .select('buyerName buyerPhone buyerEmail preferredCity maxPrice propertyTypeInterest _id createdAt')
    .limit(limit)
    .lean();

  return {
    entity: 'buyers',
    label:  'Buyer Requirements',
    icon:   'buyer',
    items:  docs.map(d => ({
      _id:      d._id,
      title:    d.buyerName,
      subtitle: [d.buyerPhone, d.buyerEmail].filter(Boolean).join(' · '),
      meta:     [d.preferredCity, d.maxPrice ? `Budget: ₹${fmtPrice(d.maxPrice)}` : null].filter(Boolean).join(' · '),
      url:      `/buyers`,
      score:    1,
    })),
  };
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export async function searchTasks(parsed, user, limit = DEFAULT_LIMIT) {
  const { remaining, filters } = parsed;
  if (!remaining || remaining.length < 2) return emptyGroup('tasks', 'Tasks', 'task');

  const regex = buildFuzzyRegex(remaining, { fuzzyLevel: 'medium' });
  const must = { isDeleted: { $ne: true }, assignedTo: actorId(user) };
  if (filters._dateRange) must.dueAt = filters._dateRange;

  const docs = await Task.find({
    ...must,
    $or: [{ title: regex }, { description: regex }],
  })
    .select('title description status priority dueAt _id')
    .sort({ dueAt: 1 })
    .limit(limit)
    .lean();

  return {
    entity: 'tasks',
    label:  'Tasks',
    icon:   'task',
    items:  docs.map(d => ({
      _id:      d._id,
      title:    d.title,
      subtitle: d.description?.slice(0, 80) || '',
      meta:     [d.priority, d.dueAt ? `Due ${new Date(d.dueAt).toLocaleDateString('en-IN')}` : null].filter(Boolean).join(' · '),
      url:      `/tasks`,
      score:    1,
    })),
  };
}

// ─── Users (admin only) ───────────────────────────────────────────────────────

export async function searchUsers(parsed, user, limit = DEFAULT_LIMIT) {
  if (user.role !== 'admin') return emptyGroup('users', 'Team Members', 'user');
  const { remaining } = parsed;
  if (!remaining || remaining.length < 2) return emptyGroup('users', 'Team Members', 'user');

  const regex = buildFuzzyRegex(remaining, { fuzzyLevel: 'medium' });
  const docs  = await User.find({
    isDeleted: { $ne: true },
    $or: [{ username: regex }, { firstName: regex }, { lastName: regex }, { email: regex }, { phone: regex }],
  })
    .select('username firstName lastName email role _id')
    .limit(limit)
    .lean();

  return {
    entity: 'users',
    label:  'Team Members',
    icon:   'user',
    items:  docs.map(d => ({
      _id:      d._id,
      title:    [d.firstName, d.lastName].filter(Boolean).join(' ') || d.username,
      subtitle: d.email,
      meta:     d.role,
      url:      `/admin`,
      score:    1,
    })),
  };
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function emptyGroup(entity, label, icon) {
  return { entity, label, icon, items: [] };
}

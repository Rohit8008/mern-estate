// Per-entity search functions. Each function:
//   • enforces ABAC (category scope for employees, role gates for admin-only)
//   • applies structured filters from the NLP parser
//   • scores and highlights results
//   • returns a uniform { entity, label, icon, items[] } shape

import Listing           from '../models/listing.model.js';
import Client            from '../models/client.model.js';
import Owner             from '../models/owner.model.js';
import BuyerRequirement  from '../models/buyerRequirement.model.js';
import Task              from '../models/task.model.js';
import User              from '../models/user.model.js';
import { buildFuzzyRegex, scoreDocument } from '../utils/search.js';
import { fmtPrice } from './parser.js';

const DEFAULT_LIMIT = 5;

// ─── Listings ────────────────────────────────────────────────────────────────

export async function searchListings(parsed, user, limit = DEFAULT_LIMIT) {
  const { filters, remaining } = parsed;

  const must = { isDeleted: { $ne: true } };

  // ABAC: employees are scoped to their assigned categories
  if (user.role === 'employee' && user.assignedCategories?.length) {
    must.category = { $in: user.assignedCategories };
  }

  // Structured filters from NLP
  if (filters.bedrooms)  must.bedrooms  = filters.bedrooms;
  if (filters.bathrooms) must.bathrooms = { $gte: filters.bathrooms };
  if (filters.status)    must.status    = filters.status;
  if (filters.propertyType) {
    must.propertyType = { $regex: filters.propertyType, $options: 'i' };
  }
  if (filters.minPrice || filters.maxPrice) {
    must.regularPrice = {};
    if (filters.minPrice) must.regularPrice.$gte = filters.minPrice;
    if (filters.maxPrice) must.regularPrice.$lte = filters.maxPrice;
  }

  const query = { ...must };

  if (remaining && remaining.length >= 2) {
    const regex  = buildFuzzyRegex(remaining, { fuzzyLevel: 'medium' });
    const orConds = [
      { name: regex }, { address: regex }, { city: regex },
      { locality: regex }, { areaName: regex }, { propertyNo: regex },
    ];

    // Location hint — boost city/locality/area matches
    if (filters._locationHint) {
      const locRe = new RegExp(filters._locationHint.split(/\s+/).join('|'), 'i');
      orConds.push({ city: locRe }, { locality: locRe }, { areaName: locRe }, { address: locRe });
    }
    // Sector hint
    if (filters._sectorHint) {
      const secRe = new RegExp(filters._sectorHint, 'i');
      orConds.push({ locality: secRe }, { address: secRe });
    }

    query.$or = orConds;
  } else if (!filters.hasStructuredFilters && !remaining) {
    return emptyGroup('listings', 'Properties', 'property');
  }

  const raw = await Listing.find(query)
    .select('name address city locality regularPrice bedrooms propertyType status _id createdAt')
    .sort({ createdAt: -1 })
    .limit(limit * 4) // oversample for relevance scoring
    .lean();

  // scoreDocument expects an array of terms, not a raw string
  const terms = remaining ? remaining.split(/\s+/).filter(Boolean) : [];

  const scored = raw
    .map(d => ({ ...d, _score: terms.length ? scoreDocument(d, terms).normalizedScore : 1 }))
    .sort((a, b) => b._score - a._score)
    .slice(0, limit);

  return {
    entity: 'listings',
    label:  'Properties',
    icon:   'property',
    items:  scored.map(d => ({
      _id:      d._id,
      title:    d.name,
      subtitle: [d.address, d.city].filter(Boolean).join(', '),
      meta:     [d.bedrooms ? `${d.bedrooms} BHK` : null, d.regularPrice ? fmtPrice(d.regularPrice) : null].filter(Boolean).join(' · '),
      url:      `/listing/${d._id}`,
      score:    d._score,
    })),
  };
}

// ─── Clients (Leads) ─────────────────────────────────────────────────────────

export async function searchClients(parsed, user, limit = DEFAULT_LIMIT) {
  const { remaining, filters } = parsed;
  if (!remaining || remaining.length < 2) return emptyGroup('clients', 'Leads / Clients', 'client');

  const must = { isDeleted: { $ne: true } };

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
  if (user.role === 'employee') must.assignedAgent = user._id;

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
  const must = { isDeleted: { $ne: true }, assignedTo: user._id };
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

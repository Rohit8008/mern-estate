import { parseQuery }    from '../search/parser.js';
import {
  searchListings,
  searchClients,
  searchOwners,
  searchBuyers,
  searchTasks,
  searchUsers,
} from '../search/entitySearchers.js';
import SavedSearch from '../models/savedSearch.model.js';
import SearchLog   from '../models/searchLog.model.js';
import { errorHandler } from '../utils/error.js';

// Priority order when entity filter is not specified
const ALL_ENTITIES = ['listings', 'clients', 'owners', 'buyers', 'tasks', 'users'];

const SEARCHERS = {
  listings: searchListings,
  clients:  searchClients,
  owners:   searchOwners,
  buyers:   searchBuyers,
  tasks:    searchTasks,
  users:    searchUsers,
};

// GET /api/search?q=...&entities=listings,clients&limit=5
export const globalSearch = async (req, res, next) => {
  const start = Date.now();
  try {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) {
      return res.json({ groups: [], query: q, annotations: [], totalResults: 0, responseTimeMs: 0 });
    }

    const limitPerEntity  = Math.min(parseInt(req.query.limit, 10) || 5, 10);
    const entityParam     = req.query.entities;
    const parsed          = parseQuery(q);

    // Decide which entities to fan out to
    let entities = entityParam
      ? entityParam.split(',').filter(e => SEARCHERS[e])
      : parsed.filters._entityHints?.length
        ? parsed.filters._entityHints.filter(e => SEARCHERS[e])
        : ALL_ENTITIES;

    // Run all entity searches in parallel (ABAC enforced inside each searcher)
    const results = await Promise.all(
      entities.map(entity => SEARCHERS[entity](parsed, req.user, limitPerEntity))
    );

    const groups       = results.filter(g => g.items.length > 0);
    const totalResults = groups.reduce((sum, g) => sum + g.items.length, 0);
    const responseTimeMs = Date.now() - start;

    // Fire-and-forget analytics log
    const resultCounts = Object.fromEntries(results.map(g => [g.entity, g.items.length]));
    SearchLog.create({
      userId: req.user?.id,
      query: q,
      parsedFilters: parsed.filters,
      entities,
      resultCounts,
      responseTimeMs,
      ip: req.ip,
    }).catch(() => {});

    return res.json({
      groups,
      query: q,
      annotations:   parsed.annotations,
      parsedFilters: parsed.filters,
      totalResults,
      responseTimeMs,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/search/suggest?q=...
// Cross-entity autocomplete (property names + client names)
export const getSuggestions = async (req, res, next) => {
  const q = (req.query.q || '').trim();
  if (!q || q.length < 2) return res.json({ suggestions: [] });

  try {
    const [listingSuggestions, clientSuggestions] = await Promise.all([
      getListingSuggestions(q, req.user),
      getClientSuggestions(q, req.user),
    ]);

    const suggestions = [...listingSuggestions, ...clientSuggestions].slice(0, 10);
    return res.json({ suggestions });
  } catch (err) {
    next(err);
  }
};

async function getListingSuggestions(q, user) {
  const Listing = (await import('../models/listing.model.js')).default;
  const prefix  = new RegExp(`^${escapeRe(q)}`, 'i');
  const contains = new RegExp(escapeRe(q), 'i');

  const abac = user?.role === 'employee' && user.assignedCategories?.length
    ? { category: { $in: user.assignedCategories } }
    : {};

  const [names, cities, localities] = await Promise.all([
    Listing.find({ isDeleted: { $ne: true }, ...abac, name: prefix }).select('name').limit(4).lean(),
    Listing.distinct('city', { isDeleted: { $ne: true }, city: contains }),
    Listing.distinct('locality', { isDeleted: { $ne: true }, locality: contains }),
  ]);

  return [
    ...names.map(d => ({ text: d.name, type: 'property', priority: 4 })),
    ...cities.slice(0, 2).map(c => ({ text: c, type: 'city', priority: 3 })),
    ...localities.slice(0, 2).map(l => ({ text: l, type: 'locality', priority: 2 })),
  ];
}

async function getClientSuggestions(q, user) {
  if (!user) return [];
  const Client = (await import('../models/client.model.js')).default;
  const regex  = new RegExp(`^${escapeRe(q)}`, 'i');
  const must   = { isDeleted: { $ne: true }, $or: [{ name: regex }, { phone: regex }] };

  const docs = await Client.find(must).select('name phone').limit(3).lean();
  return docs.map(d => ({ text: d.name, type: 'client', meta: d.phone, priority: 3 }));
}

// POST /api/search/click — track which result a user opened
export const trackClick = async (req, res, next) => {
  try {
    const { query, entity, id } = req.body;
    if (!query || !entity || !id) return res.json({ ok: true });

    await SearchLog.findOneAndUpdate(
      { userId: req.user.id, query, createdAt: { $gte: new Date(Date.now() - 5 * 60_000) } },
      { $set: { clickedResult: { entity, id } } },
      { sort: { createdAt: -1 } }
    );

    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

// ─── Saved searches ───────────────────────────────────────────────────────────

export const listSavedSearches = async (req, res, next) => {
  try {
    const searches = await SavedSearch.find({ userId: req.user.id, isDeleted: false })
      .sort({ isPinned: -1, lastRanAt: -1 })
      .lean();
    return res.json(searches);
  } catch (err) {
    next(err);
  }
};

export const createSavedSearch = async (req, res, next) => {
  try {
    const { name, query, entities = [] } = req.body;
    if (!name?.trim()) return next(errorHandler(400, 'Name is required'));
    if (!query?.trim()) return next(errorHandler(400, 'Query is required'));

    const parsed = parseQuery(query);
    const search = await SavedSearch.create({
      userId: req.user.id,
      name:   name.trim(),
      query:  query.trim(),
      parsedFilters: parsed.filters,
      entities,
    });
    return res.status(201).json(search);
  } catch (err) {
    next(err);
  }
};

export const deleteSavedSearch = async (req, res, next) => {
  try {
    const search = await SavedSearch.findOne({ _id: req.params.id, userId: req.user.id });
    if (!search) return next(errorHandler(404, 'Saved search not found'));
    search.isDeleted = true;
    await search.save();
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

export const pinSavedSearch = async (req, res, next) => {
  try {
    const search = await SavedSearch.findOne({ _id: req.params.id, userId: req.user.id });
    if (!search) return next(errorHandler(404, 'Saved search not found'));
    search.isPinned = !search.isPinned;
    await search.save();
    return res.json(search);
  } catch (err) {
    next(err);
  }
};

// ─── Analytics (admin only) ───────────────────────────────────────────────────

export const getSearchAnalytics = async (req, res, next) => {
  if (req.user.role !== 'admin') return next(errorHandler(403, 'Admin only'));
  try {
    const since = new Date(Date.now() - 30 * 24 * 3_600_000);

    const [topQueries, entityDist, avgResponse, zeroResultQueries] = await Promise.all([
      SearchLog.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: '$query', count: { $sum: 1 }, avgMs: { $avg: '$responseTimeMs' }, clickRate: { $avg: { $cond: [{ $ifNull: ['$clickedResult', false] }, 1, 0] } } } },
        { $sort: { count: -1 } },
        { $limit: 20 },
      ]),
      SearchLog.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $unwind: '$entities' },
        { $group: { _id: '$entities', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      SearchLog.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: null, avgMs: { $avg: '$responseTimeMs' } } },
      ]),
      SearchLog.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $addFields: { total: { $sum: { $objectToArray: '$resultCounts' } } } },
        { $match: { 'total.v': { $eq: 0 } } },
        { $group: { _id: '$query', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
    ]);

    return res.json({
      topQueries,
      entityDist,
      avgResponseMs: avgResponse[0]?.avgMs ?? 0,
      zeroResultQueries,
    });
  } catch (err) {
    next(err);
  }
};

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

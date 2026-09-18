/**
 * The one place listings are searched.
 *
 * Three implementations used to exist — the board's `searchTerm`, the public
 * `searchListings`, and the ⌘K palette's entity searcher — with different
 * fields, different defaults and different access rules, so a property one
 * person could find was missing for another with no way to tell why. This
 * replaces all three.
 *
 * ── How matching works ───────────────────────────────────────────────────────
 * In tiers, stopping as soon as there are enough results. Each tier is more
 * permissive and more expensive than the last, so the common case — someone
 * typing a plot number or a sector — is answered by an index, and the slow
 * fuzzy pass only runs when the precise ones found nothing.
 *
 *   1. IDENTIFIER   propertyNo / pincode / id — exact. A broker typing "P-1147"
 *                   wants that plot, not a neighbourhood of things like it.
 *   2. TEXT         MongoDB's own text index, ranked by textScore. This is what
 *                   the collection has an index for and what Mongo is good at.
 *   3. PREFIX       Anchored `^term` on city / locality / areaName / name.
 *                   Anchored, so it can use an index; answers "Sush…" which
 *                   $text cannot, since it matches whole words.
 *   4. FUZZY        The old unanchored regex, as a last resort and only against
 *                   a set the filters have already narrowed.
 *
 * Ranking and paging happen in the database. The previous implementation pulled
 * 500 rows into Node, scored them there, and sliced — so `total` was the size
 * of that truncated pull rather than the number of matches, and page 42 was
 * empty even when matches existed.
 */

import Listing from '../models/listing.model.js';
import mongoose from 'mongoose';
import { listingScope } from '../middleware/permissions.js';
import { buildFuzzyRegex, tokenize } from '../utils/search.js';

/** Below this many hits, the next tier is tried as well. */
const ENOUGH = 5;

/** Fields returned to a caller that hasn't asked for the full document. */
const LIST_PROJECTION =
  'name description address city locality areaName propertyNo regularPrice discountPrice ' +
  'offer bedrooms bathrooms areaSqFt sqYard imageUrls type propertyType propertyCategory ' +
  'status category createdAt location';

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Turn request query params into a Mongo filter.
 * Shared by search and by the facets endpoint, so a count and the rows it
 * describes can never be computed from different filters.
 */
export function buildListingFilter(params = {}, user, { defaultStatus = null } = {}) {
  const filter = { isDeleted: { $ne: true } };

  const eq = (key, value, transform = (v) => v) => {
    if (value === undefined || value === null || value === '' || value === 'all') return;
    filter[key] = transform(value);
  };

  eq('type', params.type);
  eq('category', params.category);
  eq('propertyCategory', params.propertyCategory);
  eq('propertyType', params.propertyType);
  eq('commercialType', params.commercialType);
  eq('plotType', params.plotType);
  eq('ownerIds', params.ownerId);

  // Status: an explicit value wins; otherwise the caller decides whether an
  // unfiltered search means "everything" (the CRM board) or "what's on the
  // market" (the public site).
  if (params.status && params.status !== 'all') filter.status = params.status;
  else if (defaultStatus) filter.status = defaultStatus;

  if (params.assignedAgent && params.assignedAgent !== 'all') {
    filter.assignedAgent = params.assignedAgent === 'unassigned' ? null : params.assignedAgent;
  }

  // Location is matched loosely — people type "gurgaon" for "Gurugram".
  ['city', 'locality'].forEach((key) => {
    const value = params[key];
    if (value && value.trim() && value !== 'all') {
      filter[key] = { $regex: escapeRe(value.trim()), $options: 'i' };
    }
  });

  // Ranges, applied only when a bound was actually given. A default ceiling
  // here is what used to hide every property above ₹10 Cr.
  const range = (field, min, max, parse = parseInt) => {
    const lo = parse(min, 10);
    const hi = parse(max, 10);
    if (!Number.isFinite(lo) && !Number.isFinite(hi)) return;
    filter[field] = {};
    if (Number.isFinite(lo)) filter[field].$gte = lo;
    if (Number.isFinite(hi)) filter[field].$lte = hi;
  };
  range('regularPrice', params.minPrice, params.maxPrice, parseFloat);
  range('areaSqFt', params.minAreaSqFt, params.maxAreaSqFt);

  const atLeast = (field, value) => {
    const n = parseInt(value, 10);
    if (Number.isFinite(n)) filter[field] = { $gte: n };
  };
  atLeast('bedrooms', params.minBedrooms ?? params.bedrooms);
  atLeast('bathrooms', params.minBathrooms ?? params.bathrooms);

  ['offer', 'furnished', 'parking'].forEach((key) => {
    if (params[key] === 'true' || params[key] === true) filter[key] = true;
  });

  // Access scope, merged with $and so a search's own $or cannot widen it.
  const scope = listingScope(user, { scope: params.scope === 'assigned' ? 'assigned' : 'all' });
  return Object.keys(scope).length ? { $and: [filter, scope] } : filter;
}

/** An identifier the user typed verbatim, rather than words to match. */
function identifierClause(q) {
  const term = q.trim();
  const clauses = [{ propertyNo: { $regex: `^${escapeRe(term)}$`, $options: 'i' } }];

  if (/^\d{6}$/.test(term)) clauses.push({ pincode: term });
  if (mongoose.isValidObjectId(term)) clauses.push({ _id: new mongoose.Types.ObjectId(term) });

  return { $or: clauses };
}

/** Anchored prefixes — index-usable, and what answers a half-typed word. */
function prefixClause(terms) {
  const clauses = [];
  terms.forEach((term) => {
    const re = { $regex: `^${escapeRe(term)}`, $options: 'i' };
    clauses.push({ city: re }, { locality: re }, { areaName: re }, { name: re }, { propertyNo: re });
  });
  return { $or: clauses };
}

/** The permissive last resort. */
function fuzzyClause(terms) {
  const clauses = [];
  terms.forEach((term) => {
    const re = buildFuzzyRegex(term, { fuzzyLevel: 'medium' });
    clauses.push(
      { name: re }, { address: re }, { city: re },
      { locality: re }, { areaName: re }, { propertyNo: re }
    );
  });
  return { $or: clauses };
}

const SORTABLE = new Set(['createdAt', 'regularPrice', 'areaSqFt', 'name', 'status', 'updatedAt']);

function sortStage(sort, order, hasTextScore) {
  const direction = order === 'asc' ? 1 : -1;
  if (sort && sort !== 'relevance' && SORTABLE.has(sort)) {
    // A stable tiebreak on _id, so paging cannot repeat or skip a row when
    // several share the same sort value.
    return { [sort]: direction, _id: -1 };
  }
  return hasTextScore
    ? { score: { $meta: 'textScore' }, createdAt: -1, _id: -1 }
    : { createdAt: -1, _id: -1 };
}

/**
 * Run one tier and return its page plus a true total.
 *
 * `$facet` gives both from a single pass, so the count always describes exactly
 * the rows returned — the two cannot drift the way a separate countDocuments
 * can when the filters are built twice.
 */
async function runTier({ filter, sort, order, limit, skip, projection, useText }) {
  const pipeline = [{ $match: filter }];

  if (useText) {
    pipeline.push({ $addFields: { score: { $meta: 'textScore' } } });
  }

  pipeline.push({
    $facet: {
      rows: [
        { $sort: sortStage(sort, order, useText) },
        { $skip: skip },
        { $limit: limit },
        { $project: projection },
      ],
      total: [{ $count: 'value' }],
    },
  });

  const [result] = await Listing.aggregate(pipeline);
  return {
    listings: result?.rows || [],
    total: result?.total?.[0]?.value || 0,
  };
}

/** Mongo projection object from the space-separated field list. */
function projectionFor(fields) {
  return fields.split(/\s+/).filter(Boolean).reduce((p, f) => ({ ...p, [f]: 1 }), { _id: 1 });
}

/**
 * Search listings.
 *
 * @param {object}  input
 * @param {string} [input.q]       what the user typed
 * @param {object}  input.params   filters, straight from the query string
 * @param {object} [input.user]    req.user, for access scoping
 * @param {number} [input.limit]
 * @param {number} [input.skip]
 * @param {string} [input.sort]    'relevance' or a sortable field
 * @param {string} [input.order]
 * @param {string} [input.defaultStatus]
 * @returns {Promise<{listings: object[], total: number, tier: string, tookMs: number}>}
 */
export async function searchListings({
  q = '',
  params = {},
  user,
  limit = 20,
  skip = 0,
  sort = 'relevance',
  order = 'desc',
  defaultStatus = null,
  projection = LIST_PROJECTION,
} = {}) {
  const started = Date.now();
  const base = buildListingFilter(params, user, { defaultStatus });
  const proj = projectionFor(projection);
  const term = String(q || '').trim();

  const withClause = (clause) => (clause ? { $and: [base, clause] } : base);

  // No search term: filters and sorting only.
  if (!term) {
    const out = await runTier({
      filter: base, sort, order, limit, skip, projection: proj, useText: false,
    });
    return { ...out, tier: 'filters', tookMs: Date.now() - started };
  }

  const terms = tokenize(term);

  // ── 1. identifier ─────────────────────────────────────────────────────────
  const byId = await runTier({
    filter: withClause(identifierClause(term)),
    sort: sort === 'relevance' ? 'createdAt' : sort,
    order, limit, skip, projection: proj, useText: false,
  });
  if (byId.total > 0) return { ...byId, tier: 'identifier', tookMs: Date.now() - started };

  // ── 2. text index ─────────────────────────────────────────────────────────
  const byText = await runTier({
    filter: { $and: [base, { $text: { $search: term } }] },
    sort, order, limit, skip, projection: proj, useText: true,
  });
  if (byText.total >= ENOUGH) return { ...byText, tier: 'text', tookMs: Date.now() - started };

  // ── 3. anchored prefix ────────────────────────────────────────────────────
  const byPrefix = await runTier({
    filter: withClause(prefixClause(terms.length ? terms : [term])),
    sort: sort === 'relevance' ? 'createdAt' : sort,
    order, limit, skip, projection: proj, useText: false,
  });
  if (byPrefix.total >= ENOUGH || byPrefix.total > byText.total) {
    return { ...byPrefix, tier: 'prefix', tookMs: Date.now() - started };
  }

  // ── 4. fuzzy ──────────────────────────────────────────────────────────────
  const byFuzzy = await runTier({
    filter: withClause(fuzzyClause(terms.length ? terms : [term])),
    sort: sort === 'relevance' ? 'createdAt' : sort,
    order, limit, skip, projection: proj, useText: false,
  });
  if (byFuzzy.total > 0) return { ...byFuzzy, tier: 'fuzzy', tookMs: Date.now() - started };

  // Nothing anywhere — return the best-ranked empty result so the caller still
  // has a consistent shape.
  return { ...byText, tier: 'none', tookMs: Date.now() - started };
}

/**
 * Counts per facet across the WHOLE filtered set, not one page.
 *
 * The properties board groups its pipeline columns and plots its map from
 * whatever page happens to be loaded, so a column header counts a 50-row sample
 * and presents it as the total. These are the real numbers.
 */
export async function getListingFacets({ params = {}, user, defaultStatus = null } = {}) {
  const filter = buildListingFilter(params, user, { defaultStatus });

  const [result] = await Listing.aggregate([
    { $match: filter },
    {
      $facet: {
        status: [{ $group: { _id: '$status', count: { $sum: 1 } } }, { $sort: { count: -1 } }],
        category: [{ $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 50 }],
        city: [{ $group: { _id: '$city', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 50 }],
        locality: [{ $group: { _id: '$locality', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 50 }],
        type: [{ $group: { _id: '$type', count: { $sum: 1 } } }],
        assignedAgent: [{ $group: { _id: '$assignedAgent', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 50 }],
        totals: [
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              // Placeholder prices are stored as 0; averaging them in would
              // drag every figure down and make the number meaningless.
              totalValue: { $sum: '$regularPrice' },
              avgPrice: { $avg: { $cond: [{ $gt: ['$regularPrice', 0] }, '$regularPrice', null] } },
            },
          },
        ],
      },
    },
  ]);

  const asMap = (rows) =>
    (rows || []).reduce((out, r) => {
      const key = r._id === null || r._id === '' ? '(none)' : String(r._id);
      out[key] = r.count;
      return out;
    }, {});

  return {
    status: asMap(result?.status),
    category: asMap(result?.category),
    city: asMap(result?.city),
    locality: asMap(result?.locality),
    type: asMap(result?.type),
    assignedAgent: asMap(result?.assignedAgent),
    totals: {
      count: result?.totals?.[0]?.count || 0,
      totalValue: result?.totals?.[0]?.totalValue || 0,
      avgPrice: Math.round(result?.totals?.[0]?.avgPrice || 0),
    },
  };
}

export { LIST_PROJECTION };

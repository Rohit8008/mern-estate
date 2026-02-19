import {
  asyncHandler,
  sendSuccessResponse,
  ValidationError,
} from '../utils/error.js';
import { logger } from '../utils/logger.js';

// Simple in-memory cache with TTL (1 hour)
const cache = new Map();
const CACHE_TTL = 60 * 60 * 1000;

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  // Cap cache size at 500 entries
  if (cache.size > 500) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
  cache.set(key, { data, ts: Date.now() });
}

// Shared fetch with User-Agent (Nominatim requires it)
async function nominatimFetch(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'MernEstateCRM/1.0' },
  });
  if (!res.ok) {
    throw new Error(`Nominatim returned ${res.status}`);
  }
  return res.json();
}

// Parse a Nominatim result into a clean address object
function parseNominatimResult(item) {
  const addr = item.address || {};
  const parts = [];
  if (addr.house_number) parts.push(addr.house_number);
  if (addr.road) parts.push(addr.road);
  if (addr.neighbourhood) parts.push(addr.neighbourhood);
  if (addr.suburb) parts.push(addr.suburb);

  const streetAddress =
    parts.length > 0
      ? parts.join(', ')
      : (item.display_name || '').split(',').slice(0, 3).join(',').trim();

  return {
    lat: parseFloat(item.lat),
    lng: parseFloat(item.lon),
    address: streetAddress,
    city:
      addr.city ||
      addr.town ||
      addr.village ||
      addr.county ||
      addr.district ||
      '',
    locality: addr.suburb || addr.neighbourhood || addr.quarter || '',
    state: addr.state || '',
    pincode: addr.postcode || '',
    displayName: item.display_name || '',
  };
}

/**
 * GET /api/geocode/search?q=some+address&limit=5
 * Forward geocoding — address string → coordinates + structured address
 */
export const searchAddress = asyncHandler(async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q || q.length < 2) {
    throw new ValidationError('Query must be at least 2 characters', 'q');
  }

  const limit = Math.min(parseInt(req.query.limit, 10) || 5, 10);
  const cacheKey = `search:${q}:${limit}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return sendSuccessResponse(res, cached, 'Cached results');
  }

  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
    q
  )}&limit=${limit}&countrycodes=in&addressdetails=1`;

  const raw = await nominatimFetch(url);
  const results = (raw || []).map(parseNominatimResult);

  setCache(cacheKey, results);
  sendSuccessResponse(res, results, 'Address search results');
});

/**
 * GET /api/geocode/reverse?lat=28.61&lng=77.20
 * Reverse geocoding — coordinates → structured address
 */
export const reverseGeocode = asyncHandler(async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);

  if (isNaN(lat) || isNaN(lng)) {
    throw new ValidationError('Valid lat and lng are required', 'lat');
  }

  // Round to 5 decimals for cache key (~1 m accuracy)
  const rlat = lat.toFixed(5);
  const rlng = lng.toFixed(5);
  const cacheKey = `reverse:${rlat}:${rlng}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return sendSuccessResponse(res, cached, 'Cached result');
  }

  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;

  const raw = await nominatimFetch(url);
  if (!raw || !raw.display_name) {
    return sendSuccessResponse(res, null, 'No results found');
  }

  const result = parseNominatimResult(raw);
  setCache(cacheKey, result);
  sendSuccessResponse(res, result, 'Reverse geocode result');
});

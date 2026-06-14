// Real-estate NLP query parser.
// Extracts structured filters from natural language before passing the
// remaining text to MongoDB regex search.
//
// Examples:
//   "3 BHK in Gurgaon under 2 Cr"
//     → { bedrooms: 3, maxPrice: 20000000, _locationHint: "Gurgaon" }
//   "Ready to move apartments in Sector 54"
//     → { status: "available", propertyType: "apartment", _sectorHint: "Sector 54" }
//   "Leads assigned to Amit this month"
//     → { _entityHints: ["clients"], _assignedToName: "Amit", _dateRange: { $gte: ... } }

const PRICE_MULTIPLIERS = {
  cr: 1e7, crore: 1e7, crores: 1e7,
  l: 1e5, lac: 1e5, lakh: 1e5, lakhs: 1e5, lacs: 1e5,
  k: 1e3, thousand: 1e3,
};

const PROPERTY_TYPES = {
  apartment: ['apartment', 'flat', 'flats', 'apartments'],
  villa:     ['villa', 'villas', 'bungalow', 'bungalows'],
  plot:      ['plot', 'plots', 'land', 'lands', 'site', 'sites'],
  floor:     ['floor', 'floors', 'builder floor', 'builder-floor'],
  commercial:['office', 'shop', 'showroom', 'retail', 'commercial'],
  penthouse: ['penthouse', 'penthouses'],
  studio:    ['studio'],
};

const STATUS_KEYWORDS = {
  available:           ['ready to move', 'ready-to-move', 'rtm', 'immediate possession', 'ready possession'],
  under_construction:  ['under construction', 'upcoming', 'new launch', 'pre-launch', 'prelaunch'],
};

const DATE_RANGES = {
  today: () => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return { $gte: d };
  },
  'this week': () => {
    const d = new Date(); d.setDate(d.getDate() - 7); return { $gte: d };
  },
  'this month': () => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return { $gte: d };
  },
  'last month': () => {
    const start = new Date(); start.setMonth(start.getMonth() - 1, 1); start.setHours(0, 0, 0, 0);
    const end   = new Date(); end.setDate(0); end.setHours(23, 59, 59, 999);
    return { $gte: start, $lte: end };
  },
  'last week': () => {
    const d = new Date(); d.setDate(d.getDate() - 14); return { $gte: d };
  },
  'this year': () => {
    const d = new Date(); d.setMonth(0, 1); d.setHours(0, 0, 0, 0); return { $gte: d };
  },
};

const ENTITY_KEYWORDS = {
  listings: ['property', 'properties', 'listing', 'listings', 'flat', 'apartment', 'villa', 'plot'],
  clients:  ['lead', 'leads', 'client', 'clients', 'prospect', 'buyer contact'],
  deals:    ['deal', 'deals', 'pipeline', 'transaction', 'sale'],
  owners:   ['owner', 'owners', 'landlord', 'seller'],
  tasks:    ['task', 'tasks', 'reminder', 'follow-up', 'followup', 'todo'],
  buyers:   ['requirement', 'requirements', 'buyer req'],
};

// ─── Public API ──────────────────────────────────────────────────────────────

export function parseQuery(raw) {
  let q = (raw || '').trim();
  const filters = {};
  const annotations = []; // chips shown below the search bar

  // 1. Detect entity type hints
  const entityHints = detectEntityHints(q);
  if (entityHints.length) filters._entityHints = entityHints;

  // 2. BHK
  const bhkMatch = q.match(/(\d+)\s*bhk/i);
  if (bhkMatch) {
    filters.bedrooms = parseInt(bhkMatch[1], 10);
    annotations.push({ label: `${bhkMatch[1]} BHK`, icon: 'bed' });
    q = q.replace(bhkMatch[0], ' ');
  }

  // 3. Bathrooms
  const bathMatch = q.match(/(\d+)\+?\s*bath(?:room)?s?/i);
  if (bathMatch) {
    filters.bathrooms = parseInt(bathMatch[1], 10);
    annotations.push({ label: `${bathMatch[1]} Bath`, icon: 'bath' });
    q = q.replace(bathMatch[0], ' ');
  }

  // 4. Price range
  extractPriceFilters(q, filters, annotations);
  q = stripPriceExpressions(q);

  // 5. Property status
  for (const [status, keywords] of Object.entries(STATUS_KEYWORDS)) {
    for (const kw of keywords) {
      if (q.toLowerCase().includes(kw)) {
        filters.status = status;
        annotations.push({ label: kw, icon: 'status' });
        q = q.replace(new RegExp(kw, 'gi'), ' ');
        break;
      }
    }
    if (filters.status) break;
  }

  // 6. Property type
  outer: for (const [type, keywords] of Object.entries(PROPERTY_TYPES)) {
    for (const kw of keywords) {
      if (new RegExp(`\\b${escapeRegex(kw)}s?\\b`, 'i').test(q)) {
        filters.propertyType = type;
        annotations.push({ label: type, icon: 'type' });
        q = q.replace(new RegExp(`\\b${escapeRegex(kw)}s?\\b`, 'gi'), ' ');
        break outer;
      }
    }
  }

  // 7. Sector (real-estate specific)
  const sectorMatch = q.match(/sector\s*[-#]?\s*(\d+[A-Za-z]?)/i);
  if (sectorMatch) {
    filters._sectorHint = `Sector ${sectorMatch[1]}`;
    annotations.push({ label: filters._sectorHint, icon: 'location' });
    // keep in q for text search too
  }

  // 8. "assigned to X"
  const assignedMatch = q.match(/assigned\s+to\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/i);
  if (assignedMatch) {
    filters._assignedToName = assignedMatch[1].trim();
    annotations.push({ label: `Agent: ${filters._assignedToName}`, icon: 'agent' });
    q = q.replace(assignedMatch[0], ' ');
  }

  // 9. Location hint: "in X", "near X"
  const locationMatch = q.match(/(?:in|near|around|at)\s+([A-Za-z][A-Za-z\s-]{2,30})(?:\s|,|$)/i);
  if (locationMatch) {
    filters._locationHint = locationMatch[1].trim();
    annotations.push({ label: filters._locationHint, icon: 'location' });
  }

  // 10. Date range
  for (const [phrase, buildRange] of Object.entries(DATE_RANGES)) {
    if (q.toLowerCase().includes(phrase)) {
      filters._dateRange = buildRange();
      annotations.push({ label: phrase, icon: 'date' });
      q = q.replace(new RegExp(phrase, 'gi'), ' ');
      break;
    }
  }

  // Clean remaining text (strip stopwords + extra whitespace)
  const remaining = q
    .replace(/\b(?:in|near|at|on|of|the|a|an|and|or|for|with|from|under|above|by|to|is|are|was|were)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    filters,
    remaining,
    annotations,
    original: raw,
    hasStructuredFilters: Object.keys(filters).filter(k => !k.startsWith('_')).length > 0,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractPriceFilters(q, filters, annotations) {
  // "between X and Y Cr"
  const betweenMatch = q.match(
    /between\s+([\d.,]+)\s*(cr(?:ore)?s?|l(?:akh)?s?|lac?s?|k)?\s*(?:and|to|-)\s*([\d.,]+)\s*(cr(?:ore)?s?|l(?:akh)?s?|lac?s?|k)?/i
  );
  if (betweenMatch) {
    const u1 = betweenMatch[2] ? priceUnit(betweenMatch[2]) : 1;
    const u2 = betweenMatch[4] ? priceUnit(betweenMatch[4]) : u1;
    filters.minPrice = parseNum(betweenMatch[1]) * u1;
    filters.maxPrice = parseNum(betweenMatch[3]) * u2;
    annotations.push({ label: `₹${fmtPrice(filters.minPrice)}–${fmtPrice(filters.maxPrice)}`, icon: 'price' });
    return;
  }

  // "under / below / upto X Cr"
  const maxMatch = q.match(
    /(?:under|below|upto|up to|within|max)\s+([\d.,]+)\s*(cr(?:ore)?s?|l(?:akh)?s?|lac?s?|k)?/i
  );
  if (maxMatch) {
    filters.maxPrice = parseNum(maxMatch[1]) * (maxMatch[2] ? priceUnit(maxMatch[2]) : 1);
    annotations.push({ label: `under ₹${fmtPrice(filters.maxPrice)}`, icon: 'price' });
  }

  // "above / over / more than X Cr"
  const minMatch = q.match(
    /(?:above|over|more than|min|minimum|starting)\s+([\d.,]+)\s*(cr(?:ore)?s?|l(?:akh)?s?|lac?s?|k)?/i
  );
  if (minMatch) {
    filters.minPrice = parseNum(minMatch[1]) * (minMatch[2] ? priceUnit(minMatch[2]) : 1);
    annotations.push({ label: `above ₹${fmtPrice(filters.minPrice)}`, icon: 'price' });
  }

  // Standalone "2 Cr" without qualifier → approximate range ±10%
  if (!filters.maxPrice && !filters.minPrice) {
    const standaloneMatch = q.match(/([\d.,]+)\s*(cr(?:ore)?s?|l(?:akh)?s?|lac?s?)/i);
    if (standaloneMatch) {
      const val = parseNum(standaloneMatch[1]) * priceUnit(standaloneMatch[2]);
      filters.minPrice = val * 0.9;
      filters.maxPrice = val * 1.1;
      annotations.push({ label: `~₹${fmtPrice(val)}`, icon: 'price' });
    }
  }
}

function stripPriceExpressions(q) {
  return q
    .replace(
      /(?:between|under|below|above|over|upto|up to|within|max|min|minimum|more than|starting)\s*[\d.,]+\s*(?:cr(?:ore)?s?|l(?:akh)?s?|lac?s?|k|thousand)?(?:\s*(?:and|to|-)\s*[\d.,]+\s*(?:cr(?:ore)?s?|l(?:akh)?s?|lac?s?|k)?)?/gi,
      ' '
    )
    .replace(/[\d.,]+\s*(?:cr(?:ore)?s?|l(?:akh)?s?|lac?s?)/gi, ' ')
    .trim();
}

function detectEntityHints(q) {
  const lower = q.toLowerCase();
  const hints = [];
  for (const [entity, keywords] of Object.entries(ENTITY_KEYWORDS)) {
    for (const kw of keywords) {
      if (new RegExp(`\\b${escapeRegex(kw)}s?\\b`).test(lower)) {
        hints.push(entity);
        break;
      }
    }
  }
  return hints;
}

function priceUnit(s = '') {
  const key = s.toLowerCase().replace(/s$/, '');
  return PRICE_MULTIPLIERS[key] || 1;
}

function parseNum(s) {
  return parseFloat((s || '0').replace(/,/g, '')) || 0;
}

export function fmtPrice(n) {
  if (!n) return '0';
  if (n >= 1e7) return `${(n / 1e7).toFixed(1)} Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(1)} L`;
  return Math.round(n).toLocaleString('en-IN');
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

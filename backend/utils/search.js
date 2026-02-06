/**
 * Professional Fuzzy Search Utility
 * Implements fast, typo-tolerant search with relevance scoring
 */

/**
 * Calculate Levenshtein distance between two strings
 * Used for fuzzy matching
 */
export function levenshteinDistance(str1, str2) {
  const m = str1.length;
  const n = str2.length;

  // Use a single array for space optimization
  const dp = Array(n + 1).fill(0).map((_, i) => i);

  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;

    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      if (str1[i - 1] === str2[j - 1]) {
        dp[j] = prev;
      } else {
        dp[j] = 1 + Math.min(prev, dp[j], dp[j - 1]);
      }
      prev = temp;
    }
  }

  return dp[n];
}

/**
 * Calculate similarity score (0-1) between two strings
 */
export function similarityScore(str1, str2) {
  if (!str1 || !str2) return 0;

  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 1;
  if (s1.includes(s2) || s2.includes(s1)) return 0.9;

  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1;

  const distance = levenshteinDistance(s1, s2);
  return Math.max(0, 1 - distance / maxLen);
}

/**
 * Generate n-grams for a string
 * Used for fuzzy matching and search optimization
 */
export function generateNgrams(text, n = 3) {
  if (!text || text.length < n) return [text?.toLowerCase() || ''];

  const normalized = text.toLowerCase().trim();
  const ngrams = [];

  for (let i = 0; i <= normalized.length - n; i++) {
    ngrams.push(normalized.substring(i, i + n));
  }

  return ngrams;
}

/**
 * Tokenize text for search
 * Handles special characters and common variations
 */
export function tokenize(text) {
  if (!text) return [];

  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 1)
    .map(token => token.trim());
}

/**
 * Generate search variations for fuzzy matching
 * Handles common typos and variations
 */
export function generateSearchVariations(term) {
  if (!term) return [];

  const normalized = term.toLowerCase().trim();
  const variations = [normalized];

  // Common character substitutions for typo tolerance
  const substitutions = {
    'a': ['e', 'o'],
    'e': ['a', 'i'],
    'i': ['e', 'y'],
    'o': ['a', 'u'],
    'u': ['o'],
    's': ['z'],
    'z': ['s'],
    'c': ['k', 's'],
    'k': ['c'],
    'ph': ['f'],
    'f': ['ph'],
  };

  // Generate variations with single character substitutions
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    const subs = substitutions[char];
    if (subs) {
      subs.forEach(sub => {
        variations.push(normalized.slice(0, i) + sub + normalized.slice(i + 1));
      });
    }
  }

  // Add prefix matching
  if (normalized.length > 3) {
    variations.push(normalized.slice(0, -1)); // Remove last char
  }

  return [...new Set(variations)];
}

/**
 * Build MongoDB regex patterns for fuzzy search
 */
export function buildFuzzyRegex(term, options = {}) {
  const {
    fuzzyLevel = 'medium', // 'strict', 'medium', 'loose'
    wordBoundary = false
  } = options;

  if (!term) return null;

  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  let pattern;
  switch (fuzzyLevel) {
    case 'strict':
      // Exact word match
      pattern = wordBoundary ? `\\b${escaped}\\b` : escaped;
      break;
    case 'loose':
      // Very flexible - allows characters between each letter
      pattern = escaped.split('').join('.*?');
      break;
    case 'medium':
    default:
      // Allow optional characters between words and typos
      pattern = escaped
        .split(/\s+/)
        .map(word => word.split('').join('.?'))
        .join('.*');
  }

  return new RegExp(pattern, 'i');
}

/**
 * Score a document based on search relevance
 */
export function scoreDocument(doc, searchTerms, weights = {}) {
  const defaultWeights = {
    name: 10,
    address: 7,
    city: 6,
    locality: 5,
    description: 3,
    propertyType: 4,
    category: 4,
    areaName: 5,
  };

  const fieldWeights = { ...defaultWeights, ...weights };
  let totalScore = 0;
  let matchedFields = [];

  searchTerms.forEach(term => {
    const termLower = term.toLowerCase();

    Object.entries(fieldWeights).forEach(([field, weight]) => {
      const value = doc[field];
      if (!value) return;

      const valueLower = String(value).toLowerCase();

      // Exact match
      if (valueLower === termLower) {
        totalScore += weight * 3;
        matchedFields.push({ field, type: 'exact' });
      }
      // Starts with
      else if (valueLower.startsWith(termLower)) {
        totalScore += weight * 2;
        matchedFields.push({ field, type: 'prefix' });
      }
      // Contains
      else if (valueLower.includes(termLower)) {
        totalScore += weight;
        matchedFields.push({ field, type: 'contains' });
      }
      // Fuzzy match
      else {
        const similarity = similarityScore(termLower, valueLower);
        if (similarity > 0.7) {
          totalScore += weight * similarity;
          matchedFields.push({ field, type: 'fuzzy', score: similarity });
        }

        // Check individual words in the value
        const words = tokenize(valueLower);
        words.forEach(word => {
          const wordSimilarity = similarityScore(termLower, word);
          if (wordSimilarity > 0.8) {
            totalScore += (weight * 0.5) * wordSimilarity;
          }
        });
      }
    });
  });

  return {
    score: totalScore,
    matchedFields,
    normalizedScore: Math.min(totalScore / (searchTerms.length * 30), 1)
  };
}

/**
 * Build optimized MongoDB query for search
 */
export function buildSearchQuery(searchTerm, options = {}) {
  const {
    fuzzyLevel = 'medium',
    useTextIndex = true,
    additionalFilters = {},
  } = options;

  if (!searchTerm || !searchTerm.trim()) {
    return additionalFilters;
  }

  const terms = tokenize(searchTerm);
  const query = { ...additionalFilters };

  if (terms.length === 0) {
    return query;
  }

  // Build $or conditions for each searchable field
  const searchConditions = [];

  terms.forEach(term => {
    const fuzzyRegex = buildFuzzyRegex(term, { fuzzyLevel });
    const variations = generateSearchVariations(term);

    // Primary regex search
    searchConditions.push(
      { name: fuzzyRegex },
      { address: fuzzyRegex },
      { city: fuzzyRegex },
      { locality: fuzzyRegex },
      { description: fuzzyRegex },
      { areaName: fuzzyRegex }
    );

    // Add variation searches for typo tolerance
    variations.slice(1, 4).forEach(variation => {
      const varRegex = new RegExp(variation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      searchConditions.push(
        { name: varRegex },
        { city: varRegex },
        { locality: varRegex }
      );
    });
  });

  query.$or = searchConditions;

  return query;
}

/**
 * Search suggestions/autocomplete
 */
export function generateSuggestions(searchTerm, documents, options = {}) {
  const { limit = 5, fields = ['name', 'city', 'locality', 'address'] } = options;

  if (!searchTerm || !documents.length) return [];

  const termLower = searchTerm.toLowerCase().trim();
  const suggestions = new Map();

  documents.forEach(doc => {
    fields.forEach(field => {
      const value = doc[field];
      if (!value) return;

      const valueLower = String(value).toLowerCase();

      // Prefix match gets highest priority
      if (valueLower.startsWith(termLower)) {
        const key = value.trim();
        const existing = suggestions.get(key);
        if (!existing || existing.priority < 3) {
          suggestions.set(key, { text: value.trim(), field, priority: 3 });
        }
      }
      // Contains match
      else if (valueLower.includes(termLower)) {
        const key = value.trim();
        const existing = suggestions.get(key);
        if (!existing || existing.priority < 2) {
          suggestions.set(key, { text: value.trim(), field, priority: 2 });
        }
      }
      // Fuzzy match
      else {
        const similarity = similarityScore(termLower, valueLower);
        if (similarity > 0.6) {
          const key = value.trim();
          const existing = suggestions.get(key);
          if (!existing || existing.priority < 1) {
            suggestions.set(key, { text: value.trim(), field, priority: 1, similarity });
          }
        }
      }
    });
  });

  return Array.from(suggestions.values())
    .sort((a, b) => b.priority - a.priority || (b.similarity || 0) - (a.similarity || 0))
    .slice(0, limit)
    .map(s => ({ text: s.text, field: s.field }));
}

/**
 * Highlight matching terms in text
 */
export function highlightMatches(text, searchTerms, tag = 'mark') {
  if (!text || !searchTerms.length) return text;

  let result = text;
  searchTerms.forEach(term => {
    const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    result = result.replace(regex, `<${tag}>$1</${tag}>`);
  });

  return result;
}

export default {
  levenshteinDistance,
  similarityScore,
  generateNgrams,
  tokenize,
  generateSearchVariations,
  buildFuzzyRegex,
  scoreDocument,
  buildSearchQuery,
  generateSuggestions,
  highlightMatches,
};

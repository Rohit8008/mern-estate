import { useState, useEffect, useRef, useCallback } from 'react';
import { apiClient } from '../utils/http';

const DEBOUNCE_MS  = 200;
const MAX_CACHE    = 40;   // evict oldest when exceeded

export function useGlobalSearch(query, entity) {
  const [results, setResults]  = useState(null);
  const [loading, setLoading]  = useState(false);
  const [error,   setError]    = useState(null);
  const abortRef  = useRef(null);
  const timerRef  = useRef(null);
  const cacheRef  = useRef(new Map()); // keyed by "query::entity"

  const doSearch = useCallback(async (q, ent) => {
    const key = `${q}::${ent}`;

    if (cacheRef.current.has(key)) {
      setResults(cacheRef.current.get(key));
      setLoading(false);
      return;
    }

    // Cancel any in-flight request
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ q: q.trim(), limit: '5' });
      if (ent && ent !== 'all') params.set('entities', ent);

      const data = await apiClient.get(`/search?${params}`);

      // Evict oldest entries if cache is full
      if (cacheRef.current.size >= MAX_CACHE) {
        const oldest = cacheRef.current.keys().next().value;
        cacheRef.current.delete(oldest);
      }
      cacheRef.current.set(key, data);
      setResults(data);
    } catch (err) {
      if (err?.name !== 'AbortError') setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(timerRef.current);

    if (!query || query.trim().length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }

    timerRef.current = setTimeout(() => doSearch(query, entity), DEBOUNCE_MS);
    return () => clearTimeout(timerRef.current);
  }, [query, entity, doSearch]);

  // Invalidate the cache for this query when the user changes the entity tab
  // so they always get fresh grouped results.
  const invalidate = useCallback((q) => {
    for (const key of cacheRef.current.keys()) {
      if (key.startsWith(`${q}::`)) cacheRef.current.delete(key);
    }
  }, []);

  return { results, loading, error, invalidate };
}

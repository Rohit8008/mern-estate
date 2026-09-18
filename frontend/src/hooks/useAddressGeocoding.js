import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '../utils/http';

/**
 * Address entry with geocoding: type-ahead suggestions, forward geocoding, and
 * reverse geocoding when a pin is dragged.
 *
 * This existed twice, near-identically, in CreateListing and UpdateListing. The
 * two had already drifted — different debounce timings and different status
 * wording for the same operation — which is the ordinary fate of copied code.
 *
 * The hook owns the lookup and the suggestion list; the caller owns the form
 * and decides what to do with a result, because "fill in these fields" differs
 * between a new property and an edit where the user may have typed over things
 * already.
 *
 * @param {(patch: object) => void} onResolved  called with the fields a lookup
 *        filled in, so the caller merges them into its own state
 */
export function useAddressGeocoding(onResolved) {
  const [geocoding, setGeocoding] = useState(false);
  const [status, setStatus] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const debounceRef = useRef(null);
  const abortRef = useRef(null);
  const statusTimerRef = useRef(null);
  const resolvedRef = useRef(onResolved);
  resolvedRef.current = onResolved;

  // Timers and in-flight requests outlive the component if not cleaned up, and
  // a resolved lookup would then call setState on an unmounted form.
  useEffect(() => () => {
    clearTimeout(debounceRef.current);
    clearTimeout(statusTimerRef.current);
    abortRef.current?.abort();
  }, []);

  const flashStatus = useCallback((text, ms = 2500) => {
    setStatus(text);
    clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => setStatus(''), ms);
  }, []);

  /** Address → coordinates, filling in city / locality / state / pincode. */
  const geocodeAddress = useCallback(
    async (address) => {
      if (!address || address.trim().length < 3) return null;
      setGeocoding(true);
      setStatus('Finding location…');
      try {
        const res = await apiClient.get(
          `/geocode/search?q=${encodeURIComponent(address)}&limit=1`,
          { silent: true }
        );
        const hit = (res?.data || [])[0];
        if (!hit) {
          flashStatus('No match for that address');
          return null;
        }
        const patch = {
          location: { lat: hit.lat, lng: hit.lng },
          city: hit.city,
          locality: hit.locality,
          state: hit.state,
          pincode: hit.pincode,
        };
        resolvedRef.current?.(patch);
        flashStatus('Location found');
        return patch;
      } catch (_) {
        flashStatus("Couldn't reach the map service", 3000);
        return null;
      } finally {
        setGeocoding(false);
      }
    },
    [flashStatus]
  );

  /** Coordinates → address, for when the pin is moved on the map. */
  const reverseGeocode = useCallback(async (lat, lng) => {
    try {
      const res = await apiClient.get(`/geocode/reverse?lat=${lat}&lng=${lng}`, { silent: true });
      const hit = res?.data;
      if (!hit) return null;
      const patch = {
        address: hit.address,
        city: hit.city,
        locality: hit.locality,
        state: hit.state,
        pincode: hit.pincode,
      };
      resolvedRef.current?.(patch);
      return patch;
    } catch (_) {
      // Silent: the pin is placed either way and the user can type the address.
      return null;
    }
  }, []);

  /** Debounced type-ahead. */
  const onAddressInput = useCallback((value) => {
    clearTimeout(debounceRef.current);
    if (!value || value.trim().length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await apiClient.get(
          `/geocode/search?q=${encodeURIComponent(value)}&limit=5`,
          { silent: true, signal: controller.signal }
        );
        if (controller.signal.aborted) return;
        setSuggestions(res?.data || []);
        setShowSuggestions(true);
        setActiveIndex(-1);
      } catch (_) {
        if (!controller.signal.aborted) setSuggestions([]);
      }
    }, 300);
  }, []);

  const dismiss = useCallback(() => {
    setShowSuggestions(false);
    setActiveIndex(-1);
  }, []);

  const choose = useCallback((suggestion) => {
    if (!suggestion) return null;
    const patch = {
      address: suggestion.address || suggestion.label,
      location: { lat: suggestion.lat, lng: suggestion.lng },
      city: suggestion.city,
      locality: suggestion.locality,
      state: suggestion.state,
      pincode: suggestion.pincode,
    };
    resolvedRef.current?.(patch);
    setShowSuggestions(false);
    setActiveIndex(-1);
    return patch;
  }, []);

  /** Arrow keys, Enter and Escape over the suggestion list. */
  const onAddressKeyDown = useCallback(
    (e) => {
      if (!showSuggestions || suggestions.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && activeIndex >= 0) {
        e.preventDefault();
        choose(suggestions[activeIndex]);
      } else if (e.key === 'Escape') {
        dismiss();
      }
    },
    [showSuggestions, suggestions, activeIndex, choose, dismiss]
  );

  return {
    geocoding,
    status,
    suggestions,
    showSuggestions,
    activeIndex,
    geocodeAddress,
    reverseGeocode,
    onAddressInput,
    onAddressKeyDown,
    chooseSuggestion: choose,
    dismissSuggestions: dismiss,
  };
}

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiSearch, HiX, HiLocationMarker, HiHome, HiOfficeBuilding, HiClock } from 'react-icons/hi';

// Debounce utility
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

export default function SearchBar({
  placeholder = 'Search properties, cities, localities...',
  className = '',
  onSearch,
  showFilters = false,
  compact = false,
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [recentSearches, setRecentSearches] = useState([]);
  const [popularSearches, setPopularSearches] = useState(null);

  const inputRef = useRef(null);
  const containerRef = useRef(null);

  const debouncedQuery = useDebounce(query, 150);

  // Load recent searches from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('recentSearches');
      if (saved) {
        setRecentSearches(JSON.parse(saved).slice(0, 5));
      }
    } catch (e) {
      console.error('Error loading recent searches:', e);
    }
  }, []);

  // Fetch suggestions when query changes
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (!debouncedQuery || debouncedQuery.trim().length < 2) {
        setSuggestions([]);
        return;
      }

      setIsLoading(true);
      try {
        const res = await fetch(`/api/listing/suggestions?q=${encodeURIComponent(debouncedQuery)}&limit=8`);
        const data = await res.json();
        if (data.success && data.data?.suggestions) {
          setSuggestions(data.data.suggestions);
        }
      } catch (error) {
        console.error('Error fetching suggestions:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSuggestions();
  }, [debouncedQuery]);

  // Fetch popular searches on focus
  const fetchPopularSearches = useCallback(async () => {
    if (popularSearches) return;

    try {
      const res = await fetch('/api/listing/popular-searches?limit=6');
      const data = await res.json();
      if (data.success) {
        setPopularSearches(data.data);
      }
    } catch (error) {
      console.error('Error fetching popular searches:', error);
    }
  }, [popularSearches]);

  // Handle click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Save search to recent
  const saveToRecent = (searchTerm) => {
    try {
      const updated = [searchTerm, ...recentSearches.filter(s => s !== searchTerm)].slice(0, 5);
      setRecentSearches(updated);
      localStorage.setItem('recentSearches', JSON.stringify(updated));
    } catch (e) {
      console.error('Error saving recent search:', e);
    }
  };

  // Handle search submission
  const handleSearch = (searchTerm) => {
    const term = searchTerm || query;
    if (!term.trim()) return;

    saveToRecent(term.trim());
    setShowSuggestions(false);

    if (onSearch) {
      onSearch(term.trim());
    } else {
      navigate(`/search?searchTerm=${encodeURIComponent(term.trim())}`);
    }
  };

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    if (!showSuggestions) return;

    const items = suggestions.length > 0 ? suggestions : recentSearches;
    const maxIndex = items.length - 1;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => (prev < maxIndex ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : maxIndex));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && items[selectedIndex]) {
          const selected = items[selectedIndex];
          handleSearch(typeof selected === 'string' ? selected : selected.text);
        } else {
          handleSearch();
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setSelectedIndex(-1);
        break;
    }
  };

  const getIconForType = (type) => {
    switch (type) {
      case 'city':
      case 'locality':
      case 'area':
        return <HiLocationMarker className="w-4 h-4 text-blue-500" />;
      case 'property':
        return <HiHome className="w-4 h-4 text-green-500" />;
      default:
        return <HiSearch className="w-4 h-4 text-slate-400" />;
    }
  };

  const clearSearch = () => {
    setQuery('');
    setSuggestions([]);
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Search Input */}
      <div className={`relative flex items-center bg-white border border-slate-200 rounded-xl shadow-sm transition-all duration-200 ${
        showSuggestions ? 'ring-2 ring-blue-500 border-transparent' : 'hover:border-slate-300'
      } ${compact ? 'h-10' : 'h-12'}`}>
        <div className="flex items-center justify-center w-12 text-slate-400">
          {isLoading ? (
            <div className="w-5 h-5 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
          ) : (
            <HiSearch className="w-5 h-5" />
          )}
        </div>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedIndex(-1);
          }}
          onFocus={() => {
            setShowSuggestions(true);
            fetchPopularSearches();
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`flex-1 bg-transparent outline-none text-slate-800 placeholder-slate-400 ${
            compact ? 'text-sm' : 'text-base'
          }`}
        />

        {query && (
          <button
            onClick={clearSearch}
            className="flex items-center justify-center w-10 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <HiX className="w-4 h-4" />
          </button>
        )}

        <button
          onClick={() => handleSearch()}
          className={`flex items-center justify-center bg-blue-600 text-white rounded-r-xl hover:bg-blue-700 transition-colors ${
            compact ? 'px-4 h-full' : 'px-6 h-full'
          }`}
        >
          <span className={compact ? 'hidden sm:inline' : ''}>Search</span>
          <HiSearch className={`w-4 h-4 ${compact ? 'sm:hidden' : 'hidden'}`} />
        </button>
      </div>

      {/* Suggestions Dropdown */}
      {showSuggestions && (
        <div className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          {/* Suggestions from API */}
          {suggestions.length > 0 && (
            <div className="py-2">
              <div className="px-4 py-1 text-xs font-medium text-slate-500 uppercase tracking-wide">
                Suggestions
              </div>
              {suggestions.map((suggestion, index) => (
                <button
                  key={`${suggestion.text}-${index}`}
                  onClick={() => handleSearch(suggestion.text)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    selectedIndex === index ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  {getIconForType(suggestion.type)}
                  <span className="flex-1 truncate">{suggestion.text}</span>
                  <span className="text-xs text-slate-400 capitalize">{suggestion.type}</span>
                </button>
              ))}
            </div>
          )}

          {/* Recent Searches */}
          {suggestions.length === 0 && recentSearches.length > 0 && (
            <div className="py-2 border-b border-slate-100">
              <div className="px-4 py-1 text-xs font-medium text-slate-500 uppercase tracking-wide flex items-center gap-1">
                <HiClock className="w-3 h-3" />
                Recent Searches
              </div>
              {recentSearches.map((search, index) => (
                <button
                  key={`recent-${index}`}
                  onClick={() => handleSearch(search)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    selectedIndex === index ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <HiClock className="w-4 h-4 text-slate-400" />
                  <span className="flex-1 truncate">{search}</span>
                </button>
              ))}
            </div>
          )}

          {/* Popular Searches */}
          {suggestions.length === 0 && popularSearches && (
            <div className="py-2">
              {popularSearches.popularCities?.length > 0 && (
                <>
                  <div className="px-4 py-1 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Popular Cities
                  </div>
                  <div className="flex flex-wrap gap-2 px-4 py-2">
                    {popularSearches.popularCities.slice(0, 5).map((city, index) => (
                      <button
                        key={`city-${index}`}
                        onClick={() => handleSearch(city.name)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm rounded-full transition-colors"
                      >
                        {city.name}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {popularSearches.popularPropertyTypes?.length > 0 && (
                <>
                  <div className="px-4 py-1 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Property Types
                  </div>
                  <div className="flex flex-wrap gap-2 px-4 py-2">
                    {popularSearches.popularPropertyTypes.slice(0, 4).map((type, index) => (
                      <button
                        key={`type-${index}`}
                        onClick={() => handleSearch(type.name)}
                        className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm rounded-full transition-colors"
                      >
                        {type.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* No Results */}
          {suggestions.length === 0 && recentSearches.length === 0 && !popularSearches && (
            <div className="py-8 text-center text-slate-500">
              <HiSearch className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p className="text-sm">Start typing to search properties</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

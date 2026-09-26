import { useEffect, useState, useCallback, useRef } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import ListingItem from '../components/ListingItem';
import { EmptyState } from '../design-system';
import { apiClient } from '../utils/http';
import usePageTitle from '../hooks/usePageTitle';
import SearchBar from '../components/search/SearchBar';
import SearchFilters from '../components/search/SearchFilters';
import {
  HiViewGrid,
  HiViewList,
  HiAdjustments,
  HiX,
  HiChevronDown,
  HiHome,
  HiOfficeBuilding,
  HiLocationMarker,
  HiCurrencyRupee,
  HiSparkles,
  HiTrendingUp,
  HiSearch,
  HiRefresh
} from 'react-icons/hi';
import { formatCompactCurrency, formatCurrency } from '../utils/currency';
import { useTranslation } from 'react-i18next';

export default function Search() {
  const { t } = useTranslation();
  usePageTitle('Search Properties');
  const location = useLocation();
  const navigate = useNavigate();

  const [filters, setFilters] = useState({
    searchTerm: '',
    type: 'all',
    propertyCategory: 'all',
    propertyType: '',
    parking: '',
    furnished: '',
    offer: '',
    city: '',
    minPrice: '',
    maxPrice: '',
    bedrooms: '',
    bathrooms: '',
    sort: 'relevance',
    order: 'desc',
  });

  const [loading, setLoading] = useState(false);
  const [listings, setListings] = useState([]);
  const [showMore, setShowMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState('grid');
  const [totalResults, setTotalResults] = useState(0);
  const [searchTime, setSearchTime] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const mobileFiltersCloseRef = useRef(null);

  // The mobile filter drawer is a modal: Escape closes it and focus moves in.
  useEffect(() => {
    if (!showMobileFilters) return undefined;
    mobileFiltersCloseRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') setShowMobileFilters(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showMobileFilters]);

  // Listen for listing changes to refresh search results
  useEffect(() => {
    const handleListingChange = () => {
      setRefreshKey(prev => prev + 1);
    };

    window.addEventListener('listing-created', handleListingChange);
    window.addEventListener('listing-deleted', handleListingChange);
    window.addEventListener('listing-updated', handleListingChange);

    return () => {
      window.removeEventListener('listing-created', handleListingChange);
      window.removeEventListener('listing-deleted', handleListingChange);
      window.removeEventListener('listing-updated', handleListingChange);
    };
  }, []);

  // Parse URL params on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);

    const newFilters = {
      searchTerm: urlParams.get('searchTerm') || '',
      type: urlParams.get('type') || 'all',
      propertyCategory: urlParams.get('propertyCategory') || 'all',
      propertyType: urlParams.get('propertyType') || '',
      parking: urlParams.get('parking') || '',
      furnished: urlParams.get('furnished') || '',
      offer: urlParams.get('offer') || '',
      city: urlParams.get('city') || '',
      minPrice: urlParams.get('minPrice') || '',
      maxPrice: urlParams.get('maxPrice') || '',
      bedrooms: urlParams.get('bedrooms') || '',
      bathrooms: urlParams.get('bathrooms') || '',
      sort: urlParams.get('sort') || 'relevance',
      order: urlParams.get('order') || 'desc',
    };

    setFilters(newFilters);

    const viewFromUrl = urlParams.get('view');
    if (viewFromUrl === 'list' || viewFromUrl === 'grid') {
      setView(viewFromUrl);
    }
  }, [location.search]);

  // Fetch listings when filters change
  useEffect(() => {
    const controller = new AbortController();

    const fetchListings = async () => {
      setLoading(true);
      setError('');
      setShowMore(false);

      const startTime = Date.now();

      try {
        const params = new URLSearchParams();

        if (filters.searchTerm) params.set('q', filters.searchTerm);
        if (filters.type && filters.type !== 'all') params.set('type', filters.type);
        if (filters.propertyCategory && filters.propertyCategory !== 'all') {
          params.set('propertyCategory', filters.propertyCategory);
        }
        if (filters.propertyType) params.set('propertyType', filters.propertyType);
        if (filters.city) params.set('city', filters.city);
        if (filters.minPrice) params.set('minPrice', filters.minPrice);
        if (filters.maxPrice) params.set('maxPrice', filters.maxPrice);
        if (filters.bedrooms) params.set('bedrooms', filters.bedrooms);
        if (filters.bathrooms) params.set('bathrooms', filters.bathrooms);
        if (filters.parking === 'true') params.set('parking', 'true');
        if (filters.furnished === 'true') params.set('furnished', 'true');
        if (filters.offer === 'true') params.set('offer', 'true');
        if (filters.sort) params.set('sort', filters.sort);
        if (filters.order) params.set('order', filters.order);
        params.set('limit', '12');

        const data = await apiClient.get(`/listing/search?${params.toString()}`, {
          signal: controller.signal,
        });

        // A slower earlier request must not overwrite a newer one's results —
        // the classic "the list doesn't match what I typed". The abort above
        // cancels in flight; this guards the case where it already resolved.
        if (controller.signal.aborted) return;

        setSearchTime(Date.now() - startTime);
        setListings(data.data?.listings || []);
        setTotalResults(data.data?.pagination?.total || 0);
        setShowMore(data.data?.pagination?.hasMore || false);
      } catch (e) {
        if (e?.name === 'AbortError' || controller.signal.aborted) return;
        setListings([]);
        setShowMore(false);
        setTotalResults(0);
        setError(e.message || 'Failed to load listings');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    fetchListings();
    return () => controller.abort();
  }, [filters, refreshKey]);

  // Update URL when filters change
  const updateUrl = useCallback((newFilters) => {
    const params = new URLSearchParams();

    Object.entries(newFilters).forEach(([key, value]) => {
      if (value && value !== 'all' && value !== '') {
        params.set(key, value);
      }
    });

    params.set('view', view);
    navigate(`/search?${params.toString()}`, { replace: true });
  }, [navigate, view]);

  // Handle search from SearchBar
  const handleSearch = (searchTerm) => {
    const newFilters = { ...filters, searchTerm };
    setFilters(newFilters);
    updateUrl(newFilters);
  };

  // Handle filter changes
  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
    updateUrl(newFilters);
  };

  // Clear all filters
  const handleClearFilters = () => {
    const defaultFilters = {
      searchTerm: '',
      type: 'all',
      propertyCategory: 'all',
      propertyType: '',
      parking: '',
      furnished: '',
      offer: '',
      city: '',
      minPrice: '',
      maxPrice: '',
      bedrooms: '',
      bathrooms: '',
      sort: 'relevance',
      order: 'desc',
    };
    setFilters(defaultFilters);
    navigate('/search');
  };

  // Remove single filter
  const removeFilter = (key) => {
    const newFilters = { ...filters };
    if (key === 'type' || key === 'propertyCategory') {
      newFilters[key] = 'all';
    } else {
      newFilters[key] = '';
    }
    setFilters(newFilters);
    updateUrl(newFilters);
  };

  // Toggle view
  const setViewAndSyncUrl = (newView) => {
    setView(newView);
    const urlParams = new URLSearchParams(location.search);
    urlParams.set('view', newView);
    navigate(`/search?${urlParams.toString()}`, { replace: true });
  };

  // Load more results
  const onShowMoreClick = async () => {
    setLoadingMore(true);
    try {
      const params = new URLSearchParams();

      if (filters.searchTerm) params.set('q', filters.searchTerm);
      if (filters.type && filters.type !== 'all') params.set('type', filters.type);
      if (filters.propertyCategory && filters.propertyCategory !== 'all') {
        params.set('propertyCategory', filters.propertyCategory);
      }
      if (filters.propertyType) params.set('propertyType', filters.propertyType);
      if (filters.city) params.set('city', filters.city);
      if (filters.minPrice) params.set('minPrice', filters.minPrice);
      if (filters.maxPrice) params.set('maxPrice', filters.maxPrice);
      if (filters.bedrooms) params.set('bedrooms', filters.bedrooms);
      if (filters.bathrooms) params.set('bathrooms', filters.bathrooms);
      if (filters.parking === 'true') params.set('parking', 'true');
      if (filters.furnished === 'true') params.set('furnished', 'true');
      if (filters.offer === 'true') params.set('offer', 'true');
      if (filters.sort) params.set('sort', filters.sort);
      if (filters.order) params.set('order', filters.order);
      params.set('startIndex', listings.length);
      params.set('limit', '12');

      const data = await apiClient.get(`/listing/search?${params.toString()}`);

      // Functional update: two quick clicks would otherwise both append to the
      // same captured array and the first page's extra rows would vanish.
      setListings((prev) => [...prev, ...(data.data?.listings || [])]);
      setShowMore(data.data?.pagination?.hasMore || false);
    } catch (e) {
      setError(e.message || 'Failed to load more listings');
      setShowMore(false);
    } finally {
      setLoadingMore(false);
    }
  };

  // Get active filters for display
  const getActiveFilters = () => {
    const active = [];
    if (filters.searchTerm) active.push({ key: 'searchTerm', label: `"${filters.searchTerm}"`, icon: HiSearch });
    if (filters.type && filters.type !== 'all') active.push({ key: 'type', label: filters.type === 'sale' ? 'For Sale' : 'For Rent', icon: HiHome });
    if (filters.propertyCategory && filters.propertyCategory !== 'all') active.push({ key: 'propertyCategory', label: filters.propertyCategory, icon: HiOfficeBuilding });
    if (filters.city) active.push({ key: 'city', label: filters.city, icon: HiLocationMarker });
    if (filters.minPrice || filters.maxPrice) {
      const priceLabel = filters.minPrice && filters.maxPrice
        ? `${formatCurrency(filters.minPrice)} - ${formatCurrency(filters.maxPrice)}`
        : filters.minPrice
          ? `Min ${formatCurrency(filters.minPrice)}`
          : `Max ${formatCurrency(filters.maxPrice)}`;
      active.push({ key: 'price', label: priceLabel, icon: HiCurrencyRupee });
    }
    if (filters.bedrooms) active.push({ key: 'bedrooms', label: `${filters.bedrooms}+ Beds` });
    if (filters.bathrooms) active.push({ key: 'bathrooms', label: `${filters.bathrooms}+ Baths` });
    if (filters.offer === 'true') active.push({ key: 'offer', label: 'Special Offers', icon: HiSparkles });
    if (filters.furnished === 'true') active.push({ key: 'furnished', label: 'Furnished' });
    if (filters.parking === 'true') active.push({ key: 'parking', label: 'Parking' });
    return active;
  };

  const activeFilters = getActiveFilters();

  // Format price for display
  const formatPrice = (price) => {
    return formatCompactCurrency(price);
  };

  return (
    <div className='min-h-screen bg-slate-50'>
      {/* Hero Search Section */}
      <div className='relative overflow-hidden'>
        {/* Background Pattern */}
        <div className='absolute inset-0 bg-gradient-to-br from-slate-900 via-indigo-950 to-violet-950'>
          <div className='absolute top-0 left-1/4 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none' />
          <div className='absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none' />
        </div>

        <div className='relative py-12 md:py-16 px-4'>
          <div className='max-w-5xl mx-auto text-center'>
            {/* Breadcrumb */}
            <nav className='flex items-center justify-center gap-2 text-sm text-indigo-200 mb-6'>
              <Link to='/' className='hover:text-white transition-colors'>{t('search.home')}</Link>
              <span>/</span>
              <span className='text-white'>{t('search.searchProperties')}</span>
            </nav>

            <h1 className='text-3xl md:text-5xl font-bold text-white mb-4 tracking-tight'>{t('search.findYourDreamProperty')}</h1>
            <p className='text-lg text-indigo-100 mb-8 max-w-2xl mx-auto'>{t('search.discoverThePerfectHomeFromOur')}</p>

            {/* Search Bar */}
            <div className='max-w-3xl mx-auto'>
              <SearchBar
                placeholder={t('search.searchByLocationPropertyNameOr')}
                onSearch={handleSearch}
                className="shadow-2xl"
              />
            </div>

            {/* A count, stated plainly. The row used to add "Multiple Cities" and
                "Verified Listings" and a "+" to the figure, none of which the data
                supports; see the claims policy in CLAUDE.md. */}
            <div className='flex items-center justify-center gap-2 mt-8 text-sm text-indigo-100'>
              <HiTrendingUp className='w-5 h-5' aria-hidden='true' />
              <span>{t('search.propertyCount', { count: totalResults, formatted: totalResults.toLocaleString() })}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className='max-w-7xl mx-auto px-4 py-8'>
        {/* Active Filters Bar */}
        {activeFilters.length > 0 && (
          <div className='mb-6 bg-white rounded-xl border border-slate-200 p-4 shadow-sm'>
            <div className='flex flex-wrap items-center gap-3'>
              <span className='text-sm font-medium text-slate-600'>{t('search.activeFilters')}</span>
              <div className='flex flex-wrap gap-2'>
                {activeFilters.map((filter) => (
                  <span
                    key={filter.key}
                    className='inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-full text-sm font-medium'
                  >
                    {filter.icon && <filter.icon className='w-4 h-4' aria-hidden='true' />}
                    {filter.label}
                    <button
                      onClick={() => {
                        if (filter.key === 'price') {
                          removeFilter('minPrice');
                          removeFilter('maxPrice');
                        } else {
                          removeFilter(filter.key);
                        }
                      }}
                      className='ml-1 hover:bg-indigo-200 rounded-full p-0.5 transition-colors'
                      aria-label={`Remove filter: ${filter.label}`}
                    >
                      <HiX className='w-3.5 h-3.5' aria-hidden='true' />
                    </button>
                  </span>
                ))}
              </div>
              <button
                onClick={handleClearFilters}
                className='text-sm text-rose-600 hover:text-rose-700 font-medium ml-auto'
              >{t('search.clearAll')}</button>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className='mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-3'>
            <svg className='w-5 h-5 flex-shrink-0' aria-hidden='true' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' />
            </svg>
            <span>{error}</span>
            <button onClick={() => setRefreshKey(prev => prev + 1)} className='ml-auto text-rose-600 hover:text-rose-800' aria-label={t('search.retrySearch')}>
              <HiRefresh className='w-5 h-5' aria-hidden='true' />
            </button>
          </div>
        )}

        <div className='flex flex-col lg:flex-row gap-8'>
          {/* Mobile Filter Button */}
          <button
            onClick={() => setShowMobileFilters(true)}
            aria-expanded={showMobileFilters}
            className='lg:hidden flex items-center justify-center gap-2 w-full py-3 bg-white border border-slate-200 rounded-xl text-slate-700 font-medium shadow-sm'
          >
            <HiAdjustments className='w-5 h-5' aria-hidden='true' />
            Filters
            {activeFilters.length > 0 && (
              <span className='px-2 py-0.5 bg-indigo-600 text-white text-xs rounded-full'>
                {activeFilters.length}
              </span>
            )}
          </button>

          {/* Mobile Filter Overlay */}
          {showMobileFilters && (
            <div className='fixed inset-0 !mt-0 z-50 lg:hidden'>
              <div className='absolute inset-0 bg-black/50' onClick={() => setShowMobileFilters(false)} aria-hidden='true' />
              <div
                className='absolute right-0 top-0 h-full w-full max-w-sm bg-white shadow-xl overflow-y-auto'
                role='dialog'
                aria-modal='true'
                aria-labelledby='mobile-filters-title'
              >
                <div className='sticky top-0 bg-white border-b border-slate-200 p-4 flex items-center justify-between'>
                  <h3 id='mobile-filters-title' className='font-semibold text-slate-800'>{t('search.filters')}</h3>
                  <button
                    ref={mobileFiltersCloseRef}
                    type='button'
                    onClick={() => setShowMobileFilters(false)}
                    aria-label='Close filters'
                    className='p-2 hover:bg-slate-100 rounded-lg'
                  >
                    <HiX className='w-5 h-5' aria-hidden='true' />
                  </button>
                </div>
                <div className='p-4'>
                  <SearchFilters
                    filters={filters}
                    onChange={(newFilters) => {
                      handleFilterChange(newFilters);
                      setShowMobileFilters(false);
                    }}
                    onClear={() => {
                      handleClearFilters();
                      setShowMobileFilters(false);
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Desktop Filters Sidebar */}
          <div className='hidden lg:block lg:w-80 flex-shrink-0'>
            <div className='sticky top-24'>
              <SearchFilters
                filters={filters}
                onChange={handleFilterChange}
                onClear={handleClearFilters}
              />
            </div>
          </div>

          {/* Results Section */}
          <div className='flex-1 min-w-0'>
            {/* Results Header */}
            <div className='bg-white rounded-xl border border-slate-200 shadow-sm mb-6 overflow-hidden'>
              <div className='p-4 sm:p-5'>
                <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
                  <div>
                    <div className='flex items-center gap-3'>
                      <h2 className='text-xl font-bold text-slate-800'>
                        {loading ? (
                          <span className='flex items-center gap-2'>
                            <span className='w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin' />{t('search.searching')}</span>
                        ) : (
                          <>
                            {t('search.propertyCount', { count: totalResults, formatted: totalResults.toLocaleString() })}
                          </>
                        )}
                      </h2>
                      {searchTime && !loading && (
                        <span className='px-2 py-1 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-full'>
                          {searchTime}ms
                        </span>
                      )}
                    </div>
                    {filters.searchTerm && !loading && (
                      <p className='text-sm text-slate-500 mt-1'>{t('search.showingResultsFor')}<span className='font-medium text-slate-700'>{filters.searchTerm}</span>"
                      </p>
                    )}
                  </div>

                  <div className='flex items-center gap-3'>
                    {/* View Toggle */}
                    <div className='flex bg-slate-100 rounded-lg p-1'>
                      <button
                        onClick={() => setViewAndSyncUrl('grid')}
                        className={`p-2 rounded-md transition-all ${view === 'grid'
                            ? 'bg-white text-indigo-600 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                          }`}
                        title={t('search.gridView')}
                        aria-label={t('search.gridView')}
                        aria-pressed={view === 'grid'}
                      >
                        <HiViewGrid className='w-5 h-5' aria-hidden='true' />
                      </button>
                      <button
                        onClick={() => setViewAndSyncUrl('list')}
                        className={`p-2 rounded-md transition-all ${view === 'list'
                            ? 'bg-white text-indigo-600 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                          }`}
                        title={t('search.listView')}
                        aria-label={t('search.listView')}
                        aria-pressed={view === 'list'}
                      >
                        <HiViewList className='w-5 h-5' aria-hidden='true' />
                      </button>
                    </div>

                    {/* Sort Dropdown */}
                    <div className='relative'>
                      <select
                        value={`${filters.sort}-${filters.order}`}
                        onChange={(e) => {
                          const [sort, order] = e.target.value.split('-');
                          handleFilterChange({ ...filters, sort, order });
                        }}
                        aria-label={t('search.sortResults')}
                        className='appearance-none bg-white border border-slate-200 rounded-lg pl-4 pr-10 py-2.5 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent cursor-pointer hover:border-slate-300 transition-colors'
                      >
                        <option value="relevance-desc">{t('search.mostRelevant')}</option>
                        <option value="createdAt-desc">{t('search.newestFirst')}</option>
                        <option value="createdAt-asc">{t('search.oldestFirst')}</option>
                        <option value="regularPrice-asc">{t('search.priceLowToHigh')}</option>
                        <option value="regularPrice-desc">{t('search.priceHighToLow')}</option>
                      </select>
                      <HiChevronDown className='absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none' aria-hidden='true' />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Results Content */}
            <div className='bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden'>
              <div className='p-4 sm:p-6'>
                {/* Loading State */}
                {loading && (
                  <div className={view === 'list' ? 'space-y-4' : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6'}>
                    {Array.from({ length: 6 }).map((_, idx) => (
                      <div
                        key={idx}
                        className={`bg-slate-50 rounded-xl overflow-hidden animate-pulse ${view === 'list' ? 'flex' : ''
                          }`}
                      >
                        <div className={`bg-slate-200 ${view === 'list' ? 'w-72 h-48' : 'h-52 w-full'}`} />
                        <div className='p-5 flex-1 space-y-3'>
                          <div className='h-5 bg-slate-200 rounded w-3/4' />
                          <div className='h-4 bg-slate-200 rounded w-1/2' />
                          <div className='flex gap-3'>
                            <div className='h-4 bg-slate-200 rounded w-16' />
                            <div className='h-4 bg-slate-200 rounded w-16' />
                          </div>
                          <div className='h-4 bg-slate-200 rounded w-full' />
                          <div className='h-4 bg-slate-200 rounded w-5/6' />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Empty State */}
                {!loading && listings.length === 0 && (
                  <EmptyState
                    icon={HiSearch}
                    title={t('search.noPropertiesFound')}
                    body={
                      filters.searchTerm
                        ? `We couldn't find any properties matching "${filters.searchTerm}". Try adjusting your search or filters.`
                        : 'Try adjusting your filters or search for a different location to find properties.'
                    }
                    action={
                      <div className='flex flex-col sm:flex-row items-center justify-center gap-3'>
                        <button
                          onClick={handleClearFilters}
                          className='px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-500 transition-colors'
                        >{t('search.clearAllFilters')}</button>
                        <Link
                          to='/'
                          className='px-6 py-3 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200 transition-colors'
                        >{t('search.browseHomepage')}</Link>
                      </div>
                    }
                  />
                )}

                {/* Results Grid/List */}
                {!loading && listings.length > 0 && (
                  <>
                    <div className={view === 'list' ? 'space-y-4' : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6'}>
                      {listings.map((listing, index) => (
                        <div
                          key={listing._id}
                          className='crm-animate-in transform transition-all duration-300 hover:-translate-y-1'
                          style={{ animationDelay: `${Math.min(index, 10) * 50}ms` }}
                        >
                          <ListingItem listing={listing} layout={view} />
                        </div>
                      ))}
                    </div>

                    {/* Results Info */}
                    <div className='mt-8 pt-6 border-t border-slate-100 text-center text-sm text-slate-500'>
                      Showing {listings.length} of {totalResults.toLocaleString()} properties
                    </div>
                  </>
                )}

                {/* Show More Button */}
                {showMore && !loading && (
                  <div className='text-center mt-8'>
                    <button
                      onClick={onShowMoreClick}
                      disabled={loadingMore}
                      className='px-8 py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-semibold hover:from-indigo-500 hover:to-violet-500 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2'
                    >
                      {loadingMore ? (
                        <>
                          <span className='w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin' />{t('search.loading')}</>
                      ) : (
                        <>{t('search.loadMoreProperties')}<HiChevronDown className='w-5 h-5' />
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Search Tips */}
            {!loading && listings.length === 0 && (
              <div className='mt-6 bg-indigo-50 rounded-xl p-6 border border-indigo-100'>
                <h4 className='font-semibold text-indigo-800 mb-3 flex items-center gap-2'>
                  <HiSparkles className='w-5 h-5' />{t('search.searchTips')}</h4>
                <ul className='text-sm text-indigo-700 space-y-2'>
                  <li className='flex items-start gap-2'>
                    <span className='w-1.5 h-1.5 bg-indigo-500 rounded-full mt-2 flex-shrink-0' />{t('search.tryBroaderSearchTermsLikeApartment')}</li>
                  <li className='flex items-start gap-2'>
                    <span className='w-1.5 h-1.5 bg-indigo-500 rounded-full mt-2 flex-shrink-0' />{t('search.expandYourPriceRangeToSee')}</li>
                  <li className='flex items-start gap-2'>
                    <span className='w-1.5 h-1.5 bg-indigo-500 rounded-full mt-2 flex-shrink-0' />{t('search.searchByCityNameForLocation')}</li>
                  <li className='flex items-start gap-2'>
                    <span className='w-1.5 h-1.5 bg-indigo-500 rounded-full mt-2 flex-shrink-0' />{t('search.ourFuzzySearchHandlesTyposAppartment')}</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState, useCallback } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import ListingItem from '../components/ListingItem';
import { fetchWithRefresh, handleApiResponse } from '../utils/http';
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

export default function Search() {
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
          params.set('category', filters.propertyCategory);
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

        const res = await fetchWithRefresh(`/api/listing/search?${params.toString()}`);
        const data = await handleApiResponse(res);

        const endTime = Date.now();
        setSearchTime(endTime - startTime);

        if (data.success) {
          setListings(data.data?.listings || []);
          setTotalResults(data.data?.pagination?.total || 0);
          setShowMore(data.data?.pagination?.hasMore || false);
        } else {
          setListings([]);
          setTotalResults(0);
        }
      } catch (e) {
        setListings([]);
        setShowMore(false);
        setTotalResults(0);
        setError(e.message || 'Failed to load listings');
      } finally {
        setLoading(false);
      }
    };

    fetchListings();
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
        params.set('category', filters.propertyCategory);
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

      const res = await fetchWithRefresh(`/api/listing/search?${params.toString()}`);
      const data = await handleApiResponse(res);

      if (data.success) {
        setListings([...listings, ...(data.data?.listings || [])]);
        setShowMore(data.data?.pagination?.hasMore || false);
      }
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
        ? `₹${Number(filters.minPrice).toLocaleString()} - ₹${Number(filters.maxPrice).toLocaleString()}`
        : filters.minPrice
          ? `Min ₹${Number(filters.minPrice).toLocaleString()}`
          : `Max ₹${Number(filters.maxPrice).toLocaleString()}`;
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
    if (price >= 10000000) return `₹${(price / 10000000).toFixed(1)}Cr`;
    if (price >= 100000) return `₹${(price / 100000).toFixed(1)}L`;
    return `₹${price.toLocaleString()}`;
  };

  return (
    <div className='min-h-screen bg-gradient-to-b from-slate-50 to-white'>
      {/* Hero Search Section */}
      <div className='relative overflow-hidden'>
        {/* Background Pattern */}
        <div className='absolute inset-0 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800'>
          <div className='absolute inset-0 opacity-10'>
            <svg className='w-full h-full' xmlns='http://www.w3.org/2000/svg'>
              <defs>
                <pattern id='grid' width='40' height='40' patternUnits='userSpaceOnUse'>
                  <path d='M 40 0 L 0 0 0 40' fill='none' stroke='white' strokeWidth='1'/>
                </pattern>
              </defs>
              <rect width='100%' height='100%' fill='url(#grid)' />
            </svg>
          </div>
        </div>

        <div className='relative py-12 md:py-16 px-4'>
          <div className='max-w-5xl mx-auto text-center'>
            {/* Breadcrumb */}
            <nav className='flex items-center justify-center gap-2 text-sm text-blue-200 mb-6'>
              <Link to='/' className='hover:text-white transition-colors'>Home</Link>
              <span>/</span>
              <span className='text-white'>Search Properties</span>
            </nav>

            <h1 className='text-3xl md:text-5xl font-bold text-white mb-4 tracking-tight'>
              Find Your Dream Property
            </h1>
            <p className='text-lg text-blue-100 mb-8 max-w-2xl mx-auto'>
              Discover the perfect home from our extensive collection of premium properties
            </p>

            {/* Search Bar */}
            <div className='max-w-3xl mx-auto'>
              <SearchBar
                placeholder="Search by location, property name, or type..."
                onSearch={handleSearch}
                className="shadow-2xl"
              />
            </div>

            {/* Quick Stats */}
            <div className='flex items-center justify-center gap-8 mt-8 text-sm'>
              <div className='flex items-center gap-2 text-blue-100'>
                <HiTrendingUp className='w-5 h-5' />
                <span>{totalResults.toLocaleString()}+ Properties</span>
              </div>
              <div className='hidden sm:flex items-center gap-2 text-blue-100'>
                <HiLocationMarker className='w-5 h-5' />
                <span>Multiple Cities</span>
              </div>
              <div className='hidden md:flex items-center gap-2 text-blue-100'>
                <HiSparkles className='w-5 h-5' />
                <span>Verified Listings</span>
              </div>
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
              <span className='text-sm font-medium text-slate-600'>Active Filters:</span>
              <div className='flex flex-wrap gap-2'>
                {activeFilters.map((filter) => (
                  <span
                    key={filter.key}
                    className='inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full text-sm font-medium'
                  >
                    {filter.icon && <filter.icon className='w-4 h-4' />}
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
                      className='ml-1 hover:bg-blue-200 rounded-full p-0.5 transition-colors'
                    >
                      <HiX className='w-3.5 h-3.5' />
                    </button>
                  </span>
                ))}
              </div>
              <button
                onClick={handleClearFilters}
                className='text-sm text-red-600 hover:text-red-700 font-medium ml-auto'
              >
                Clear All
              </button>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className='mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 flex items-center gap-3'>
            <svg className='w-5 h-5 flex-shrink-0' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' />
            </svg>
            <span>{error}</span>
            <button onClick={() => setRefreshKey(prev => prev + 1)} className='ml-auto text-red-600 hover:text-red-800'>
              <HiRefresh className='w-5 h-5' />
            </button>
          </div>
        )}

        <div className='flex flex-col lg:flex-row gap-8'>
          {/* Mobile Filter Button */}
          <button
            onClick={() => setShowMobileFilters(true)}
            className='lg:hidden flex items-center justify-center gap-2 w-full py-3 bg-white border border-slate-200 rounded-xl text-slate-700 font-medium shadow-sm'
          >
            <HiAdjustments className='w-5 h-5' />
            Filters
            {activeFilters.length > 0 && (
              <span className='px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full'>
                {activeFilters.length}
              </span>
            )}
          </button>

          {/* Mobile Filter Overlay */}
          {showMobileFilters && (
            <div className='fixed inset-0 z-50 lg:hidden'>
              <div className='absolute inset-0 bg-black/50' onClick={() => setShowMobileFilters(false)} />
              <div className='absolute right-0 top-0 h-full w-full max-w-sm bg-white shadow-xl overflow-y-auto'>
                <div className='sticky top-0 bg-white border-b border-slate-200 p-4 flex items-center justify-between'>
                  <h3 className='font-semibold text-slate-800'>Filters</h3>
                  <button onClick={() => setShowMobileFilters(false)} className='p-2 hover:bg-slate-100 rounded-lg'>
                    <HiX className='w-5 h-5' />
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
                            <span className='w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin' />
                            Searching...
                          </span>
                        ) : (
                          <>
                            {totalResults.toLocaleString()}
                            <span className='font-normal text-slate-500'> Properties</span>
                          </>
                        )}
                      </h2>
                      {searchTime && !loading && (
                        <span className='px-2 py-1 bg-green-50 text-green-700 text-xs font-medium rounded-full'>
                          {searchTime}ms
                        </span>
                      )}
                    </div>
                    {filters.searchTerm && !loading && (
                      <p className='text-sm text-slate-500 mt-1'>
                        Showing results for "<span className='font-medium text-slate-700'>{filters.searchTerm}</span>"
                      </p>
                    )}
                  </div>

                  <div className='flex items-center gap-3'>
                    {/* View Toggle */}
                    <div className='flex bg-slate-100 rounded-lg p-1'>
                      <button
                        onClick={() => setViewAndSyncUrl('grid')}
                        className={`p-2 rounded-md transition-all ${
                          view === 'grid'
                            ? 'bg-white text-blue-600 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                        title="Grid view"
                      >
                        <HiViewGrid className='w-5 h-5' />
                      </button>
                      <button
                        onClick={() => setViewAndSyncUrl('list')}
                        className={`p-2 rounded-md transition-all ${
                          view === 'list'
                            ? 'bg-white text-blue-600 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                        title="List view"
                      >
                        <HiViewList className='w-5 h-5' />
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
                        className='appearance-none bg-white border border-slate-200 rounded-lg pl-4 pr-10 py-2.5 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer hover:border-slate-300 transition-colors'
                      >
                        <option value="relevance-desc">Most Relevant</option>
                        <option value="createdAt-desc">Newest First</option>
                        <option value="createdAt-asc">Oldest First</option>
                        <option value="regularPrice-asc">Price: Low to High</option>
                        <option value="regularPrice-desc">Price: High to Low</option>
                      </select>
                      <HiChevronDown className='absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none' />
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
                        className={`bg-slate-50 rounded-xl overflow-hidden animate-pulse ${
                          view === 'list' ? 'flex' : ''
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
                  <div className='text-center py-16'>
                    <div className='w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6'>
                      <HiSearch className='w-12 h-12 text-slate-400' />
                    </div>
                    <h3 className='text-xl font-semibold text-slate-800 mb-2'>No properties found</h3>
                    <p className='text-slate-500 mb-6 max-w-md mx-auto'>
                      {filters.searchTerm
                        ? `We couldn't find any properties matching "${filters.searchTerm}". Try adjusting your search or filters.`
                        : 'Try adjusting your filters or search for a different location to find properties.'}
                    </p>
                    <div className='flex flex-col sm:flex-row items-center justify-center gap-3'>
                      <button
                        onClick={handleClearFilters}
                        className='px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors'
                      >
                        Clear All Filters
                      </button>
                      <Link
                        to='/'
                        className='px-6 py-3 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200 transition-colors'
                      >
                        Browse Homepage
                      </Link>
                    </div>
                  </div>
                )}

                {/* Results Grid/List */}
                {!loading && listings.length > 0 && (
                  <>
                    <div className={view === 'list' ? 'space-y-4' : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6'}>
                      {listings.map((listing, index) => (
                        <div
                          key={listing._id}
                          className='transform transition-all duration-300 hover:-translate-y-1'
                          style={{ animationDelay: `${index * 50}ms` }}
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
                      className='px-8 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2'
                    >
                      {loadingMore ? (
                        <>
                          <span className='w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin' />
                          Loading...
                        </>
                      ) : (
                        <>
                          Load More Properties
                          <HiChevronDown className='w-5 h-5' />
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Search Tips */}
            {!loading && listings.length === 0 && (
              <div className='mt-6 bg-blue-50 rounded-xl p-6 border border-blue-100'>
                <h4 className='font-semibold text-blue-800 mb-3 flex items-center gap-2'>
                  <HiSparkles className='w-5 h-5' />
                  Search Tips
                </h4>
                <ul className='text-sm text-blue-700 space-y-2'>
                  <li className='flex items-start gap-2'>
                    <span className='w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 flex-shrink-0' />
                    Try broader search terms like "apartment" instead of specific addresses
                  </li>
                  <li className='flex items-start gap-2'>
                    <span className='w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 flex-shrink-0' />
                    Expand your price range to see more options
                  </li>
                  <li className='flex items-start gap-2'>
                    <span className='w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 flex-shrink-0' />
                    Search by city name for location-based results
                  </li>
                  <li className='flex items-start gap-2'>
                    <span className='w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 flex-shrink-0' />
                    Our fuzzy search handles typos - "appartment" will still find "apartment"
                  </li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ListingItem from '../components/ListingItem';
import { parseJsonSafely, fetchWithRefresh, handleApiResponse } from '../utils/http';
import Button from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';

export default function Search() {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebardata, setSidebardata] = useState({
    searchTerm: '',
    type: 'all',
    parking: false,
    furnished: false,
    offer: false,
    category: 'all',
    minPrice: '',
    maxPrice: '',
    minBedrooms: '',
    minBathrooms: '',
    sort: 'createdAt',
    order: 'desc',
  });

  const [loading, setLoading] = useState(false);
  const [listings, setListings] = useState([]);
  const [showMore, setShowMore] = useState(false);
  const [categories, setCategories] = useState([]);
  const [searchTimeout, setSearchTimeout] = useState(null);
  const [error, setError] = useState('');
  const [view, setView] = useState('grid');

  useEffect(() => {
    // Populate categories for dropdown
    (async () => {
      try {
        const res = await fetchWithRefresh('/api/category/list');
        const data = await handleApiResponse(res);
        if (Array.isArray(data)) setCategories(data);
      } catch (e) {
        setError(e.message || 'Failed to load categories');
      }
    })();

    const urlParams = new URLSearchParams(location.search);
    const searchTermFromUrl = urlParams.get('searchTerm');
    const typeFromUrl = urlParams.get('type');
    const parkingFromUrl = urlParams.get('parking');
    const furnishedFromUrl = urlParams.get('furnished');
    const offerFromUrl = urlParams.get('offer');
    const sortFromUrl = urlParams.get('sort');
    const orderFromUrl = urlParams.get('order');
    const categoryFromUrl = urlParams.get('category');
    const minPriceFromUrl = urlParams.get('minPrice');
    const maxPriceFromUrl = urlParams.get('maxPrice');
    const minBedroomsFromUrl = urlParams.get('minBedrooms');
    const minBathroomsFromUrl = urlParams.get('minBathrooms');
    const viewFromUrl = urlParams.get('view');

    if (viewFromUrl === 'list' || viewFromUrl === 'grid') {
      setView(viewFromUrl);
    }

    if (
      searchTermFromUrl ||
      typeFromUrl ||
      parkingFromUrl ||
      furnishedFromUrl ||
      offerFromUrl ||
      sortFromUrl ||
      orderFromUrl
    ) {
      setSidebardata({
        searchTerm: searchTermFromUrl || '',
        type: typeFromUrl || 'all',
        parking: parkingFromUrl === 'true' ? true : false,
        furnished: furnishedFromUrl === 'true' ? true : false,
        offer: offerFromUrl === 'true' ? true : false,
        category: categoryFromUrl || 'all',
        minPrice: minPriceFromUrl || '',
        maxPrice: maxPriceFromUrl || '',
        minBedrooms: minBedroomsFromUrl || '',
        minBathrooms: minBathroomsFromUrl || '',
        sort: sortFromUrl || 'createdAt',
        order: orderFromUrl || 'desc',
      });
    }

    const fetchListings = async () => {
      setLoading(true);
      setError('');
      setShowMore(false);
      const searchQuery = urlParams.toString();
      try {
        const res = await fetchWithRefresh(`/api/listing/get?${searchQuery}`);
        const data = await handleApiResponse(res);
        const items = data?.data?.listings || [];
        const hasMore = Boolean(data?.data?.pagination?.hasMore);
        setShowMore(hasMore);
        setListings(items);
      } catch (e) {
        setListings([]);
        setShowMore(false);
        setError(e.message || 'Failed to load listings');
      } finally {
        setLoading(false);
      }
    };

    fetchListings();
  }, [location.search]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
    };
  }, [searchTimeout]);

  // Debounced search function
  const debouncedSearch = useCallback((searchTerm) => {
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    const timeout = setTimeout(() => {
      const urlParams = new URLSearchParams();
      urlParams.set('searchTerm', searchTerm);
      urlParams.set('type', sidebardata.type);
      urlParams.set('parking', sidebardata.parking);
      urlParams.set('furnished', sidebardata.furnished);
      urlParams.set('offer', sidebardata.offer);
      urlParams.set('category', sidebardata.category);
      if (sidebardata.minPrice) urlParams.set('minPrice', sidebardata.minPrice);
      if (sidebardata.maxPrice) urlParams.set('maxPrice', sidebardata.maxPrice);
      if (sidebardata.minBedrooms) urlParams.set('minBedrooms', sidebardata.minBedrooms);
      if (sidebardata.minBathrooms) urlParams.set('minBathrooms', sidebardata.minBathrooms);
      urlParams.set('sort', sidebardata.sort);
      urlParams.set('order', sidebardata.order);
      const searchQuery = urlParams.toString();
      navigate(`/search?${searchQuery}`);
    }, 500); // 500ms delay
    
    setSearchTimeout(timeout);
  }, [sidebardata, navigate, searchTimeout]);

  const handleChange = (e) => {
    const { id, value, checked, type } = e.target;

    if (id === 'searchTerm') {
      setSidebardata({ ...sidebardata, searchTerm: value });
      // Trigger debounced search for search term
      debouncedSearch(value);
    }

    // Handle radio buttons for property type
    if (id === 'all' || id === 'rent' || id === 'sale') {
      setSidebardata({ ...sidebardata, type: id });
    }

    // Handle checkboxes for amenities
    if (id === 'parking' || id === 'furnished' || id === 'offer') {
      setSidebardata({
        ...sidebardata,
        [id]: checked,
      });
    }

    // Handle sort order
    if (id === 'sort_order') {
      const sort = value.split('_')[0] || 'createdAt';
      const order = value.split('_')[1] || 'desc';
      setSidebardata({ ...sidebardata, sort, order });
    }

    // Handle other form fields
    if (
      id === 'category' ||
      id === 'minPrice' ||
      id === 'maxPrice' ||
      id === 'minBedrooms' ||
      id === 'minBathrooms'
    ) {
      setSidebardata({ ...sidebardata, [id]: value });
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const urlParams = new URLSearchParams();
    urlParams.set('searchTerm', sidebardata.searchTerm);
    urlParams.set('type', sidebardata.type);
    urlParams.set('parking', sidebardata.parking);
    urlParams.set('furnished', sidebardata.furnished);
    urlParams.set('offer', sidebardata.offer);
    urlParams.set('category', sidebardata.category);
    if (sidebardata.minPrice) urlParams.set('minPrice', sidebardata.minPrice);
    if (sidebardata.maxPrice) urlParams.set('maxPrice', sidebardata.maxPrice);
    if (sidebardata.minBedrooms) urlParams.set('minBedrooms', sidebardata.minBedrooms);
    if (sidebardata.minBathrooms) urlParams.set('minBathrooms', sidebardata.minBathrooms);
    urlParams.set('sort', sidebardata.sort);
    urlParams.set('order', sidebardata.order);
    urlParams.set('view', view);
    const searchQuery = urlParams.toString();
    navigate(`/search?${searchQuery}`);
  };

  const setViewAndSyncUrl = (next) => {
    setView(next);
    const urlParams = new URLSearchParams(location.search);
    urlParams.set('view', next);
    navigate(`/search?${urlParams.toString()}`);
  };

  const onShowMoreClick = async () => {
    try {
      const numberOfListings = listings.length;
      const startIndex = numberOfListings;
      const urlParams = new URLSearchParams(location.search);
      urlParams.set('startIndex', startIndex);
      const searchQuery = urlParams.toString();
      const res = await fetchWithRefresh(`/api/listing/get?${searchQuery}`);
      const data = await handleApiResponse(res);
      const items = data?.data?.listings || [];
      const hasMore = Boolean(data?.data?.pagination?.hasMore);
      setShowMore(hasMore);
      setListings([...listings, ...items]);
    } catch (e) {
      setError(e.message || 'Failed to load more listings');
      setShowMore(false);
    }
  };
  return (
    <div className='min-h-screen bg-gray-50'>
      <div className='max-w-6xl mx-auto px-4 py-8'>
        {/* Header Section */}
        <div className='mb-8'>
          <h1 className='text-3xl font-bold text-gray-900 mb-2'>
            Find Properties
          </h1>
          <p className='text-gray-600'>
            Search and filter properties to find exactly what you're looking for
          </p>
        </div>

        {error && (
          <div className='mb-6 p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm'>
            {error}
          </div>
        )}

        <div className='flex flex-col lg:flex-row gap-8'>
          {/* Search Sidebar */}
          <div className='lg:w-80 flex-shrink-0'>
            <div className='bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden sticky top-24'>
              <div className='bg-gray-50 px-4 py-3 border-b border-gray-200'>
                <h2 className='text-lg font-semibold text-gray-900'>
                  Filters
                </h2>
              </div>
              
              <form onSubmit={handleSubmit} className='p-4 space-y-4'>
                {/* Search Term */}
                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-2'>
                    Search
                  </label>
                  <div className='relative'>
                    <input
                      type='text'
                      id='searchTerm'
                      placeholder='Search by location, property type, or keywords...'
                      className='w-full border border-gray-300 rounded-lg p-3 text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors'
                      value={sidebardata.searchTerm}
                      onChange={handleChange}
                    />
                    <div className='absolute right-4 top-1/2 transform -translate-y-1/2'>
                      {sidebardata.searchTerm ? (
                        <svg className='w-5 h-5 text-blue-600 animate-pulse' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                          <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' />
                        </svg>
                      ) : (
                        <svg className='w-5 h-5 text-gray-400' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                          <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' />
                        </svg>
                      )}
                    </div>
                  </div>
                  
                  {/* Search Suggestions */}
                  {!sidebardata.searchTerm && (
                    <div className='mt-3'>
                      <p className='text-xs text-gray-500 mb-2'>Try searching for:</p>
                      <div className='flex flex-wrap gap-2'>
                        {['House', 'Apartment', 'Villa', 'Office', 'Shop', 'Land'].map((suggestion) => (
                          <button
                            key={suggestion}
                            type='button'
                            onClick={() => {
                              setSidebardata({ ...sidebardata, searchTerm: suggestion });
                              debouncedSearch(suggestion);
                            }}
                            className='text-xs bg-gray-100 hover:bg-blue-100 text-gray-700 hover:text-blue-700 px-3 py-1 rounded-full transition-colors duration-200'
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Property Type */}
                <div>
                  <label className='block text-sm font-bold text-gray-800 mb-3 flex items-center gap-2'>
                    <svg className='w-4 h-4 text-blue-600' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                      <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z' />
                    </svg>
                    Property Type
                  </label>
                  <div className='space-y-3'>
                    <label className={`flex items-center gap-3 cursor-pointer p-3 rounded-xl border-2 transition-all duration-300 ${
                      sidebardata.type === 'all' 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200 hover:border-blue-300'
                    }`}>
                      <input
                        type='radio'
                        name='type'
                        id='all'
                        value='all'
                        checked={sidebardata.type === 'all'}
                        onChange={handleChange}
                        className='w-4 h-4 text-blue-600 focus:ring-2 focus:ring-blue-500'
                      />
                      <div className='flex items-center gap-2'>
                        <svg className='w-5 h-5 text-gray-600' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                          <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' />
                        </svg>
                        <span className='font-medium'>All Types</span>
                      </div>
                    </label>
                    <label className={`flex items-center gap-3 cursor-pointer p-3 rounded-xl border-2 transition-all duration-300 ${
                      sidebardata.type === 'rent' 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200 hover:border-blue-300'
                    }`}>
                      <input
                        type='radio'
                        name='type'
                        id='rent'
                        value='rent'
                        checked={sidebardata.type === 'rent'}
                        onChange={handleChange}
                        className='w-4 h-4 text-blue-600 focus:ring-2 focus:ring-blue-500'
                      />
                      <div className='flex items-center gap-2'>
                        <svg className='w-5 h-5 text-blue-600' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                          <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z' />
                        </svg>
                        <span className='font-medium'>For Rent</span>
                      </div>
                    </label>
                    <label className={`flex items-center gap-3 cursor-pointer p-3 rounded-xl border-2 transition-all duration-300 ${
                      sidebardata.type === 'sale' 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200 hover:border-blue-300'
                    }`}>
                      <input
                        type='radio'
                        name='type'
                        id='sale'
                        value='sale'
                        checked={sidebardata.type === 'sale'}
                        onChange={handleChange}
                        className='w-4 h-4 text-blue-600 focus:ring-2 focus:ring-blue-500'
                      />
                      <div className='flex items-center gap-2'>
                        <svg className='w-5 h-5 text-green-600' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                          <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1' />
                        </svg>
                        <span className='font-medium'>For Sale</span>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Category */}
                <div>
                  <label className='block text-sm font-bold text-gray-800 mb-3 flex items-center gap-2'>
                    <svg className='w-4 h-4 text-blue-600' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                      <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' />
                    </svg>
                    Category
                  </label>
                  <select
                    id='category'
                    className='w-full border-2 border-gray-200 rounded-xl p-4 text-gray-900 focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-white shadow-sm hover:shadow-md focus:shadow-lg'
                    value={sidebardata.category}
                    onChange={handleChange}
                  >
                    <option value='all'>All Categories</option>
                    {categories.map((c) => (
                      <option key={c._id} value={c.slug}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {/* Price Range */}
                <div>
                  <label className='block text-sm font-bold text-gray-800 mb-3 flex items-center gap-2'>
                    <svg className='w-4 h-4 text-blue-600' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                      <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1' />
                    </svg>
                    Price Range
                  </label>
                  <div className='grid grid-cols-2 gap-3'>
                    <div>
                      <label className='block text-xs text-gray-600 mb-1'>Min Price</label>
                      <input
                        type='number'
                        id='minPrice'
                        placeholder='₹0'
                        className='w-full border-2 border-gray-200 rounded-lg p-3 text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-white'
                        value={sidebardata.minPrice}
                        onChange={handleChange}
                      />
                    </div>
                    <div>
                      <label className='block text-xs text-gray-600 mb-1'>Max Price</label>
                      <input
                        type='number'
                        id='maxPrice'
                        placeholder='₹1Cr+'
                        className='w-full border-2 border-gray-200 rounded-lg p-3 text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-white'
                        value={sidebardata.maxPrice}
                        onChange={handleChange}
                      />
                    </div>
                  </div>
                </div>

                {/* Bedrooms & Bathrooms */}
                <div>
                  <label className='block text-sm font-bold text-gray-800 mb-3 flex items-center gap-2'>
                    <svg className='w-4 h-4 text-blue-600' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                      <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' />
                    </svg>
                    Rooms
                  </label>
                  <div className='grid grid-cols-2 gap-3'>
                    <div>
                      <label className='block text-xs text-gray-600 mb-1'>Min Bedrooms</label>
                      <input
                        type='number'
                        id='minBedrooms'
                        placeholder='Any'
                        className='w-full border-2 border-gray-200 rounded-lg p-3 text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-white'
                        value={sidebardata.minBedrooms}
                        onChange={handleChange}
                      />
                    </div>
                    <div>
                      <label className='block text-xs text-gray-600 mb-1'>Min Bathrooms</label>
                      <input
                        type='number'
                        id='minBathrooms'
                        placeholder='Any'
                        className='w-full border-2 border-gray-200 rounded-lg p-3 text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-white'
                        value={sidebardata.minBathrooms}
                        onChange={handleChange}
                      />
                    </div>
                  </div>
                </div>

                {/* Amenities */}
                <div>
                  <label className='block text-sm font-bold text-gray-800 mb-3 flex items-center gap-2'>
                    <svg className='w-4 h-4 text-blue-600' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                      <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' />
                    </svg>
                    Amenities
                  </label>
                  <div className='space-y-3'>
                    <label className={`flex items-center gap-3 cursor-pointer p-3 rounded-lg border transition-all duration-300 ${
                      sidebardata.parking 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200 hover:bg-blue-50 hover:border-blue-300'
                    }`}>
                      <input
                        type='checkbox'
                        id='parking'
                        onChange={handleChange}
                        checked={sidebardata.parking}
                        className='w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500'
                      />
                      <svg className='w-5 h-5 text-gray-600' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                        <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V9a2 2 0 00-2-2h-2' />
                      </svg>
                      <span className='font-medium'>Parking</span>
                    </label>
                    <label className={`flex items-center gap-3 cursor-pointer p-3 rounded-lg border transition-all duration-300 ${
                      sidebardata.furnished 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200 hover:bg-blue-50 hover:border-blue-300'
                    }`}>
                      <input
                        type='checkbox'
                        id='furnished'
                        onChange={handleChange}
                        checked={sidebardata.furnished}
                        className='w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500'
                      />
                      <svg className='w-5 h-5 text-gray-600' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                        <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z' />
                      </svg>
                      <span className='font-medium'>Furnished</span>
                    </label>
                    <label className={`flex items-center gap-3 cursor-pointer p-3 rounded-lg border transition-all duration-300 ${
                      sidebardata.offer 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200 hover:bg-blue-50 hover:border-blue-300'
                    }`}>
                      <input
                        type='checkbox'
                        id='offer'
                        onChange={handleChange}
                        checked={sidebardata.offer}
                        className='w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500'
                      />
                      <svg className='w-5 h-5 text-gray-600' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                        <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z' />
                      </svg>
                      <span className='font-medium'>Special Offer</span>
                    </label>
                  </div>
                </div>

                {/* Sort */}
                <div>
                  <label className='block text-sm font-bold text-gray-800 mb-3 flex items-center gap-2'>
                    <svg className='w-4 h-4 text-blue-600' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                      <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12' />
                    </svg>
                    Sort By
                  </label>
                  <select
                    onChange={handleChange}
                    defaultValue={'createdAt_desc'}
                    id='sort_order'
                    className='w-full border-2 border-gray-200 rounded-xl p-4 text-gray-900 focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-white shadow-sm hover:shadow-md focus:shadow-lg'
                  >
                    <option value='regularPrice_desc'>Price: High to Low</option>
                    <option value='regularPrice_asc'>Price: Low to High</option>
                    <option value='createdAt_desc'>Newest First</option>
                    <option value='createdAt_asc'>Oldest First</option>
                  </select>
                </div>

                {/* Search Button */}
                <button className='w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-4 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 transform flex items-center justify-center gap-2'>
                  <svg className='w-5 h-5' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                    <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' />
                  </svg>
                  Search Properties
                </button>
              </form>
            </div>
          </div>

          {/* Results Section */}
          <div className='flex-1'>
            <Card className='overflow-hidden'>
              <div className='bg-gradient-to-r from-gray-50 to-blue-50 px-6 py-4 border-b border-gray-200'>
                <div className='flex flex-col gap-4 md:flex-row md:items-center md:justify-between'>
                  <div>
                    <h2 className='text-2xl font-bold text-gray-900 flex items-center gap-3'>
                      <svg className='w-6 h-6 text-blue-600' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                        <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' />
                      </svg>
                      Property Results
                      {!loading && listings.length > 0 && (
                        <span className='bg-blue-100 text-blue-800 text-sm px-3 py-1 rounded-full font-medium'>
                          {listings.length} found
                        </span>
                      )}
                    </h2>
                    <p className='text-sm text-gray-600 mt-1'>Compare listings, save favorites, and contact agents.</p>
                  </div>

                  <div className='flex items-center gap-3'>
                    <div className='inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm'>
                      <button
                        type='button'
                        onClick={() => setViewAndSyncUrl('grid')}
                        className={`px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${
                          view === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-50'
                        }`}
                        aria-pressed={view === 'grid'}
                      >
                        Grid
                      </button>
                      <button
                        type='button'
                        onClick={() => setViewAndSyncUrl('list')}
                        className={`px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${
                          view === 'list' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-50'
                        }`}
                        aria-pressed={view === 'list'}
                      >
                        List
                      </button>
                    </div>

                    <select
                      onChange={handleChange}
                      value={`${sidebardata.sort}_${sidebardata.order}`}
                      id='sort_order'
                      className='border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold bg-white shadow-sm hover:shadow-md focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all'
                      aria-label='Sort results'
                    >
                      <option value='regularPrice_desc'>Price: High to Low</option>
                      <option value='regularPrice_asc'>Price: Low to High</option>
                      <option value='createdAt_desc'>Newest First</option>
                      <option value='createdAt_asc'>Oldest First</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className='p-6'>
                {!loading && listings.length === 0 && (
                  <EmptyState
                    title='No properties found'
                    description='Try adjusting filters like price range, category, or bedrooms to broaden results.'
                    actionLabel='Clear filters'
                    onAction={() => navigate('/search')}
                  />
                )}

                {loading && (
                  <div className={view === 'list' ? 'space-y-4' : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6'}>
                    {Array.from({ length: 6 }).map((_, idx) => (
                      <Card key={idx} className={view === 'list' ? 'p-0 md:flex overflow-hidden' : 'p-0'}>
                        <Skeleton className={view === 'list' ? 'h-56 md:h-44 md:w-80 rounded-none' : 'h-56 rounded-none'} />
                        <div className='p-6 space-y-3 w-full'>
                          <Skeleton className='h-6 w-2/3' />
                          <Skeleton className='h-4 w-1/2' />
                          <div className='flex gap-2'>
                            <Skeleton className='h-4 w-14' />
                            <Skeleton className='h-4 w-14' />
                            <Skeleton className='h-4 w-20' />
                          </div>
                          <Skeleton className='h-4 w-full' />
                          <Skeleton className='h-4 w-5/6' />
                        </div>
                      </Card>
                    ))}
                  </div>
                )}

                {!loading && listings.length > 0 && (
                  <div className={view === 'list' ? 'space-y-4' : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6'}>
                    {listings.map((listing) => (
                      <ListingItem key={listing._id} listing={listing} layout={view} />
                    ))}
                  </div>
                )}

                {showMore && !loading && (
                  <div className='text-center mt-8'>
                    <Button onClick={onShowMoreClick} variant='success' size='lg'>
                      Show More Properties
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { HiFilter, HiX, HiChevronDown, HiChevronUp, HiHome, HiOfficeBuilding, HiCurrencyRupee } from 'react-icons/hi';

export default function SearchFilters({ filters, onChange, onClear, className = '' }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [popularCities, setPopularCities] = useState([]);
  const [propertyTypes, setPropertyTypes] = useState([]);

  // Fetch filter options
  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const res = await fetch('/api/listing/popular-searches?limit=10');
        const data = await res.json();
        if (data.success && data.data) {
          setPopularCities(data.data.popularCities || []);
          setPropertyTypes(data.data.popularPropertyTypes || []);
        }
      } catch (error) {
        console.error('Error fetching filter options:', error);
      }
    };
    fetchOptions();
  }, []);

  const handleChange = (key, value) => {
    onChange({ ...filters, [key]: value });
  };

  const activeFiltersCount = Object.entries(filters).filter(([key, value]) => {
    if (key === 'sort' || key === 'order') return false;
    return value && value !== 'all' && value !== '';
  }).length;

  const priceRanges = [
    { label: 'Any Price', value: '', min: '', max: '' },
    { label: 'Under 25L', min: 0, max: 2500000 },
    { label: '25L - 50L', min: 2500000, max: 5000000 },
    { label: '50L - 1Cr', min: 5000000, max: 10000000 },
    { label: '1Cr - 2Cr', min: 10000000, max: 20000000 },
    { label: '2Cr - 5Cr', min: 20000000, max: 50000000 },
    { label: 'Above 5Cr', min: 50000000, max: '' },
  ];

  const isPriceRangeSelected = (range) => {
    if (!range.min && !range.max) {
      return !filters.minPrice && !filters.maxPrice;
    }
    return String(filters.minPrice) === String(range.min) && String(filters.maxPrice) === String(range.max);
  };

  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden ${className}`}>
      {/* Filter Header */}
      <div className='bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200'>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between p-4 text-left"
        >
          <div className="flex items-center gap-3">
            <div className='w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center'>
              <HiFilter className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-semibold text-slate-800">Filters</span>
              {activeFiltersCount > 0 && (
                <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-blue-600 text-white rounded-full">
                  {activeFiltersCount} active
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeFiltersCount > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClear();
                }}
                className="text-sm text-red-600 hover:text-red-700 font-medium px-3 py-1 rounded-lg hover:bg-red-50 transition-colors"
              >
                Clear All
              </button>
            )}
            {isExpanded ? (
              <HiChevronUp className="w-5 h-5 text-slate-400" />
            ) : (
              <HiChevronDown className="w-5 h-5 text-slate-400" />
            )}
          </div>
        </button>
      </div>

      {/* Quick Filters (Always Visible) */}
      <div className="p-4 space-y-4 border-b border-slate-100">
        {/* Listing Type */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Listing Type
          </label>
          <div className="flex gap-2">
            {[
              { value: 'all', label: 'All', icon: null },
              { value: 'sale', label: 'Buy', icon: HiHome },
              { value: 'rent', label: 'Rent', icon: HiCurrencyRupee },
            ].map((type) => (
              <button
                key={type.value}
                onClick={() => handleChange('type', type.value)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium rounded-xl transition-all ${
                  (filters.type || 'all') === type.value
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {type.icon && <type.icon className="w-4 h-4" />}
                {type.label}
              </button>
            ))}
          </div>
        </div>

        {/* Property Category */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Category
          </label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: 'all', label: 'All Types', icon: null },
              { value: 'residential', label: 'Residential', icon: HiHome },
              { value: 'commercial', label: 'Commercial', icon: HiOfficeBuilding },
              { value: 'land', label: 'Land', icon: null },
            ].map((cat) => (
              <button
                key={cat.value}
                onClick={() => handleChange('propertyCategory', cat.value)}
                className={`flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl transition-all ${
                  (filters.propertyCategory || 'all') === cat.value
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-200'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {cat.icon && <cat.icon className="w-4 h-4" />}
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Expanded Filters */}
      {isExpanded && (
        <div className="p-4 space-y-5">
          {/* Price Range */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              Price Range
            </label>
            <div className="grid grid-cols-2 gap-2">
              {priceRanges.map((range, index) => (
                <button
                  key={index}
                  onClick={() => {
                    handleChange('minPrice', range.min || '');
                    handleChange('maxPrice', range.max || '');
                  }}
                  className={`px-3 py-2.5 text-sm font-medium rounded-xl border-2 transition-all ${
                    isPriceRangeSelected(range)
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                  }`}
                >
                  {range.label}
                </button>
              ))}
            </div>

            {/* Custom Price Range */}
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">Min Price</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₹</span>
                  <input
                    type="number"
                    placeholder="0"
                    value={filters.minPrice || ''}
                    onChange={(e) => handleChange('minPrice', e.target.value)}
                    className="w-full pl-7 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">Max Price</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₹</span>
                  <input
                    type="number"
                    placeholder="Any"
                    value={filters.maxPrice || ''}
                    onChange={(e) => handleChange('maxPrice', e.target.value)}
                    className="w-full pl-7 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Bedrooms */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              Bedrooms
            </label>
            <div className="flex gap-2">
              {['any', '1', '2', '3', '4', '5+'].map((bed) => (
                <button
                  key={bed}
                  onClick={() => handleChange('bedrooms', bed === 'any' ? '' : bed.replace('+', ''))}
                  className={`flex-1 px-2 py-2.5 text-sm font-medium rounded-xl border-2 transition-all ${
                    (filters.bedrooms || '') === (bed === 'any' ? '' : bed.replace('+', ''))
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                  }`}
                >
                  {bed === 'any' ? 'Any' : bed}
                </button>
              ))}
            </div>
          </div>

          {/* Bathrooms */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              Bathrooms
            </label>
            <div className="flex gap-2">
              {['any', '1', '2', '3', '4+'].map((bath) => (
                <button
                  key={bath}
                  onClick={() => handleChange('bathrooms', bath === 'any' ? '' : bath.replace('+', ''))}
                  className={`flex-1 px-2 py-2.5 text-sm font-medium rounded-xl border-2 transition-all ${
                    (filters.bathrooms || '') === (bath === 'any' ? '' : bath.replace('+', ''))
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                  }`}
                >
                  {bath === 'any' ? 'Any' : bath}
                </button>
              ))}
            </div>
          </div>

          {/* City Selection */}
          {popularCities.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                City
              </label>
              <select
                value={filters.city || ''}
                onChange={(e) => handleChange('city', e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white cursor-pointer"
              >
                <option value="">All Cities</option>
                {popularCities.map((city, index) => (
                  <option key={index} value={city.name}>
                    {city.name} ({city.count})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Property Type */}
          {propertyTypes.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                Property Type
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleChange('propertyType', '')}
                  className={`px-4 py-2 text-sm font-medium rounded-full transition-all ${
                    !filters.propertyType
                      ? 'bg-purple-600 text-white shadow-md shadow-purple-200'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  All
                </button>
                {propertyTypes.map((type, index) => (
                  <button
                    key={index}
                    onClick={() => handleChange('propertyType', type.name)}
                    className={`px-4 py-2 text-sm font-medium rounded-full transition-all capitalize ${
                      filters.propertyType === type.name
                        ? 'bg-purple-600 text-white shadow-md shadow-purple-200'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {type.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Additional Features */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              Features
            </label>
            <div className="space-y-2">
              {[
                { key: 'offer', label: 'Special Offers', description: 'Properties with discounts' },
                { key: 'furnished', label: 'Furnished', description: 'Ready to move in' },
                { key: 'parking', label: 'Parking', description: 'Has parking space' },
              ].map((feature) => (
                <label
                  key={feature.key}
                  className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${
                    filters[feature.key] === 'true'
                      ? 'bg-blue-50 border-2 border-blue-500'
                      : 'bg-slate-50 border-2 border-transparent hover:bg-slate-100'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={filters[feature.key] === 'true'}
                    onChange={(e) => handleChange(feature.key, e.target.checked ? 'true' : '')}
                    className="w-5 h-5 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-slate-800">{feature.label}</span>
                    <p className="text-xs text-slate-500">{feature.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Sort Options */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              Sort By
            </label>
            <select
              value={`${filters.sort || 'relevance'}-${filters.order || 'desc'}`}
              onChange={(e) => {
                const [sort, order] = e.target.value.split('-');
                handleChange('sort', sort);
                handleChange('order', order);
              }}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white cursor-pointer"
            >
              <option value="relevance-desc">Most Relevant</option>
              <option value="createdAt-desc">Newest First</option>
              <option value="createdAt-asc">Oldest First</option>
              <option value="regularPrice-asc">Price: Low to High</option>
              <option value="regularPrice-desc">Price: High to Low</option>
            </select>
          </div>

          {/* Apply Filters Button (Mobile) */}
          <button
            onClick={() => {}}
            className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all lg:hidden"
          >
            Apply Filters
          </button>
        </div>
      )}
    </div>
  );
}

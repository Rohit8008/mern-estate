import { useState, useEffect, useId } from 'react';
import { HiFilter, HiX, HiChevronDown, HiChevronUp, HiHome, HiOfficeBuilding, HiCurrencyRupee } from 'react-icons/hi';
import { apiClient } from '../../utils/http';
import { currencySymbol } from '../../utils/currency';
import { useTranslation } from 'react-i18next';

export default function SearchFilters({ filters, onChange, onClear, className = '' }) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(true);
  const uid = useId();
  const fid = (name) => `${uid}-${name}`;
  const [popularCities, setPopularCities] = useState([]);
  const [propertyTypes, setPropertyTypes] = useState([]);

  // Fetch filter options
  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const data = await apiClient.get('/listing/popular-searches?limit=10');
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
        {/* A div, not a button: "Clear all" is its own button and buttons cannot nest. */}
        <div className="w-full flex items-center justify-between p-4 text-left">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-expanded={isExpanded}
            className="flex-1 flex items-center gap-3 text-left rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <div className='w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center'>
              <HiFilter className="w-5 h-5 text-white" aria-hidden="true" />
            </div>
            <div>
              <span className="font-semibold text-slate-800">{t('searchFilters.filters')}</span>
              {activeFiltersCount > 0 && (
                <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-blue-600 text-white rounded-full">
                  {activeFiltersCount} active
                </span>
              )}
            </div>
          </button>
          <div className="flex items-center gap-2">
            {activeFiltersCount > 0 && (
              <button
                type="button"
                onClick={onClear}
                className="text-sm text-red-600 hover:text-red-700 font-medium px-3 py-1 rounded-lg hover:bg-red-50 transition-colors"
              >{t('searchFilters.clearAll')}</button>
            )}
            {/* Mouse convenience only; the toggle above is the keyboard control. */}
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <HiChevronUp className="w-5 h-5 text-slate-400" />
              ) : (
                <HiChevronDown className="w-5 h-5 text-slate-400" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Quick Filters (Always Visible) */}
      <div className="p-4 space-y-4 border-b border-slate-100">
        {/* Listing Type */}
        <div>
          <span id={fid('listingType')} className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{t('searchFilters.listingType')}</span>
          <div className="flex gap-2" role="group" aria-labelledby={fid('listingType')}>
            {[
              { value: 'all', label: 'All', icon: null },
              { value: 'sale', label: 'Buy', icon: HiHome },
              { value: 'rent', label: 'Rent', icon: HiCurrencyRupee },
            ].map((type) => (
              <button
                key={type.value}
                type="button"
                aria-pressed={(filters.type || 'all') === type.value}
                onClick={() => handleChange('type', type.value)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium rounded-xl transition-all ${
                  (filters.type || 'all') === type.value
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {type.icon && <type.icon className="w-4 h-4" aria-hidden="true" />}
                {type.label}
              </button>
            ))}
          </div>
        </div>

        {/* Property Category */}
        <div>
          <span id={fid('category')} className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{t('searchFilters.category')}</span>
          <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby={fid('category')}>
            {[
              { value: 'all', label: 'All Types', icon: null },
              { value: 'residential', label: 'Residential', icon: HiHome },
              { value: 'commercial', label: 'Commercial', icon: HiOfficeBuilding },
              { value: 'land', label: 'Land', icon: null },
            ].map((cat) => (
              <button
                key={cat.value}
                type="button"
                aria-pressed={(filters.propertyCategory || 'all') === cat.value}
                onClick={() => handleChange('propertyCategory', cat.value)}
                className={`flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl transition-all ${
                  (filters.propertyCategory || 'all') === cat.value
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-200'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {cat.icon && <cat.icon className="w-4 h-4" aria-hidden="true" />}
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
            <span id={fid('priceRange')} className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">{t('searchFilters.priceRange')}</span>
            <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby={fid('priceRange')}>
              {priceRanges.map((range, index) => (
                <button
                  key={index}
                  type="button"
                  aria-pressed={isPriceRangeSelected(range)}
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
                <label htmlFor={fid('minPrice')} className="block text-xs text-slate-500 mb-1.5">{t('searchFilters.minPrice')}</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm" aria-hidden="true">{currencySymbol()}</span>
                  <input
                    id={fid('minPrice')}
                    type="number"
                    placeholder="0"
                    value={filters.minPrice || ''}
                    onChange={(e) => handleChange('minPrice', e.target.value)}
                    className="w-full pl-7 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div>
                <label htmlFor={fid('maxPrice')} className="block text-xs text-slate-500 mb-1.5">{t('searchFilters.maxPrice')}</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm" aria-hidden="true">{currencySymbol()}</span>
                  <input
                    id={fid('maxPrice')}
                    type="number"
                    placeholder={t('searchFilters.any')}
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
            <span id={fid('bedrooms')} className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">{t('searchFilters.bedrooms')}</span>
            <div className="flex gap-2" role="group" aria-labelledby={fid('bedrooms')}>
              {['any', '1', '2', '3', '4', '5+'].map((bed) => (
                <button
                  key={bed}
                  type="button"
                  aria-pressed={(filters.bedrooms || '') === (bed === 'any' ? '' : bed.replace('+', ''))}
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
            <span id={fid('bathrooms')} className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">{t('searchFilters.bathrooms')}</span>
            <div className="flex gap-2" role="group" aria-labelledby={fid('bathrooms')}>
              {['any', '1', '2', '3', '4+'].map((bath) => (
                <button
                  key={bath}
                  type="button"
                  aria-pressed={(filters.bathrooms || '') === (bath === 'any' ? '' : bath.replace('+', ''))}
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
              <label htmlFor={fid('city')} className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">{t('searchFilters.city')}</label>
              <select
                id={fid('city')}
                value={filters.city || ''}
                onChange={(e) => handleChange('city', e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white cursor-pointer"
              >
                <option value="">{t('searchFilters.allCities')}</option>
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
              <span id={fid('propertyType')} className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">{t('searchFilters.propertyType')}</span>
              <div className="flex flex-wrap gap-2" role="group" aria-labelledby={fid('propertyType')}>
                <button
                  type="button"
                  aria-pressed={!filters.propertyType}
                  onClick={() => handleChange('propertyType', '')}
                  className={`px-4 py-2 text-sm font-medium rounded-full transition-all ${
                    !filters.propertyType
                      ? 'bg-purple-600 text-white shadow-md shadow-purple-200'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >{t('searchFilters.all')}</button>
                {propertyTypes.map((type, index) => (
                  <button
                    key={index}
                    type="button"
                    aria-pressed={filters.propertyType === type.name}
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
            <span id={fid('features')} className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">{t('searchFilters.features')}</span>
            <div className="space-y-2" role="group" aria-labelledby={fid('features')}>
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
            <label htmlFor={fid('sort')} className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">{t('searchFilters.sortBy')}</label>
            <select
              id={fid('sort')}
              value={`${filters.sort || 'relevance'}-${filters.order || 'desc'}`}
              onChange={(e) => {
                const [sort, order] = e.target.value.split('-');
                handleChange('sort', sort);
                handleChange('order', order);
              }}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white cursor-pointer"
            >
              <option value="relevance-desc">{t('searchFilters.mostRelevant')}</option>
              <option value="createdAt-desc">{t('searchFilters.newestFirst')}</option>
              <option value="createdAt-asc">{t('searchFilters.oldestFirst')}</option>
              <option value="regularPrice-asc">{t('searchFilters.priceLowToHigh')}</option>
              <option value="regularPrice-desc">{t('searchFilters.priceHighToLow')}</option>
            </select>
          </div>

          {/* Apply Filters Button (Mobile) */}
          <button
            onClick={() => {}}
            className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all lg:hidden"
          >{t('searchFilters.applyFilters')}</button>
        </div>
      )}
    </div>
  );
}

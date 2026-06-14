import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, ZoomControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { apiClient, normalizeImageUrl } from '../utils/http';
import PropertyTypeFields from '../components/PropertyTypeFields';
import DynamicCategoryFields from '../components/DynamicCategoryFields';

// Fix for default markers in react-leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom marker for better visibility
const customIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,' + btoa(`
    <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="12" fill="#3B82F6" stroke="#FFFFFF" stroke-width="3"/>
      <circle cx="16" cy="16" r="6" fill="#FFFFFF"/>
    </svg>
  `),
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16]
});

// Click handler for the map
function LocationPicker({ onLocationSelect }) {
  useMapEvents({
    click: (e) => {
      onLocationSelect(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// Smoothly fly to a new location without re-mounting the map
function FlyToLocation({ lat, lng, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (lat && lng) {
      map.flyTo([lat, lng], zoom || map.getZoom(), { duration: 1 });
    }
  }, [lat, lng, zoom, map]);
  return null;
}

// Enhanced map controls component with Google Maps-like features
function MapControls({ mapLayer, onLayerChange, currentLocation }) {
  const map = useMap();

  const resetView = () => {
    map.setView(defaultCenter, 12);
  };

  const fitToLocation = () => {
    // Only fit to location if we have a location set
    if (currentLocation && currentLocation.lat && currentLocation.lng) {
      map.setView([currentLocation.lat, currentLocation.lng], 16);
    }
  };

  const zoomIn = () => {
    map.zoomIn();
  };

  const zoomOut = () => {
    map.zoomOut();
  };

  return (
    <div className="leaflet-control-container">
      <div className="leaflet-top leaflet-right">
        <div className="leaflet-control leaflet-bar bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
          <button
            onClick={zoomIn}
            className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 transition-colors"
            title="Zoom In"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </button>
          <button
            onClick={zoomOut}
            className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 transition-colors border-t border-gray-200"
            title="Zoom Out"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 12H6" />
            </svg>
          </button>
          <button
            onClick={resetView}
            className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 transition-colors border-t border-gray-200"
            title="Reset View"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          {currentLocation && currentLocation.lat && currentLocation.lng && (
            <button
              onClick={fitToLocation}
              className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 transition-colors border-t border-gray-200"
              title="Fit to Location"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const defaultCenter = [28.6139, 77.2090]; // Delhi coordinates

const tileLayers = {
  street: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors'
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri'
  },
  terrain: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '© OpenTopoMap'
  }
};

export default function CreateListing() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { currentUser } = useSelector((state) => state.user);
  const [files, setFiles] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    address: '',
    city: '',
    locality: '',
    state: '',
    pincode: '',
    type: 'sale',
    propertyType: '',
    customPropertyType: '',
    bedrooms: 1,
    bathrooms: 1,
    regularPrice: 0,
    discountPrice: 0,
    offer: false,
    parking: false,
    furnished: false,
    location: {
      lat: 28.6139,
      lng: 77.2090,
    },
    category: '',
    ownerIds: [],
  });

  const [imageUploadError, setImageUploadError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [categories, setCategories] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [owners, setOwners] = useState([]);
  const [loadingOwners, setLoadingOwners] = useState(false);
  const [ownerSearchQuery, setOwnerSearchQuery] = useState('');
  const [showCreateOwner, setShowCreateOwner] = useState(false);
  const [creatingOwner, setCreatingOwner] = useState(false);
  const [newOwner, setNewOwner] = useState({
    name: '',
    email: '',
    phone: '',
    companyName: '',
  });
  const [mapLayer, setMapLayer] = useState('street');
  const [showMapFullView, setShowMapFullView] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [geoStatus, setGeoStatus] = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [propertyTypes, setPropertyTypes] = useState([]);
  const [loadingPropertyTypes, setLoadingPropertyTypes] = useState(false);
  const [selectedPropertyType, setSelectedPropertyType] = useState(null);
  const [propertyTypeFields, setPropertyTypeFields] = useState({});
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [categoryFields, setCategoryFields] = useState({});

  // Auto-calculation for size and price
  useEffect(() => {
    const calculateTotalValue = () => {
      const sqYard = parseFloat(formData.sqYard) || 0;
      const sqYardRate = parseFloat(formData.sqYardRate) || 0;

      if (sqYard > 0 && sqYardRate > 0) {
        const total = sqYard * sqYardRate;
        setFormData(prev => ({
          ...prev,
          totalValue: total.toString(),
          regularPrice: Math.round(total)
        }));
      }
    };

    calculateTotalValue();
  }, [formData.sqYard, formData.sqYardRate]);

  useEffect(() => {
    const fetchInitialData = async () => {
      setLoadingCategories(true);
      setLoadingOwners(true);
      setLoadingPropertyTypes(true);

      const [catResult, ownerResult, ptResult] = await Promise.allSettled([
        apiClient.get('/category/list'),
        apiClient.get('/owner/list'),
        apiClient.get('/property-types/list'),
      ]);

      // Categories
      if (catResult.status === 'fulfilled') {
        const all = catResult.value.data || catResult.value || [];
        if (currentUser?.role === 'employee') {
          const allowed = Array.isArray(currentUser.assignedCategories)
            ? currentUser.assignedCategories
            : [];
          setCategories(all.filter((c) => allowed.includes(c.slug)));
        } else {
          setCategories(all);
        }
      } else {
        setCategories([]);
      }
      setLoadingCategories(false);

      // Owners
      if (ownerResult.status === 'fulfilled') {
        setOwners(ownerResult.value.data || ownerResult.value || []);
      } else {
        setOwners([]);
      }
      setLoadingOwners(false);

      // Property types
      if (ptResult.status === 'fulfilled') {
        setPropertyTypes(ptResult.value.data || []);
      } else {
        setPropertyTypes([]);
      }
      setLoadingPropertyTypes(false);
    };

    fetchInitialData();
  }, [currentUser?.role, currentUser?.assignedCategories]);

  const handleChange = (e) => {
    if (e.target.id === 'sale' || e.target.id === 'rent') {
      setFormData(prev => ({
        ...prev,
        type: e.target.id,
      }));
      return;
    }

    if (e.target.id === 'parking' || e.target.id === 'furnished' || e.target.id === 'offer') {
      setFormData(prev => ({
        ...prev,
        [e.target.id]: e.target.checked,
      }));
      return;
    }

    if (e.target.type === 'number' || e.target.type === 'text' || e.target.type === 'textarea') {
      setFormData(prev => ({
        ...prev,
        [e.target.id]: e.target.value,
      }));
      return;
    }

    if (e.target.type === 'select-one') {
      if (e.target.name === 'propertyType') {
        const selectedType = propertyTypes.find(pt => pt.slug === e.target.value);
        setSelectedPropertyType(selectedType);
        setPropertyTypeFields({});
        const ptCat = selectedType?.category || '';
        const isLandOrIndustrial = ptCat === 'land' || ptCat === 'industrial';
        const isCommercial = ptCat === 'commercial';
        setFormData(prev => ({
          ...prev,
          propertyType: e.target.value,
          propertyCategory: ptCat,
          bedrooms: isLandOrIndustrial || isCommercial ? 0 : prev.bedrooms || 1,
          bathrooms: isLandOrIndustrial ? 0 : prev.bathrooms || 1,
        }));
      } else if (e.target.name === 'category') {
        const category = categories.find(c => c.slug === e.target.value);
        setSelectedCategory(category);
        setCategoryFields({});
        setFormData(prev => ({
          ...prev,
          category: e.target.value,
        }));
      } else {
        setFormData(prev => ({
          ...prev,
          [e.target.name]: e.target.value,
        }));
      }
    }
  };

  const handlePropertyTypeFieldChange = (fieldKey, value) => {
    setPropertyTypeFields(prev => ({
      ...prev,
      [fieldKey]: value,
    }));
  };

  const handleCategoryFieldChange = (fieldKey, value) => {
    setCategoryFields(prev => ({
      ...prev,
      [fieldKey]: value,
    }));
  };

  const handleImageSubmit = async () => {
    if (files && files.length > 0) {
      setUploading(true);
      setImageUploadError(false);
      const promises = [];

      for (let i = 0; i < files.length; i++) {
        promises.push(storeImage(files[i]));
      }
      try {
        const urls = await Promise.all(promises);
        setFormData(prev => ({ ...prev, imageUrls: [...(prev.imageUrls || []), ...urls] }));
        setImageUploadError(false);
      } catch {
        setImageUploadError('Image upload failed (2 mb max per image)');
      } finally {
        setUploading(false);
      }
    } else {
      setImageUploadError('Please select at least one image');
    }
  };

  const storeImage = async (file) => {
    const formData = new FormData();
    formData.append('image', file);
    const response = await apiClient.upload('/upload/single', formData);
    return response.url;
  };

  const handleRemoveImage = (index) => {
    setFormData({
      ...formData,
      imageUrls: formData.imageUrls.filter((_, i) => i !== index),
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (+formData.regularPrice < +formData.discountPrice) {
        setError('Discount price must be lower than regular price');
        return;
      }
      setLoading(true);
      setError(false);

      // Merge propertyTypeFields into main data for fields that exist in both
      const mergedData = {
        ...formData,
        bedrooms: propertyTypeFields.bedrooms ?? formData.bedrooms,
        bathrooms: propertyTypeFields.bathrooms ?? formData.bathrooms,
        parking: propertyTypeFields.parking ?? formData.parking,
        furnished: propertyTypeFields.furnished ?? formData.furnished,
        propertyTypeFields: propertyTypeFields,
        attributes: categoryFields,
        userRef: currentUser._id,
      };

      const data = await apiClient.post('/listing/create', mergedData);
      setLoading(false);
      if (data.success === false) {
        setError(data.message);
        return;
      }
      // Trigger cache invalidation event
      window.dispatchEvent(new CustomEvent('listing-created', { detail: { id: data.data._id } }));
      navigate(`/listing/${data.data._id}`);
    } catch (error) {
      setError(error.message);
      setLoading(false);
    }
  };

  // ---- Geocoding helpers (use backend proxy) ----

  const handleLocationSelect = (lat, lng) => {
    setFormData(prev => ({ ...prev, location: { lat, lng } }));
    setError(false);
    reverseGeocode(lat, lng);
  };

  const geocodeAddress = async (address) => {
    if (!address || address.length < 3) return;
    try {
      setGeocoding(true);
      setGeoStatus('Finding location...');
      const res = await apiClient.get(`/geocode/search?q=${encodeURIComponent(address)}&limit=1`);
      const results = res?.data || [];
      if (results.length > 0) {
        const r = results[0];
        setFormData(prev => ({
          ...prev,
          location: { lat: r.lat, lng: r.lng },
          city: r.city || prev.city,
          locality: r.locality || prev.locality,
          state: r.state || prev.state,
          pincode: r.pincode || prev.pincode,
        }));
        setGeoStatus('Location found!');
      } else {
        setGeoStatus('Location not found');
      }
      setTimeout(() => setGeoStatus(''), 2500);
    } catch {
      setGeoStatus('Error finding location');
      setTimeout(() => setGeoStatus(''), 3000);
    } finally {
      setGeocoding(false);
    }
  };

  const reverseGeocode = async (lat, lng) => {
    try {
      const res = await apiClient.get(`/geocode/reverse?lat=${lat}&lng=${lng}`);
      const r = res?.data;
      if (r) {
        setFormData(prev => ({
          ...prev,
          address: r.address || prev.address,
          city: r.city || prev.city,
          locality: r.locality || prev.locality,
          state: r.state || prev.state,
          pincode: r.pincode || prev.pincode,
        }));
      }
    } catch {
      // silent – user can still type manually
    }
  };

  const searchAddress = async (query) => {
    if (!query || query.length < 3) {
      setAddressSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    try {
      const res = await apiClient.get(`/geocode/search?q=${encodeURIComponent(query)}&limit=5`);
      setAddressSuggestions(res?.data || []);
      setShowSuggestions(true);
    } catch {
      setAddressSuggestions([]);
    }
  };

  // Debounced address search (300ms for snappier feel)
  const debouncedSearch = useRef(null);
  const handleAddressChange = (e) => {
    const value = e.target.value;
    setFormData(prev => ({ ...prev, address: value }));
    if (debouncedSearch.current) clearTimeout(debouncedSearch.current);
    debouncedSearch.current = setTimeout(() => searchAddress(value), 300);
  };

  // Keyboard navigation for suggestions
  const [suggestionIdx, setSuggestionIdx] = useState(-1);
  const handleAddressKeyDown = (e) => {
    if (!showSuggestions || addressSuggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSuggestionIdx(prev => Math.min(prev + 1, addressSuggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSuggestionIdx(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && suggestionIdx >= 0) {
      e.preventDefault();
      selectSuggestion(addressSuggestions[suggestionIdx]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setSuggestionIdx(-1);
    }
  };

  const selectSuggestion = (s) => {
    setFormData(prev => ({
      ...prev,
      address: s.address || s.displayName,
      city: s.city || prev.city,
      locality: s.locality || prev.locality,
      state: s.state || prev.state,
      pincode: s.pincode || prev.pincode,
      location: { lat: s.lat, lng: s.lng },
    }));
    setShowSuggestions(false);
    setSuggestionIdx(-1);
    setAddressSuggestions([]);
    setGeoStatus('Location found!');
    setTimeout(() => setGeoStatus(''), 2000);
  };

  return (
    <main>
      <div className='max-w-6xl mx-auto'>
        {/* Clean Header */}
        <div className='text-center mb-8'>
          <h1 className='text-4xl font-bold text-gray-900 mb-3'>
            Create Property Listing
          </h1>
          <p className='text-lg text-gray-600 max-w-2xl mx-auto'>
            Fill in your property details to create an attractive listing that will attract potential buyers
          </p>
        </div>

        {/* Main Form Container */}
        <div className='bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden'>
          <form onSubmit={handleSubmit} className='p-8'>
            {/* Form Fields */}
            <div className='space-y-8'>
              {/* Basic Information */}
              <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                <div>
                  <label htmlFor='name' className='block text-sm font-medium text-gray-700 mb-2'>
                    Property Name *
                  </label>
                  <input
                    type='text'
                    placeholder='Enter property name'
                    className='w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors'
                    id='name'
                    maxLength='62'
                    minLength='2'
                    required
                    onChange={handleChange}
                    value={formData.name}
                  />
                </div>

                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-2'>
                    Property Type *
                  </label>
                  <select
                    name='propertyType'
                    value={formData.propertyType}
                    onChange={handleChange}
                    className='w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors'
                    required
                  >
                    <option value=''>Select Property Type</option>
                    {loadingPropertyTypes ? (
                      <option disabled>Loading...</option>
                    ) : (
                      propertyTypes.map((type) => (
                        <option key={type._id} value={type.slug}>
                          {type.icon} {type.name}
                        </option>
                      ))
                    )}
                  </select>
                  {selectedPropertyType && (
                    <p className='text-xs text-gray-500 mt-1'>{selectedPropertyType.description}</p>
                  )}
                </div>
              </div>

              {/* Description */}
              <div>
                <label htmlFor='description' className='block text-sm font-medium text-gray-700 mb-2'>
                  Description
                </label>
                <textarea
                  placeholder='Describe the property...'
                  className='w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none transition-colors'
                  id='description'
                  rows={4}
                  onChange={handleChange}
                  value={formData.description}
                />
              </div>

              {/* Property Details */}
              <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-2'>
                    Listing Type *
                  </label>
                  <select
                    name='type'
                    value={formData.type}
                    onChange={handleChange}
                    className='w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors'
                  >
                    <option value='sale'>Sell</option>
                    <option value='rent'>Rent</option>
                  </select>
                </div>
              </div>

              {/* Bedrooms & Bathrooms — shown based on property type */}
              {selectedPropertyType && (() => {
                const ptCat = selectedPropertyType.category;
                const showBedrooms = ptCat === 'residential';
                const showBathrooms = ptCat === 'residential' || ptCat === 'commercial';
                if (!showBedrooms && !showBathrooms) return null;
                return (
                  <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                    {showBedrooms && (
                      <div>
                        <label className='block text-sm font-medium text-gray-700 mb-2'>
                          Bedrooms *
                        </label>
                        <input
                          type='number'
                          name='bedrooms'
                          min='1'
                          max='20'
                          required
                          value={formData.bedrooms}
                          onChange={handleChange}
                          className='w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors'
                        />
                      </div>
                    )}
                    {showBathrooms && (
                      <div>
                        <label className='block text-sm font-medium text-gray-700 mb-2'>
                          Bathrooms {showBedrooms ? '*' : '(optional)'}
                        </label>
                        <input
                          type='number'
                          name='bathrooms'
                          min={showBedrooms ? '1' : '0'}
                          max='20'
                          required={showBedrooms}
                          value={formData.bathrooms}
                          onChange={handleChange}
                          className='w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors'
                        />
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Dynamic Property Type Fields */}
              {selectedPropertyType && selectedPropertyType.fields && selectedPropertyType.fields.length > 0 && (
                <PropertyTypeFields
                  fields={selectedPropertyType.fields}
                  values={propertyTypeFields}
                  onChange={handlePropertyTypeFieldChange}
                />
              )}

              {/* Pricing */}
              <div className='space-y-4'>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                  <div>
                    <label htmlFor='regularPrice' className='block text-sm font-medium text-gray-700 mb-2'>
                      Price (₹) *
                    </label>
                    <input
                      type='number'
                      id='regularPrice'
                      min='0'
                      required
                      className='w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors'
                      onChange={handleChange}
                      value={formData.regularPrice}
                    />
                  </div>

                  {formData.offer && (
                    <div>
                      <label htmlFor='discountPrice' className='block text-sm font-medium text-gray-700 mb-2'>
                        Discount Price (₹)
                      </label>
                      <input
                        type='number'
                        id='discountPrice'
                        min='0'
                        className='w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors'
                        onChange={handleChange}
                        value={formData.discountPrice}
                      />
                    </div>
                  )}
                </div>

                <label className='flex items-center gap-2 cursor-pointer w-fit'>
                  <input
                    type='checkbox'
                    id='offer'
                    checked={formData.offer}
                    onChange={handleChange}
                    className='w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500'
                  />
                  <span className='text-sm font-medium text-gray-700'>This listing has a discounted offer price</span>
                </label>
              </div>

              {/* Location */}
              <div className='space-y-4'>
                <div>
                  <label htmlFor='address' className='block text-sm font-medium text-gray-700 mb-2'>
                    Address *
                  </label>
                  <div className='relative'>
                    <textarea
                      placeholder='Start typing your address...'
                      className='w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none transition-colors'
                      id='address'
                      rows={2}
                      required
                      onChange={handleAddressChange}
                      onKeyDown={handleAddressKeyDown}
                      value={formData.address}
                      onFocus={() => { if (addressSuggestions.length) setShowSuggestions(true); }}
                      onBlur={() => setTimeout(() => { setShowSuggestions(false); setSuggestionIdx(-1); }, 180)}
                    />

                    {/* Address Suggestions Dropdown */}
                    {showSuggestions && addressSuggestions.length > 0 && (
                      <div className='absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto'>
                        {addressSuggestions.map((s, index) => (
                          <div
                            key={index}
                            className={`p-3 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors ${index === suggestionIdx ? 'bg-blue-50' : 'hover:bg-gray-50'
                              }`}
                            onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s); }}
                            onMouseEnter={() => setSuggestionIdx(index)}
                          >
                            <div className='text-sm font-medium text-gray-900'>
                              {s.address || s.displayName}
                            </div>
                            <div className='text-xs text-gray-500 mt-1'>
                              {[s.locality, s.city, s.state, s.pincode].filter(Boolean).join(', ')}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Geocoding Status */}
                    {geoStatus && (
                      <div className='mt-2 flex items-center gap-2 text-sm'>
                        {geocoding ? (
                          <>
                            <svg className='animate-spin w-4 h-4 text-blue-600' fill='none' viewBox='0 0 24 24'>
                              <circle className='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' strokeWidth='4'></circle>
                              <path className='opacity-75' fill='currentColor' d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'></path>
                            </svg>
                            <span className='text-blue-600'>{geoStatus}</span>
                          </>
                        ) : (
                          <span className='text-green-600'>{geoStatus}</span>
                        )}
                      </div>
                    )}

                    {/* Find on Map Button */}
                    <div className='mt-3 flex gap-3'>
                      <button
                        type='button'
                        onClick={() => {
                          const { address, city, state, pincode } = formData;
                          // Build address from available fields
                          const parts = [address, city, state, pincode].filter(Boolean);
                          if (parts.length > 0) {
                            const fullAddress = parts.join(', ') + ', India';
                            geocodeAddress(fullAddress);
                          } else {
                            setGeoStatus('Please enter an address first');
                            setTimeout(() => setGeoStatus(''), 3000);
                          }
                        }}
                        disabled={geocoding || !formData.address}
                        className='px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2'
                      >
                        <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                          <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z' />
                          <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M15 11a3 3 0 11-6 0 3 3 0 016 0z' />
                        </svg>
                        {geocoding ? 'Finding...' : 'Find on Map'}
                      </button>

                      <button
                        type='button'
                        onClick={() => {
                          navigator.geolocation.getCurrentPosition(
                            (position) => {
                              const { latitude, longitude } = position.coords;
                              setFormData(prev => ({
                                ...prev,
                                location: { lat: latitude, lng: longitude }
                              }));
                              reverseGeocode(latitude, longitude);
                              setGeoStatus('Current location found!');
                              setTimeout(() => setGeoStatus(''), 2000);
                            },
                            (error) => {
                              setGeoStatus('Unable to get current location');
                              setTimeout(() => setGeoStatus(''), 3000);
                            }
                          );
                        }}
                        className='px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2'
                      >
                        <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                          <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z' />
                          <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M15 11a3 3 0 11-6 0 3 3 0 016 0z' />
                        </svg>
                        Use My Location
                      </button>
                    </div>
                  </div>
                </div>

                {/* Coordinates Display */}
                {formData.location.lat && formData.location.lng && (
                  <div className='bg-blue-50 border border-blue-200 rounded-lg p-4'>
                    <div className='flex items-center justify-between'>
                      <div className='flex items-center gap-2'>
                        <svg className='w-5 h-5 text-blue-600' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                          <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z' />
                          <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M15 11a3 3 0 11-6 0 3 3 0 016 0z' />
                        </svg>
                        <span className='text-sm font-medium text-blue-800'>Property Coordinates</span>
                      </div>
                      <button
                        type='button'
                        onClick={() => {
                          const coords = `${formData.location.lat}, ${formData.location.lng}`;
                          navigator.clipboard.writeText(coords).then(() => {
                            setGeoStatus('Coordinates copied to clipboard!');
                            setTimeout(() => setGeoStatus(''), 2000);
                          });
                        }}
                        className='px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center gap-1'
                      >
                        <svg className='w-3 h-3' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                          <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z' />
                        </svg>
                        Copy
                      </button>
                    </div>
                    <div className='mt-2 grid grid-cols-1 md:grid-cols-2 gap-3'>
                      <div className='bg-white rounded p-3 border border-blue-100'>
                        <div className='text-xs text-blue-600 font-medium mb-1'>Latitude</div>
                        <div className='text-sm font-mono text-gray-900'>{formData.location.lat.toFixed(6)}</div>
                      </div>
                      <div className='bg-white rounded p-3 border border-blue-100'>
                        <div className='text-xs text-blue-600 font-medium mb-1'>Longitude</div>
                        <div className='text-sm font-mono text-gray-900'>{formData.location.lng.toFixed(6)}</div>
                      </div>
                    </div>
                    <div className='mt-2 text-xs text-blue-600'>
                      Click "Copy" to copy coordinates to clipboard
                    </div>
                  </div>
                )}

                <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
                  <div>
                    <label htmlFor='city' className='block text-sm font-medium text-gray-700 mb-2'>
                      City *
                    </label>
                    <input
                      type='text'
                      placeholder='City'
                      className='w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors'
                      id='city'
                      required
                      onChange={handleChange}
                      value={formData.city}
                    />
                  </div>
                  <div>
                    <label htmlFor='locality' className='block text-sm font-medium text-gray-700 mb-2'>
                      Locality
                    </label>
                    <input
                      type='text'
                      placeholder='Neighbourhood / Suburb'
                      className='w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors'
                      id='locality'
                      onChange={handleChange}
                      value={formData.locality || ''}
                    />
                  </div>
                  <div>
                    <label htmlFor='state' className='block text-sm font-medium text-gray-700 mb-2'>
                      State *
                    </label>
                    <input
                      type='text'
                      placeholder='State'
                      className='w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors'
                      id='state'
                      required
                      onChange={handleChange}
                      value={formData.state}
                    />
                  </div>
                  <div>
                    <label htmlFor='pincode' className='block text-sm font-medium text-gray-700 mb-2'>
                      Pincode *
                    </label>
                    <input
                      type='text'
                      placeholder='Pincode'
                      className='w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors'
                      id='pincode'
                      required
                      onChange={handleChange}
                      value={formData.pincode}
                    />
                  </div>
                </div>
              </div>

              {/* Map Section */}
              <div>
                <label className='block text-sm font-medium text-gray-700 mb-2'>
                  Property Location on Map
                </label>
                <div className='border border-gray-200 rounded-lg overflow-hidden shadow-sm'>
                  <div className='bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 border-b border-gray-200'>
                    <div className='flex items-center justify-between'>
                      <div className='flex items-center gap-3'>
                        <div className='w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center'>
                          <svg className='w-4 h-4 text-white' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z' />
                            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M15 11a3 3 0 11-6 0 3 3 0 016 0z' />
                          </svg>
                        </div>
                        <div>
                          <h3 className='text-sm font-semibold text-gray-800'>Property Location</h3>
                          <p className='text-xs text-gray-600'>Click on the map to set the exact location</p>
                        </div>
                      </div>
                      <div className='flex items-center gap-2'>
                        {formData.location.lat && formData.location.lng && (
                          <>
                            <div className='flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium'>
                              <svg className='w-3 h-3' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M5 13l4 4L19 7' />
                              </svg>
                              Location Set
                            </div>
                            <div className='text-xs text-gray-600 font-mono'>
                              {formData.location.lat.toFixed(4)}, {formData.location.lng.toFixed(4)}
                            </div>
                          </>
                        )}
                        <button
                          type='button'
                          onClick={() => setShowMapFullView(true)}
                          className='px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors'
                        >
                          Full Screen
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Map Container */}
                  <div className='p-4'>
                    <div className='h-80 w-full rounded-lg overflow-hidden border border-gray-200 relative'>
                      <MapContainer
                        center={defaultCenter}
                        zoom={12}
                        style={{ height: '100%', width: '100%' }}
                        className='z-0'
                        zoomControl={false}
                        scrollWheelZoom={true}
                        doubleClickZoom={true}
                        touchZoom={true}
                        dragging={true}
                        zoomSnap={0.5}
                        zoomDelta={0.5}
                      >
                        <TileLayer
                          attribution={tileLayers[mapLayer].attribution}
                          url={tileLayers[mapLayer].url}
                        />
                        <ZoomControl position="bottomright" />
                        <FlyToLocation lat={formData.location.lat} lng={formData.location.lng} zoom={15} />
                        <LocationPicker onLocationSelect={handleLocationSelect} />
                        <MapControls
                          mapLayer={mapLayer}
                          onLayerChange={setMapLayer}
                          currentLocation={formData.location}
                        />
                        {formData.location.lat && formData.location.lng && (
                          <Marker
                            position={[formData.location.lat, formData.location.lng]}
                            icon={customIcon}
                          >
                            <Popup>
                              <div className='text-center p-3 min-w-[200px]'>
                                <div className='font-semibold text-gray-900 mb-2'>📍 Property Location</div>
                                <div className='text-sm text-gray-600 mb-2'>{formData.address || 'Address not specified'}</div>
                                <div className='text-xs text-gray-500 mb-3 bg-gray-100 p-2 rounded'>
                                  <div className='font-medium text-gray-700 mb-1'>Coordinates:</div>
                                  <div className='font-mono'>
                                    <div>Lat: {formData.location.lat.toFixed(6)}</div>
                                    <div>Lng: {formData.location.lng.toFixed(6)}</div>
                                  </div>
                                </div>
                                <div className='flex gap-2'>
                                  <button
                                    onClick={() => {
                                      const coords = `${formData.location.lat}, ${formData.location.lng}`;
                                      navigator.clipboard.writeText(coords);
                                    }}
                                    className='px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors'
                                  >
                                    Copy Coords
                                  </button>
                                  <button
                                    onClick={() => {
                                      const url = `https://www.google.com/maps?q=${formData.location.lat},${formData.location.lng}`;
                                      window.open(url, '_blank');
                                    }}
                                    className='px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors'
                                  >
                                    Open in Maps
                                  </button>
                                </div>
                                <div className='text-xs text-blue-600 mt-2 font-medium'>
                                  Click anywhere to change location
                                </div>
                              </div>
                            </Popup>
                          </Marker>
                        )}
                      </MapContainer>

                      {/* Map Instructions Overlay */}
                      {(!formData.location.lat || !formData.location.lng) && (
                        <div className='absolute inset-0 bg-black bg-opacity-20 flex items-center justify-center pointer-events-none'>
                          <div className='bg-white rounded-lg p-4 shadow-lg text-center max-w-xs'>
                            <svg className='w-8 h-8 text-blue-500 mx-auto mb-2' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z' />
                              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M15 11a3 3 0 11-6 0 3 3 0 016 0z' />
                            </svg>
                            <p className='text-sm font-medium text-gray-900 mb-1'>Click on the map</p>
                            <p className='text-xs text-gray-600'>to set your property location</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Map Layer Switcher */}
                    <div className='mt-3 flex justify-center'>
                      <div className='bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden'>
                        <div className='flex'>
                          {Object.keys(tileLayers).map((layer) => (
                            <button
                              key={layer}
                              type='button'
                              onClick={() => setMapLayer(layer)}
                              className={`px-3 py-2 text-xs font-medium transition-colors ${mapLayer === layer
                                  ? 'bg-blue-500 text-white'
                                  : 'bg-white text-gray-700 hover:bg-gray-50'
                                }`}
                              title={`Switch to ${layer} view`}
                            >
                              {layer === 'street' && '🗺️ Street'}
                              {layer === 'satellite' && '🛰️ Satellite'}
                              {layer === 'terrain' && '🏔️ Terrain'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Category and Features */}
              <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                <div>
                  <label htmlFor='category' className='block text-sm font-medium text-gray-700 mb-2'>
                    Category *
                  </label>
                  <select
                    id='category'
                    name='category'
                    value={formData.category}
                    onChange={handleChange}
                    className='w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors'
                    required
                  >
                    <option value=''>Select category</option>
                    {loadingCategories ? (
                      <option disabled>Loading...</option>
                    ) : (
                      categories.map((category) => (
                        <option key={category._id} value={category.slug}>
                          {category.name}
                        </option>
                      ))
                    )}
                  </select>
                  {selectedCategory && (
                    <p className='text-xs text-gray-500 mt-1'>
                      {selectedCategory.fields?.length || 0} additional fields for this category
                    </p>
                  )}
                </div>

                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-2'>
                    Features
                  </label>
                  <div className='flex flex-wrap gap-3'>
                    <label className='flex items-center'>
                      <input
                        type='checkbox'
                        id='parking'
                        checked={formData.parking}
                        onChange={handleChange}
                        className='w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500'
                      />
                      <span className='ml-2 text-sm text-gray-700'>Parking</span>
                    </label>
                    <label className='flex items-center'>
                      <input
                        type='checkbox'
                        id='furnished'
                        checked={formData.furnished}
                        onChange={handleChange}
                        className='w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500'
                      />
                      <span className='ml-2 text-sm text-gray-700'>Furnished</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Dynamic Category Fields */}
              {selectedCategory && selectedCategory.fields && selectedCategory.fields.length > 0 && (
                <div className='border-t border-gray-200 pt-8'>
                  <div className='flex items-center gap-3 mb-6'>
                    <div className='w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center'>
                      <svg className='w-5 h-5 text-indigo-600' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                        <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' />
                      </svg>
                    </div>
                    <div>
                      <h2 className='text-xl font-semibold text-gray-900'>
                        {selectedCategory.name} Details
                      </h2>
                      <p className='text-sm text-gray-500'>
                        Fill in the specific details for your {selectedCategory.name.toLowerCase()} listing
                      </p>
                    </div>
                  </div>
                  <DynamicCategoryFields
                    fields={selectedCategory.fields}
                    values={categoryFields}
                    onChange={handleCategoryFieldChange}
                  />
                </div>
              )}

              {/* Image Upload */}
              <div>
                <label className='block text-sm font-medium text-gray-700 mb-2'>
                  Images
                </label>
                <div className='border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors'>
                  <input
                    type='file'
                    id='images'
                    accept='image/*'
                    multiple
                    className='hidden'
                    onChange={(e) => setFiles(e.target.files)}
                  />
                  <label htmlFor='images' className='cursor-pointer'>
                    <svg className='mx-auto h-12 w-12 text-gray-400' stroke='currentColor' fill='none' viewBox='0 0 48 48'>
                      <path d='M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02' strokeWidth={2} strokeLinecap='round' strokeLinejoin='round' />
                    </svg>
                    <div className='mt-2'>
                      <p className='text-sm text-gray-600'>
                        <span className='font-medium text-blue-600 hover:text-blue-500'>Click to upload</span> or drag and drop
                      </p>
                      <p className='text-xs text-gray-500'>PNG, JPG, GIF up to 10MB each</p>
                    </div>
                  </label>
                </div>

                {files && files.length > 0 && (
                  <div className='mt-4'>
                    <div className='flex items-center justify-between mb-2'>
                      <p className='text-sm font-medium text-gray-700'>
                        {files.length} file{files.length !== 1 ? 's' : ''} selected
                      </p>
                      <button
                        type='button'
                        onClick={handleImageSubmit}
                        disabled={uploading}
                        className='px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors'
                      >
                        {uploading ? 'Uploading...' : 'Upload Images'}
                      </button>
                    </div>

                    <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
                      {Array.from(files).map((file, index) => (
                        <div key={index} className='relative'>
                          <img
                            src={URL.createObjectURL(file)}
                            alt={`Preview ${index + 1}`}
                            className='w-full h-24 object-cover rounded-lg border border-gray-200'
                          />
                          <button
                            type='button'
                            onClick={() => {
                              const newFiles = Array.from(files).filter((_, i) => i !== index);
                              setFiles(newFiles);
                            }}
                            className='absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600 transition-colors'
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {formData.imageUrls && formData.imageUrls.length > 0 && (
                  <div className='mt-4'>
                    <p className='text-sm font-medium text-gray-700 mb-2'>Uploaded Images:</p>
                    <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
                      {formData.imageUrls.map((url, index) => (
                        <div key={index} className='relative'>
                          <img
                            src={normalizeImageUrl(url)}
                            alt={`Uploaded ${index + 1}`}
                            className='w-full h-24 object-cover rounded-lg border border-gray-200'
                          />
                          <button
                            type='button'
                            onClick={() => handleRemoveImage(index)}
                            className='absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600 transition-colors'
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {imageUploadError && (
                  <p className='text-sm text-red-600 mt-2'>{imageUploadError}</p>
                )}
              </div>

              {/* Property Owner Selection */}
              <div>
                <label className='block text-sm font-medium text-gray-700 mb-2'>
                  Property Owner(s)
                </label>
                <div className='space-y-4'>
                  <div className='flex items-center justify-between'>
                    <div>
                      <p className='text-sm text-gray-600'>Select property owners for this listing</p>
                      {!loadingOwners && (
                        <p className='text-xs text-gray-500 mt-1'>
                          {owners.length} owner{owners.length !== 1 ? 's' : ''} available in database
                        </p>
                      )}
                    </div>
                    <button
                      type='button'
                      onClick={() => setShowCreateOwner(!showCreateOwner)}
                      className='px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors'
                    >
                      {showCreateOwner ? 'Cancel' : 'Add New Owner'}
                    </button>
                  </div>

                  {/* Owner Search */}
                  <div className='relative'>
                    <input
                      type='text'
                      placeholder='Search owners by name, email, or company...'
                      value={ownerSearchQuery}
                      onChange={(e) => setOwnerSearchQuery(e.target.value)}
                      className='w-full border border-gray-300 rounded-lg px-4 py-3 pl-10 text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors'
                    />
                    <svg className='absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                      <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' />
                    </svg>
                    {ownerSearchQuery && (
                      <button
                        type='button'
                        onClick={() => setOwnerSearchQuery('')}
                        className='absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 hover:text-gray-600'
                      >
                        <svg fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                          <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M6 18L18 6M6 6l12 12' />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Owner Selection */}
                  <div className='border border-gray-200 rounded-lg overflow-hidden'>
                    <div className='bg-gray-50 px-4 py-2 border-b border-gray-200'>
                      <div className='flex items-center justify-between'>
                        <span className='text-sm font-medium text-gray-700'>Available Owners</span>
                        {formData.ownerIds.length > 0 && (
                          <span className='text-xs text-indigo-600 font-medium'>
                            {formData.ownerIds.length} selected
                          </span>
                        )}
                      </div>
                    </div>

                    <div className='max-h-60 overflow-y-auto'>
                      {loadingOwners ? (
                        <div className='p-6 text-center'>
                          <div className='inline-flex items-center gap-2 text-gray-500'>
                            <svg className='animate-spin w-4 h-4' fill='none' viewBox='0 0 24 24'>
                              <circle className='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' strokeWidth='4'></circle>
                              <path className='opacity-75' fill='currentColor' d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'></path>
                            </svg>
                            Loading owners...
                          </div>
                        </div>
                      ) : owners.length === 0 ? (
                        <div className='p-6 text-center text-gray-500'>
                          <svg className='mx-auto h-12 w-12 text-gray-300 mb-2' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z' />
                          </svg>
                          <div className='text-sm'>No owners found in database</div>
                          <div className='text-xs mt-1'>Create a new owner to get started</div>
                        </div>
                      ) : (
                        <>
                          {owners
                            .filter((owner) => {
                              const query = ownerSearchQuery.toLowerCase();
                              return (
                                owner.name.toLowerCase().includes(query) ||
                                (owner.companyName && owner.companyName.toLowerCase().includes(query)) ||
                                (owner.email && owner.email.toLowerCase().includes(query))
                              );
                            })
                            .map((owner) => (
                              <label key={owner._id} className={`flex items-center gap-4 p-4 cursor-pointer transition-colors border-b border-gray-100 last:border-b-0 ${formData.ownerIds.includes(owner._id)
                                  ? 'bg-indigo-50 border-l-4 border-indigo-500'
                                  : 'hover:bg-gray-50'
                                }`}>
                                <input
                                  type='checkbox'
                                  checked={formData.ownerIds.includes(owner._id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setFormData(prev => ({
                                        ...prev,
                                        ownerIds: [...prev.ownerIds, owner._id]
                                      }));
                                    } else {
                                      setFormData(prev => ({
                                        ...prev,
                                        ownerIds: prev.ownerIds.filter(id => id !== owner._id)
                                      }));
                                    }
                                  }}
                                  className='w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500'
                                />
                                <div className='flex-1 min-w-0'>
                                  <div className='font-medium text-gray-900 truncate'>{owner.name}</div>
                                  {owner.companyName && (
                                    <div className='text-sm text-gray-600 truncate'>{owner.companyName}</div>
                                  )}
                                  {owner.email && (
                                    <div className='text-sm text-gray-500 truncate'>{owner.email}</div>
                                  )}
                                  {owner.phone && (
                                    <div className='text-xs text-gray-400 truncate'>{owner.phone}</div>
                                  )}
                                </div>
                                {formData.ownerIds.includes(owner._id) && (
                                  <div className='flex-shrink-0'>
                                    <svg className='w-5 h-5 text-indigo-600' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                                      <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M5 13l4 4L19 7' />
                                    </svg>
                                  </div>
                                )}
                              </label>
                            ))}

                          {owners.filter((owner) => {
                            const query = ownerSearchQuery.toLowerCase();
                            return (
                              owner.name.toLowerCase().includes(query) ||
                              (owner.companyName && owner.companyName.toLowerCase().includes(query)) ||
                              (owner.email && owner.email.toLowerCase().includes(query))
                            );
                          }).length === 0 && ownerSearchQuery && (
                              <div className='p-6 text-center text-gray-500'>
                                <svg className='mx-auto h-8 w-8 text-gray-300 mb-2' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                                  <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' />
                                </svg>
                                <div className='text-sm'>No owners found matching "{ownerSearchQuery}"</div>
                                <div className='text-xs mt-1'>Try a different search term or create a new owner</div>
                              </div>
                            )}
                        </>
                      )}
                    </div>
                  </div>

                  {formData.ownerIds.length > 0 && (
                    <div className='bg-indigo-50 border border-indigo-200 rounded-lg p-3'>
                      <div className='flex items-center gap-2'>
                        <svg className='w-4 h-4 text-indigo-600' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                          <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M5 13l4 4L19 7' />
                        </svg>
                        <span className='text-sm font-medium text-indigo-800'>
                          {formData.ownerIds.length} owner{formData.ownerIds.length !== 1 ? 's' : ''} selected
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Create New Owner Form */}
              {showCreateOwner && (
                <div className='bg-gray-50 rounded-lg p-6 border border-gray-200'>
                  <h3 className='text-lg font-semibold text-gray-900 mb-4'>Create New Owner</h3>
                  <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                    <div>
                      <label className='block text-sm font-medium text-gray-700 mb-2'>
                        Owner Name *
                      </label>
                      <input
                        type='text'
                        placeholder='Enter owner name'
                        value={newOwner.name}
                        onChange={(e) => setNewOwner({ ...newOwner, name: e.target.value })}
                        className='w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors'
                        required
                      />
                    </div>
                    <div>
                      <label className='block text-sm font-medium text-gray-700 mb-2'>
                        Email
                      </label>
                      <input
                        type='email'
                        placeholder='Enter email address'
                        value={newOwner.email}
                        onChange={(e) => setNewOwner({ ...newOwner, email: e.target.value })}
                        className='w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors'
                      />
                    </div>
                    <div>
                      <label className='block text-sm font-medium text-gray-700 mb-2'>
                        Phone
                      </label>
                      <input
                        type='tel'
                        placeholder='Enter phone number'
                        value={newOwner.phone}
                        onChange={(e) => setNewOwner({ ...newOwner, phone: e.target.value })}
                        className='w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors'
                      />
                    </div>
                    <div>
                      <label className='block text-sm font-medium text-gray-700 mb-2'>
                        Company Name
                      </label>
                      <input
                        type='text'
                        placeholder='Enter company name'
                        value={newOwner.companyName}
                        onChange={(e) => setNewOwner({ ...newOwner, companyName: e.target.value })}
                        className='w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors'
                      />
                    </div>
                  </div>
                  <div className='flex gap-3 mt-4'>
                    <button
                      type='button'
                      onClick={async () => {
                        try {
                          setCreatingOwner(true);
                          const data = await apiClient.post('/owner/', newOwner);
                          setOwners(prev => [...prev, data.data || data]);
                          setFormData(prev => ({
                            ...prev,
                            ownerIds: [...prev.ownerIds, (data.data || data)._id]
                          }));
                          setNewOwner({ name: '', email: '', phone: '', companyName: '' });
                          setShowCreateOwner(false);
                        } catch (error) {
                          console.error('Error creating owner:', error);
                        } finally {
                          setCreatingOwner(false);
                        }
                      }}
                      disabled={creatingOwner || !newOwner.name}
                      className='px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors'
                    >
                      {creatingOwner ? 'Creating...' : 'Create Owner'}
                    </button>
                    <button
                      type='button'
                      onClick={() => {
                        setShowCreateOwner(false);
                        setNewOwner({ name: '', email: '', phone: '', companyName: '' });
                      }}
                      className='px-6 py-3 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors'
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <div className='pt-8 border-t border-gray-200'>
                <div className='flex flex-col sm:flex-row items-center justify-between gap-4'>
                  <div className='text-center sm:text-left'>
                    <h3 className='text-lg font-semibold text-gray-900 mb-1'>Ready to Create Your Listing?</h3>
                    <p className='text-sm text-gray-600'>Review your information and submit to publish your property listing.</p>
                  </div>

                  <button
                    disabled={loading || uploading}
                    className='px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-semibold hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 flex items-center gap-3 min-w-[200px] justify-center'
                  >
                    {loading ? (
                      <>
                        <svg className='animate-spin w-5 h-5' fill='none' viewBox='0 0 24 24'>
                          <circle className='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' strokeWidth='4'></circle>
                          <path className='opacity-75' fill='currentColor' d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'></path>
                        </svg>
                        Creating...
                      </>
                    ) : (
                      <>
                        <svg className='w-5 h-5' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                          <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 6v6m0 0v6m0-6h6m-6 0H6' />
                        </svg>
                        Create Listing
                      </>
                    )}
                  </button>
                </div>

                {error && (
                  <p className='text-sm text-red-600 mt-4 text-center'>{error}</p>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Full Screen Map Modal */}
      {showMapFullView && (
        <div className='fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4'>
          <div className='bg-white rounded-2xl shadow-2xl w-full h-full max-w-7xl max-h-[90vh] overflow-hidden'>
            <div className='flex items-center justify-between p-4 border-b border-gray-200'>
              <div className='flex items-center gap-3'>
                <div className='w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center'>
                  <svg className='w-4 h-4 text-white' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                    <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z' />
                    <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M15 11a3 3 0 11-6 0 3 3 0 016 0z' />
                  </svg>
                </div>
                <div>
                  <h3 className='text-lg font-semibold text-gray-900'>Property Location</h3>
                  <p className='text-sm text-gray-600'>Click anywhere on the map to set the exact location</p>
                  {formData.location.lat && formData.location.lng && (
                    <div className='mt-1 text-xs text-gray-500 font-mono'>
                      Lat: {formData.location.lat.toFixed(6)}, Lng: {formData.location.lng.toFixed(6)}
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={() => setShowMapFullView(false)}
                className='p-2 hover:bg-gray-100 rounded-lg transition-colors'
              >
                <svg className='w-6 h-6 text-gray-500' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                  <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M6 18L18 6M6 6l12 12' />
                </svg>
              </button>
            </div>

            {/* Full Map */}
            <div className='h-full relative'>
              <MapContainer
                center={formData.location.lat && formData.location.lng ? [formData.location.lat, formData.location.lng] : defaultCenter}
                zoom={15}
                style={{ height: '100%', width: '100%' }}
                className='z-0'
                zoomControl={false}
                scrollWheelZoom={true}
                doubleClickZoom={true}
                touchZoom={true}
                dragging={true}
                zoomSnap={0.5}
                zoomDelta={0.5}
              >
                <TileLayer
                  attribution={tileLayers[mapLayer].attribution}
                  url={tileLayers[mapLayer].url}
                />
                <ZoomControl position="bottomright" />
                <FlyToLocation lat={formData.location.lat} lng={formData.location.lng} zoom={15} />
                <LocationPicker onLocationSelect={handleLocationSelect} />
                <MapControls
                  mapLayer={mapLayer}
                  onLayerChange={setMapLayer}
                  currentLocation={formData.location}
                />
                {formData.location.lat && formData.location.lng && (
                  <Marker
                    position={[formData.location.lat, formData.location.lng]}
                    icon={customIcon}
                  >
                    <Popup>
                      <div className='text-center p-3 min-w-[200px]'>
                        <div className='font-semibold text-gray-900 mb-2'>📍 Property Location</div>
                        <div className='text-sm text-gray-600 mb-2'>{formData.address || 'Address not specified'}</div>
                        <div className='text-xs text-gray-500 mb-3 bg-gray-100 p-2 rounded'>
                          <div className='font-medium text-gray-700 mb-1'>Coordinates:</div>
                          <div className='font-mono'>
                            <div>Lat: {formData.location.lat.toFixed(6)}</div>
                            <div>Lng: {formData.location.lng.toFixed(6)}</div>
                          </div>
                        </div>
                        <div className='flex gap-2'>
                          <button
                            onClick={() => {
                              const coords = `${formData.location.lat}, ${formData.location.lng}`;
                              navigator.clipboard.writeText(coords);
                            }}
                            className='px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors'
                          >
                            Copy Coords
                          </button>
                          <button
                            onClick={() => {
                              const url = `https://www.google.com/maps?q=${formData.location.lat},${formData.location.lng}`;
                              window.open(url, '_blank');
                            }}
                            className='px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors'
                          >
                            Open in Maps
                          </button>
                        </div>
                        <div className='text-xs text-blue-600 mt-2 font-medium'>
                          Click anywhere to change location
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                )}
              </MapContainer>

              {/* Layer Switcher in Full View */}
              <div className='absolute top-4 right-4'>
                <div className='bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden'>
                  <div className='flex'>
                    {Object.keys(tileLayers).map((layer) => (
                      <button
                        key={layer}
                        type='button'
                        onClick={() => setMapLayer(layer)}
                        className={`px-4 py-2 text-sm font-medium transition-colors ${mapLayer === layer
                            ? 'bg-blue-500 text-white'
                            : 'bg-white text-gray-700 hover:bg-gray-50'
                          }`}
                        title={`Switch to ${layer} view`}
                      >
                        {layer === 'street' && '🗺️ Street'}
                        {layer === 'satellite' && '🛰️ Satellite'}
                        {layer === 'terrain' && '🏔️ Terrain'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Done Button */}
              <div className='absolute bottom-4 left-1/2 transform -translate-x-1/2'>
                <button
                  onClick={() => {
                    setShowMapFullView(false);
                  }}
                  className='px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-200 shadow-lg flex items-center gap-2'
                >
                  <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                    <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M5 13l4 4L19 7' />
                  </svg>
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
import { useEffect, useState, useRef } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, ZoomControl, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { apiClient, normalizeImageUrl } from '../utils/http';
import { useBuyerView } from '../contexts/BuyerViewContext';
import DynamicCategoryFields from '../components/DynamicCategoryFields';
import PropertyTypeFields from '../components/PropertyTypeFields';
import PropertyDocuments from '../components/PropertyDocuments';
import VoiceNotePanel from '../components/VoiceNotePanel';

// Fix for default markers in react-leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

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

const defaultCenter = [28.6139, 77.2090];

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

function LocationPicker({ onLocationSelect }) {
  useMapEvents({
    click: (e) => {
      onLocationSelect(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function FlyToLocation({ lat, lng, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (lat && lng) {
      map.flyTo([lat, lng], zoom || map.getZoom(), { duration: 1 });
    }
  }, [lat, lng, zoom, map]);
  return null;
}

export default function UpdateListing() {
  const { currentUser } = useSelector((state) => state.user);
  const { isBuyerViewMode } = useBuyerView();
  const navigate = useNavigate();
  const params = useParams();

  const [files, setFiles] = useState([]);
  const [formData, setFormData] = useState({
    imageUrls: [],
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
    category: '',
    attributes: {},
    ownerIds: [],
    location: { lat: null, lng: null },
  });

  const [imageUploadError, setImageUploadError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchingListing, setFetchingListing] = useState(true);

  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [propertyTypes, setPropertyTypes] = useState([]);
  const [selectedPropertyType, setSelectedPropertyType] = useState(null);
  const [propertyTypeFields, setPropertyTypeFields] = useState({});

  const [owners, setOwners] = useState([]);
  const [ownerSearchQuery, setOwnerSearchQuery] = useState('');
  const [showCreateOwner, setShowCreateOwner] = useState(false);
  const [creatingOwner, setCreatingOwner] = useState(false);
  const [newOwner, setNewOwner] = useState({ name: '', email: '', phone: '', companyName: '' });

  const [geocoding, setGeocoding] = useState(false);
  const [geoStatus, setGeoStatus] = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionIdx, setSuggestionIdx] = useState(-1);
  const [mapLayer, setMapLayer] = useState('street');

  useEffect(() => {
    if (!currentUser) navigate('/sign-in');
    if (currentUser && (currentUser.role === 'buyer' || isBuyerViewMode)) navigate('/unauthorized');
  }, [currentUser, navigate, isBuyerViewMode]);

  // Fetch existing listing
  useEffect(() => {
    const fetchListing = async () => {
      try {
        setFetchingListing(true);
        const data = await apiClient.get(`/listing/get/${params.listingId}`);
        if (data.success === false) return;
        setFormData(prev => ({ ...prev, ...data }));
        if (data.propertyTypeFields) setPropertyTypeFields(data.propertyTypeFields);
      } finally {
        setFetchingListing(false);
      }
    };
    fetchListing();
  }, [params.listingId]);

  // Fetch categories, owners, property types in parallel
  useEffect(() => {
    const fetchInitialData = async () => {
      const [catResult, ownerResult, ptResult] = await Promise.allSettled([
        apiClient.get('/category/list'),
        apiClient.get('/owner/list'),
        apiClient.get('/property-types/list'),
      ]);

      if (catResult.status === 'fulfilled') {
        const all = catResult.value.data || catResult.value || [];
        if (currentUser?.role === 'employee') {
          const allowed = Array.isArray(currentUser.assignedCategories)
            ? currentUser.assignedCategories : [];
          setCategories(all.filter((c) => allowed.includes(c.slug)));
        } else {
          setCategories(all);
        }
      }

      if (ownerResult.status === 'fulfilled') {
        setOwners(ownerResult.value.data || ownerResult.value || []);
      }

      if (ptResult.status === 'fulfilled') {
        setPropertyTypes(ptResult.value.data || []);
      }
    };
    fetchInitialData();
  }, [currentUser?.role, currentUser?.assignedCategories]);

  // Resolve selected category when formData.category or categories list changes
  useEffect(() => {
    if (formData.category && categories.length > 0) {
      const cat = categories.find(c => c.slug === formData.category);
      if (cat) {
        setSelectedCategory(cat);
      } else {
        // Category not in list — fetch it directly
        apiClient.get(`/category/by-slug/${formData.category}`)
          .then(data => { if (data) setSelectedCategory(data); })
          .catch(() => setSelectedCategory(null));
      }
    } else {
      setSelectedCategory(null);
    }
  }, [formData.category, categories]);

  // Resolve selected property type
  useEffect(() => {
    if (formData.propertyType && propertyTypes.length > 0) {
      const pt = propertyTypes.find(p => p.slug === formData.propertyType);
      setSelectedPropertyType(pt || null);
    }
  }, [formData.propertyType, propertyTypes]);

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
      // silent
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

  const debouncedSearch = useRef(null);
  const handleAddressChange = (e) => {
    const value = e.target.value;
    setFormData(prev => ({ ...prev, address: value }));
    if (debouncedSearch.current) clearTimeout(debouncedSearch.current);
    debouncedSearch.current = setTimeout(() => searchAddress(value), 300);
  };

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

  // ---- Handlers ----

  const handleChange = (e) => {
    if (e.target.id === 'sale' || e.target.id === 'rent') {
      setFormData(prev => ({ ...prev, type: e.target.id }));
    } else if (e.target.id === 'parking' || e.target.id === 'furnished' || e.target.id === 'offer') {
      setFormData(prev => ({ ...prev, [e.target.id]: e.target.checked }));
    } else if (e.target.type === 'select-one') {
      if (e.target.name === 'propertyType') {
        const pt = propertyTypes.find(p => p.slug === e.target.value);
        setSelectedPropertyType(pt || null);
        setPropertyTypeFields({});
        const ptCat = pt?.category || '';
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
        const cat = categories.find(c => c.slug === e.target.value);
        setSelectedCategory(cat || null);
        setFormData(prev => ({ ...prev, category: e.target.value, attributes: {} }));
      } else {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
      }
    } else if (e.target.type === 'number') {
      setFormData(prev => ({ ...prev, [e.target.id]: e.target.value }));
    } else {
      setFormData(prev => ({ ...prev, [e.target.id]: e.target.value }));
    }
  };

  const handlePropertyTypeFieldChange = (fieldKey, value) => {
    setPropertyTypeFields(prev => ({ ...prev, [fieldKey]: value }));
  };

  const handleCategoryFieldChange = (fieldKey, value) => {
    setFormData(prev => ({
      ...prev,
      attributes: { ...prev.attributes, [fieldKey]: value },
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
    setFormData(prev => ({
      ...prev,
      imageUrls: prev.imageUrls.filter((_, i) => i !== index),
    }));
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

      const mergedData = {
        ...formData,
        bedrooms: propertyTypeFields.bedrooms ?? formData.bedrooms,
        bathrooms: propertyTypeFields.bathrooms ?? formData.bathrooms,
        parking: propertyTypeFields.parking ?? formData.parking,
        furnished: propertyTypeFields.furnished ?? formData.furnished,
        propertyTypeFields: propertyTypeFields,
        userRef: currentUser._id,
      };

      const data = await apiClient.post(`/listing/update/${params.listingId}`, mergedData);
      setLoading(false);
      if (data.success === false) {
        setError(data.message);
      } else {
        window.dispatchEvent(new CustomEvent('listing-updated', { detail: { id: data._id } }));
        navigate(`/listing/${data._id}`);
      }
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  if (fetchingListing) {
    return (
      <main className='flex items-center justify-center py-20'>
        <div className='flex items-center gap-3 text-gray-500'>
          <div className='w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin'></div>
          Loading listing...
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className='max-w-6xl mx-auto'>
        <div className='text-center mb-8'>
          <h1 className='text-4xl font-bold text-gray-900 mb-3'>Update Property Listing</h1>
          <p className='text-lg text-gray-600 max-w-2xl mx-auto'>
            Modify your property listing details
          </p>
        </div>

        <div className='bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden'>
          <form onSubmit={handleSubmit} className='p-8'>
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
                    {propertyTypes.map((type) => (
                      <option key={type._id} value={type.slug}>
                        {type.icon} {type.name}
                      </option>
                    ))}
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

              {/* Listing Type */}
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
                        <label className='block text-sm font-medium text-gray-700 mb-2'>Bedrooms *</label>
                        <input
                          type='number'
                          id='bedrooms'
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
                          id='bathrooms'
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

              {/* Address */}
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

                    {/* Address Suggestions */}
                    {showSuggestions && addressSuggestions.length > 0 && (
                      <div className='absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto'>
                        {addressSuggestions.map((s, index) => (
                          <div
                            key={index}
                            className={`p-3 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors ${
                              index === suggestionIdx ? 'bg-blue-50' : 'hover:bg-gray-50'
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

                    {/* Find on Map / Use My Location */}
                    <div className='mt-3 flex gap-3'>
                      <button
                        type='button'
                        onClick={() => {
                          const parts = [formData.address, formData.city, formData.state, formData.pincode].filter(Boolean);
                          if (parts.length > 0) {
                            geocodeAddress(parts.join(', ') + ', India');
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
                              setFormData(prev => ({ ...prev, location: { lat: latitude, lng: longitude } }));
                              reverseGeocode(latitude, longitude);
                              setGeoStatus('Current location found!');
                              setTimeout(() => setGeoStatus(''), 2000);
                            },
                            () => {
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

                {/* City, Locality, State, Pincode */}
                <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
                  <div>
                    <label htmlFor='city' className='block text-sm font-medium text-gray-700 mb-2'>City *</label>
                    <input type='text' placeholder='City' id='city' required
                      className='w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors'
                      onChange={handleChange} value={formData.city} />
                  </div>
                  <div>
                    <label htmlFor='locality' className='block text-sm font-medium text-gray-700 mb-2'>Locality</label>
                    <input type='text' placeholder='Neighbourhood / Suburb' id='locality'
                      className='w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors'
                      onChange={handleChange} value={formData.locality || ''} />
                  </div>
                  <div>
                    <label htmlFor='state' className='block text-sm font-medium text-gray-700 mb-2'>State *</label>
                    <input type='text' placeholder='State' id='state' required
                      className='w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors'
                      onChange={handleChange} value={formData.state} />
                  </div>
                  <div>
                    <label htmlFor='pincode' className='block text-sm font-medium text-gray-700 mb-2'>Pincode *</label>
                    <input type='text' placeholder='Pincode' id='pincode' required
                      className='w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors'
                      onChange={handleChange} value={formData.pincode} />
                  </div>
                </div>
              </div>

              {/* Map */}
              <div>
                <label className='block text-sm font-medium text-gray-700 mb-2'>Property Location on Map</label>
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
                      {formData.location?.lat && formData.location?.lng && (
                        <div className='flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium'>
                          <svg className='w-3 h-3' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M5 13l4 4L19 7' />
                          </svg>
                          Location Set
                        </div>
                      )}
                    </div>
                  </div>

                  <div className='p-4'>
                    <div className='h-80 w-full rounded-lg overflow-hidden border border-gray-200 relative'>
                      <MapContainer
                        center={formData.location?.lat && formData.location?.lng
                          ? [formData.location.lat, formData.location.lng]
                          : defaultCenter}
                        zoom={12}
                        style={{ height: '100%', width: '100%' }}
                        className='z-0'
                        zoomControl={false}
                        scrollWheelZoom={true}
                      >
                        <TileLayer
                          attribution={tileLayers[mapLayer].attribution}
                          url={tileLayers[mapLayer].url}
                        />
                        <ZoomControl position='bottomright' />
                        <FlyToLocation lat={formData.location?.lat} lng={formData.location?.lng} zoom={15} />
                        <LocationPicker onLocationSelect={handleLocationSelect} />
                        {formData.location?.lat && formData.location?.lng && (
                          <Marker position={[formData.location.lat, formData.location.lng]} icon={customIcon}>
                            <Popup>{formData.address || 'Selected location'}</Popup>
                          </Marker>
                        )}
                      </MapContainer>
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
                              className={`px-3 py-2 text-xs font-medium transition-colors ${
                                mapLayer === layer
                                  ? 'bg-blue-500 text-white'
                                  : 'bg-white text-gray-700 hover:bg-gray-50'
                              }`}
                            >
                              {layer === 'street' && 'Street'}
                              {layer === 'satellite' && 'Satellite'}
                              {layer === 'terrain' && 'Terrain'}
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
                  <label className='block text-sm font-medium text-gray-700 mb-2'>Category *</label>
                  <select
                    name='category'
                    value={formData.category}
                    onChange={handleChange}
                    className='w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors'
                    required
                  >
                    <option value=''>Select category</option>
                    {categories.map((c) => (
                      <option key={c._id} value={c.slug}>{c.name}</option>
                    ))}
                  </select>
                  {selectedCategory && (
                    <p className='text-xs text-gray-500 mt-1'>
                      {selectedCategory.fields?.length || 0} additional fields for this category
                    </p>
                  )}
                </div>

                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-2'>Features</label>
                  <div className='flex flex-wrap gap-3'>
                    <label className='flex items-center'>
                      <input type='checkbox' id='parking' checked={formData.parking} onChange={handleChange}
                        className='w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500' />
                      <span className='ml-2 text-sm text-gray-700'>Parking</span>
                    </label>
                    <label className='flex items-center'>
                      <input type='checkbox' id='furnished' checked={formData.furnished} onChange={handleChange}
                        className='w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500' />
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
                      <h2 className='text-xl font-semibold text-gray-900'>{selectedCategory.name} Details</h2>
                      <p className='text-sm text-gray-500'>Fill in the specific details for your {selectedCategory.name.toLowerCase()} listing</p>
                    </div>
                  </div>
                  <DynamicCategoryFields
                    fields={selectedCategory.fields}
                    values={formData.attributes || {}}
                    onChange={handleCategoryFieldChange}
                  />
                </div>
              )}

              {/* Image Upload */}
              <div>
                <label className='block text-sm font-medium text-gray-700 mb-2'>Images</label>
                <div className='border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors'>
                  <input type='file' id='images' accept='image/*' multiple className='hidden'
                    onChange={(e) => setFiles(e.target.files)} />
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
                      <button type='button' onClick={handleImageSubmit} disabled={uploading}
                        className='px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors'>
                        {uploading ? 'Uploading...' : 'Upload Images'}
                      </button>
                    </div>
                  </div>
                )}

                {formData.imageUrls && formData.imageUrls.length > 0 && (
                  <div className='mt-4'>
                    <p className='text-sm font-medium text-gray-700 mb-2'>Uploaded Images:</p>
                    <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
                      {formData.imageUrls.map((url, index) => (
                        <div key={index} className='relative'>
                          <img src={normalizeImageUrl(url)} alt={`Uploaded ${index + 1}`}
                            className='w-full h-24 object-cover rounded-lg border border-gray-200' />
                          <button type='button' onClick={() => handleRemoveImage(index)}
                            className='absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600 transition-colors'>
                            ×
                          </button>
                          {index === 0 && (
                            <div className='absolute bottom-1 left-1 bg-blue-600 text-white text-xs px-2 py-1 rounded'>Cover</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {imageUploadError && (
                  <p className='text-sm text-red-600 mt-2'>{imageUploadError}</p>
                )}
              </div>

              {/* Property Owners */}
              <div>
                <label className='block text-sm font-medium text-gray-700 mb-2'>Property Owner(s)</label>
                <div className='space-y-4'>
                  <div className='flex items-center justify-between'>
                    <p className='text-sm text-gray-600'>Select property owners for this listing</p>
                    <button type='button' onClick={() => setShowCreateOwner(!showCreateOwner)}
                      className='px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors'>
                      {showCreateOwner ? 'Cancel' : 'Add New Owner'}
                    </button>
                  </div>

                  <input type='text' placeholder='Search owners by name, email, or company...'
                    value={ownerSearchQuery} onChange={(e) => setOwnerSearchQuery(e.target.value)}
                    className='w-full border border-gray-300 rounded-lg px-4 py-3 pl-10 text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors' />

                  <div className='border border-gray-200 rounded-lg overflow-hidden'>
                    <div className='max-h-60 overflow-y-auto'>
                      {owners.length === 0 ? (
                        <div className='p-6 text-center text-gray-500 text-sm'>No owners found</div>
                      ) : (
                        owners
                          .filter((o) => {
                            const q = ownerSearchQuery.toLowerCase();
                            return o.name?.toLowerCase().includes(q)
                              || (o.companyName && o.companyName.toLowerCase().includes(q))
                              || (o.email && o.email.toLowerCase().includes(q));
                          })
                          .map((owner) => (
                            <label key={owner._id} className={`flex items-center gap-4 p-4 cursor-pointer transition-colors border-b border-gray-100 last:border-b-0 ${
                              (formData.ownerIds || []).includes(owner._id)
                                ? 'bg-indigo-50 border-l-4 border-indigo-500'
                                : 'hover:bg-gray-50'
                            }`}>
                              <input type='checkbox'
                                checked={(formData.ownerIds || []).includes(owner._id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setFormData(prev => ({ ...prev, ownerIds: [...(prev.ownerIds || []), owner._id] }));
                                  } else {
                                    setFormData(prev => ({ ...prev, ownerIds: (prev.ownerIds || []).filter(id => id !== owner._id) }));
                                  }
                                }}
                                className='w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500' />
                              <div className='flex-1 min-w-0'>
                                <div className='font-medium text-gray-900 truncate'>{owner.name}</div>
                                {owner.companyName && <div className='text-sm text-gray-600 truncate'>{owner.companyName}</div>}
                                {owner.email && <div className='text-sm text-gray-500 truncate'>{owner.email}</div>}
                              </div>
                            </label>
                          ))
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Create New Owner */}
              {showCreateOwner && (
                <div className='bg-gray-50 rounded-lg p-6 border border-gray-200'>
                  <h3 className='text-lg font-semibold text-gray-900 mb-4'>Create New Owner</h3>
                  <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                    <div>
                      <label className='block text-sm font-medium text-gray-700 mb-2'>Owner Name *</label>
                      <input type='text' placeholder='Enter owner name' value={newOwner.name}
                        onChange={(e) => setNewOwner({ ...newOwner, name: e.target.value })}
                        className='w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors' />
                    </div>
                    <div>
                      <label className='block text-sm font-medium text-gray-700 mb-2'>Email</label>
                      <input type='email' placeholder='Enter email' value={newOwner.email}
                        onChange={(e) => setNewOwner({ ...newOwner, email: e.target.value })}
                        className='w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors' />
                    </div>
                    <div>
                      <label className='block text-sm font-medium text-gray-700 mb-2'>Phone</label>
                      <input type='tel' placeholder='Enter phone' value={newOwner.phone}
                        onChange={(e) => setNewOwner({ ...newOwner, phone: e.target.value })}
                        className='w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors' />
                    </div>
                    <div>
                      <label className='block text-sm font-medium text-gray-700 mb-2'>Company Name</label>
                      <input type='text' placeholder='Enter company name' value={newOwner.companyName}
                        onChange={(e) => setNewOwner({ ...newOwner, companyName: e.target.value })}
                        className='w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors' />
                    </div>
                  </div>
                  <div className='flex gap-3 mt-4'>
                    <button type='button' disabled={creatingOwner || !newOwner.name}
                      onClick={async () => {
                        try {
                          setCreatingOwner(true);
                          const data = await apiClient.post('/owner/', newOwner);
                          const created = data.data || data;
                          setOwners(prev => [...prev, created]);
                          setFormData(prev => ({ ...prev, ownerIds: [...(prev.ownerIds || []), created._id] }));
                          setNewOwner({ name: '', email: '', phone: '', companyName: '' });
                          setShowCreateOwner(false);
                        } finally {
                          setCreatingOwner(false);
                        }
                      }}
                      className='px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors'>
                      {creatingOwner ? 'Creating...' : 'Create Owner'}
                    </button>
                    <button type='button'
                      onClick={() => { setShowCreateOwner(false); setNewOwner({ name: '', email: '', phone: '', companyName: '' }); }}
                      className='px-6 py-3 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors'>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Submit */}
              <div className='pt-8 border-t border-gray-200'>
                <div className='flex flex-col sm:flex-row items-center justify-between gap-4'>
                  <div className='text-center sm:text-left'>
                    <h3 className='text-lg font-semibold text-gray-900 mb-1'>Ready to Update?</h3>
                    <p className='text-sm text-gray-600'>Review your changes and submit to update the listing.</p>
                  </div>
                  <button type='submit' disabled={loading || uploading}
                    className='px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-semibold hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 transition-all duration-300 shadow-lg hover:shadow-xl flex items-center gap-3 min-w-[200px] justify-center'>
                    {loading ? (
                      <>
                        <svg className='animate-spin w-5 h-5' fill='none' viewBox='0 0 24 24'>
                          <circle className='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' strokeWidth='4'></circle>
                          <path className='opacity-75' fill='currentColor' d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'></path>
                        </svg>
                        Updating...
                      </>
                    ) : (
                      <>
                        <svg className='w-5 h-5' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                          <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M5 13l4 4L19 7' />
                        </svg>
                        Update Listing
                      </>
                    )}
                  </button>
                </div>
                {error && <p className='text-sm text-red-600 mt-4 text-center'>{error}</p>}
              </div>
            </div>
          </form>

          {/* Documents section — shown once listing exists */}
          {params.listingId && (
            <div className='mt-8'>
              <PropertyDocuments listingId={params.listingId} canEdit={true} />
            </div>
          )}

          {/* Voice Notes */}
          {params.listingId && (
            <div className='mt-6 bg-white border border-slate-200 rounded-xl p-5 shadow-sm'>
              <VoiceNotePanel
                listingId={params.listingId}
                initialNotes={formData.voiceNotes || []}
              />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

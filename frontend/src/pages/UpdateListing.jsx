import { useEffect, useState, useRef } from 'react';
import {
  getDownloadURL,
  getStorage,
  ref,
  uploadBytesResumable,
} from 'firebase/storage';
import { app } from '../firebase';
import { useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { apiClient } from '../utils/http';
import { io } from 'socket.io-client';
import { useBuyerView } from '../contexts/BuyerViewContext';
import DynamicCategoryFields from '../components/DynamicCategoryFields';

const defaultIcon = new L.Icon({
  iconUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  iconRetinaUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  shadowUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

export default function UpdateListing() {
  const { currentUser } = useSelector((state) => state.user);
  const { isBuyerViewMode } = useBuyerView();
  const navigate = useNavigate();
  const params = useParams();
  const fileInputRef = useRef(null);
  
  const [files, setFiles] = useState(null);
  const [formData, setFormData] = useState({
    imageUrls: [],
    name: '',
    description: '',
    address: '',
    type: 'sale',
    propertyType: 'house',
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
    location: {
      lat: null,
      lng: null,
    },
    // New fields
    areaName: '',
    plotSize: '',
    sqYard: '',
    sqYardRate: '',
    totalValue: '',
    propertyNo: '',
    remarks: '',
    otherAttachment: null,
  });
  const [imageUploadError, setImageUploadError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [geocoding, setGeocoding] = useState(false);
  const [geoStatus, setGeoStatus] = useState('');
  const [categoryFields, setCategoryFields] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [owners, setOwners] = useState([]);
  const [ownersQuery, setOwnersQuery] = useState('');
  const [ownersLoading, setOwnersLoading] = useState(false);
  const [showCreateOwner, setShowCreateOwner] = useState(false);
  const [newOwner, setNewOwner] = useState({ name: '', email: '', phone: '', companyName: '' });
  const [creatingOwner, setCreatingOwner] = useState(false);

  useEffect(() => {
    if (!currentUser) {
      navigate('/sign-in');
    }
    // Redirect buyers away from update listing page
    if (currentUser && (currentUser.role === 'buyer' || isBuyerViewMode)) {
      navigate('/unauthorized');
    }
  }, [currentUser, navigate, isBuyerViewMode]);

  useEffect(() => {
    const fetchListing = async () => {
      const listingId = params.listingId;
      const data = await apiClient.get(`/listing/get/${listingId}`);
      if (data.success === false) {
        console.log(data.message);
        return;
      }
      setFormData(data);
    };

    fetchListing();
  }, [params.listingId]);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const data = await apiClient.get('/category/list');
        if (Array.isArray(data)) {
          let cats = data;
          if (currentUser?.role === 'employee' && currentUser.assignedCategories?.length) {
            cats = data.filter((c) => currentUser.assignedCategories.includes(c.slug));
          }
          setCategories(cats);
        }
      } catch (e) {}
    };
    fetchCategories();
    
    const fetchOwners = async () => {
      try {
        setOwnersLoading(true);
        const data = await apiClient.get('/owner/list');
        if (Array.isArray(data)) {
          const activeOwners = data.filter(owner => owner.active);
          setOwners(activeOwners);
        }
      } catch (error) {
        console.error('Error fetching owners:', error);
      } finally {
        setOwnersLoading(false);
      }
    };

    if (currentUser) {
      fetchOwners();
    }

    // Realtime owners refresh
    const socket = io('http://localhost:3000', {
      withCredentials: true,
      transports: ['websocket'],
    });
    const handleOwnersChanged = () => fetchOwners();
    socket.on('owners:changed', handleOwnersChanged);
    return () => {
      socket.off('owners:changed', handleOwnersChanged);
      socket.close();
    };
  }, [currentUser]);

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

  // Helper function to determine if residential fields should be shown
  const shouldShowResidentialFields = () => {
    const residentialTypes = ['house', 'flat'];
    const nonResidentialTypes = ['plot', 'factory', 'shelter', 'other'];
    
    // Get the actual property type (including custom type)
    const actualPropertyType = formData.propertyType === 'other' ? formData.customPropertyType : formData.propertyType;
    
    // Show residential fields only for house and flat
    if (residentialTypes.includes(actualPropertyType)) {
      return true;
    }
    
    // Hide residential fields for non-residential types
    if (nonResidentialTypes.includes(formData.propertyType)) {
      return false;
    }
    
    // For custom property types, check if they sound residential
    if (formData.propertyType === 'other' && actualPropertyType) {
      const residentialKeywords = ['house', 'flat', 'apartment', 'villa', 'home', 'residential'];
      const isResidential = residentialKeywords.some(keyword => 
        actualPropertyType.toLowerCase().includes(keyword)
      );
      return isResidential;
    }
    
    // Default to showing fields for any other types
    return true;
  };

  // Load category field definitions when category changes
  useEffect(() => {
    const loadCategoryFields = async () => {
      if (!formData.category) {
        setCategoryFields([]);
        setSelectedCategory(null);
        return;
      }
      try {
        const data = await apiClient.get(`/category/by-slug/${formData.category}`);
        const fields = Array.isArray(data?.fields) ? data.fields : [];
        setCategoryFields(fields);
        setSelectedCategory(data);
      } catch (_) {
        setCategoryFields([]);
        setSelectedCategory(null);
      }
    };
    loadCategoryFields();
  }, [formData.category]);

  const handleImageSubmit = async (e) => {
    if (files.length > 0 && files.length + formData.imageUrls.length < 7) {
      setUploading(true);
      setImageUploadError(false);
      try {
        const uploadedUrls = await uploadImagesToBackend(files);
        setFormData({
          ...formData,
          imageUrls: formData.imageUrls.concat(uploadedUrls),
        });
        setUploading(false);
      } catch (err) {
        setImageUploadError('Image upload failed (2 mb max per image)');
        setUploading(false);
      }
    } else {
      setImageUploadError('You can only upload 6 images per listing');
      setUploading(false);
    }
  };

  const uploadImagesToBackend = async (fileList) => {
    const form = new FormData();
    for (let i = 0; i < fileList.length; i++) {
      form.append('images', fileList[i]);
    }
    const data = await apiClient.upload('/upload/multiple', form);
    if (!data.urls) throw new Error('upload_failed');
    return data.urls;
  };

  const handleRemoveImage = (index) => {
    setFormData(prev => ({
      ...prev,
      imageUrls: prev.imageUrls.filter((_, i) => i !== index),
    }));
  };

  const handleChange = (e) => {
    if (e.target.id === 'sale' || e.target.id === 'rent') {
      setFormData(prev => ({
        ...prev,
        type: e.target.id,
      }));
    } else if (e.target.id === 'parking' || e.target.id === 'furnished' || e.target.id === 'offer') {
      setFormData(prev => ({
        ...prev,
        [e.target.id]: e.target.checked,
      }));
    } else if (e.target.name === 'propertyType') {
      setFormData(prev => ({
        ...prev,
        propertyType: e.target.value,
      }));
    } else if (e.target.id === 'customPropertyType') {
      setFormData(prev => ({
        ...prev,
        customPropertyType: e.target.value,
      }));
    } else if (e.target.type === 'number') {
      setFormData(prev => ({
        ...prev,
        [e.target.id]: parseInt(e.target.value),
      }));
    } else if (e.target.type === 'file') {
      setFormData(prev => ({
        ...prev,
        [e.target.id]: e.target.files[0],
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [e.target.id]: e.target.value,
      }));
    }
  };

  const handleOwnerChange = (ownerId, isChecked) => {
    setFormData(prev => ({
      ...prev,
      ownerIds: isChecked
        ? [...prev.ownerIds, ownerId]
        : prev.ownerIds.filter(id => id !== ownerId)
    }));
  };

  const handleCategoryFieldChange = (fieldKey, value) => {
    setFormData(prev => ({
      ...prev,
      attributes: { ...prev.attributes, [fieldKey]: value },
    }));
  };

  const createOwner = async () => {
    if (!newOwner.name.trim()) {
      alert('Owner name is required');
      return;
    }
    
    try {
      setCreatingOwner(true);
      const data = await apiClient.post('/owner', newOwner);
      if (data && data._id) {
        setOwners(prev => [data, ...prev]);
        setNewOwner({ name: '', email: '', phone: '', companyName: '' });
        setShowCreateOwner(false);
        // Auto-select the newly created owner
        setFormData(prev => ({
          ...prev,
          ownerIds: [...prev.ownerIds, data._id]
        }));
      }
    } catch (error) {
      console.error('Error creating owner:', error);
    } finally {
      setCreatingOwner(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      const data = await apiClient.post('/category/create', { name: newCategoryName.trim() });
      if (data && data.slug) {
        setCategories((prev) => [...prev, data]);
        setFormData(prev => ({ ...prev, category: data.slug }));
        setNewCategoryName('');
      }
    } catch (e) {}
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

      // Handle other attachment upload if present
      let otherAttachmentUrl = '';
      if (formData.otherAttachment) {
        try {
          const attachmentUrl = await storeImage(formData.otherAttachment);
          otherAttachmentUrl = attachmentUrl;
        } catch (error) {
          console.error('Error uploading attachment:', error);
          setError('Failed to upload attachment. Please try again.');
          setLoading(false);
          return;
        }
      }

      // Prepare form data with conditional fields
      const submitData = {
        ...formData,
        userRef: currentUser._id,
        propertyType: formData.propertyType === 'other' ? formData.customPropertyType : formData.propertyType,
        otherAttachment: otherAttachmentUrl,
      };
      
      // For non-residential properties, provide default values for required fields
      if (!shouldShowResidentialFields()) {
        submitData.bedrooms = 0;
        submitData.bathrooms = 0;
        submitData.parking = false;
        submitData.furnished = false;
      }
      
      // Ensure description is not empty (required field)
      if (!submitData.description || submitData.description.trim() === '') {
        submitData.description = 'No description provided';
      }

      if (formData.address && (!formData.location || !formData.location.lat)) {
        await handleGeocodeAddress();
      }

      const data = await apiClient.post(`/listing/update/${params.listingId}`, submitData);
      setLoading(false);
      if (data.success === false) {
        setError(data.message);
      } else {
        // Trigger cache invalidation event
        window.dispatchEvent(new CustomEvent('listing-updated', { detail: { id: data._id } }));
        navigate(`/listing/${data._id}`);
      }
    } catch (error) {
      setError(error.message);
      setLoading(false);
    }
  };
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) return;
    setGeocoding(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setFormData({
          ...formData,
          location: { lat: latitude, lng: longitude },
        });
        setGeocoding(false);
      },
      () => setGeocoding(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const storeImage = async (file) => {
    return new Promise((resolve, reject) => {
      const storage = getStorage(app);
      const fileName = new Date().getTime() + file.name;
      const storageRef = ref(storage, fileName);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          console.log('Upload is ' + progress + '% done');
        },
        (error) => {
          reject(error);
        },
        () => {
          getDownloadURL(uploadTask.snapshot.ref).then((downloadURL) => {
            resolve(downloadURL);
          });
        }
      );
    });
  };

  const handleGeocodeAddress = async () => {
    if (!formData.address) return;
    try {
      setGeocoding(true);
      setGeoStatus('Geocoding address...');
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        formData.address
      )}`;
      const res = await fetch(url, {
        headers: { 'Accept-Language': 'en' },
      });
      const data = await res.json();
      if (Array.isArray(data) && data[0]) {
        setFormData({
          ...formData,
          location: { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) },
        });
        setGeoStatus('Location found!');
      } else {
        setGeoStatus('Location not found');
      }
    } catch (error) {
      setGeoStatus('Geocoding failed');
    } finally {
      setGeocoding(false);
    }
  };
  return (
    <main>
      {/* Minimal Header */}
      <div className='text-center mb-6'>
        <h1 className='text-2xl font-semibold text-gray-900 mb-2'>
          Update Property Listing
        </h1>
        <p className='text-gray-600'>
          Modify your property listing details
        </p>
      </div>
      
      {/* Main Form Container */}
      <div className='bg-white rounded-lg shadow-sm border border-gray-200'>
        <form onSubmit={handleSubmit} className='p-4 space-y-4'>
          <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
            {/* Left Column */}
            <div className='space-y-4'>
              {/* Property Name */}
              <div>
                <label htmlFor='name' className='block text-sm font-medium text-gray-700 mb-1'>
                  Property Name *
                </label>
                <input
                  type='text'
                  placeholder='e.g., Beautiful 3BR House in Downtown'
                  className='w-full border border-gray-300 rounded px-3 py-2 text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors'
                  id='name'
                  maxLength='62'
                  minLength='10'
                  required
                  onChange={handleChange}
                  value={formData.name}
                />
              </div>
          
              {/* Description */}
              <div>
                <label htmlFor='description' className='block text-sm font-medium text-gray-700 mb-1'>
                  Description
                </label>
                <textarea
                  placeholder='Describe your property in detail...'
                  className='w-full border border-gray-300 rounded px-3 py-2 text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors resize-none'
                  id='description'
                  rows='4'
                  onChange={handleChange}
                  value={formData.description}
                />
              </div>

              {/* Address */}
              <div>
                <label htmlFor='address' className='block text-sm font-medium text-gray-700 mb-1'>
                  Address *
                </label>
                <input
                  type='text'
                  placeholder='Enter the full address'
                  className='w-full border border-gray-300 rounded px-3 py-2 text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors'
                  id='address'
                  required
                  onChange={handleChange}
                  value={formData.address}
                />
              </div>

              {/* Location Actions */}
              <div className='flex gap-2 flex-wrap'>
                <button
                  type='button'
                  onClick={handleGeocodeAddress}
                  className='px-3 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-60'
                  disabled={geocoding}
                >
                  {geocoding ? 'Working...' : 'Find Location'}
                </button>
                <button
                  type='button'
                  onClick={handleUseCurrentLocation}
                  className='px-3 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-60'
                  disabled={geocoding}
                >
                  {geocoding ? 'Working...' : 'Use Current Location'}
                </button>
                {geoStatus && (
                  <span className='text-sm text-slate-500 self-center'>{geoStatus}</span>
                )}
              </div>
              {/* Property Type */}
              <div>
                <label className='block text-sm font-medium text-gray-700 mb-2'>
                  Property Type *
                </label>
                <div className='grid grid-cols-3 gap-1'>
                  {['house', 'flat', 'plot', 'factory', 'shelter', 'other'].map((type) => (
                    <label key={type} className={`flex items-center gap-1 cursor-pointer p-2 rounded border text-sm transition-colors ${
                      formData.propertyType === type 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}>
                      <input
                        type='radio'
                        name='propertyType'
                        value={type}
                        checked={formData.propertyType === type}
                        onChange={handleChange}
                        className='sr-only'
                      />
                      <span className='capitalize'>{type}</span>
                    </label>
                  ))}
                </div>
                {formData.propertyType === 'other' && (
                  <div className='mt-2'>
                    <input
                      type='text'
                      id='customPropertyType'
                      placeholder='Specify property type'
                      value={formData.customPropertyType}
                      onChange={handleChange}
                      className='w-full border border-gray-300 rounded px-3 py-2 text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors'
                    />
                  </div>
                )}
              </div>

              {/* Plot Size */}
              <div>
                <label htmlFor='plotSize' className='block text-sm font-medium text-gray-700 mb-1'>
                  Plot Size *
                </label>
                <input
                  type='text'
                  placeholder='e.g., 200 sq yards, 1 acre, 5000 sq ft'
                  className='w-full border border-gray-300 rounded px-3 py-2 text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors'
                  id='plotSize'
                  required
                  onChange={handleChange}
                  value={formData.plotSize}
                />
              </div>

              {/* Area Name */}
              <div>
                <label htmlFor='areaName' className='block text-sm font-medium text-gray-700 mb-1'>
                  Area Name *
                </label>
                <input
                  type='text'
                  placeholder='e.g., Civil Lines, DLF Phase 1'
                  className='w-full border border-gray-300 rounded px-3 py-2 text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors'
                  id='areaName'
                  required
                  onChange={handleChange}
                  value={formData.areaName}
                />
              </div>

              {/* Dynamic Category Fields */}
              {selectedCategory && selectedCategory.fields && selectedCategory.fields.length > 0 && (
                <div className='border rounded-lg p-4 bg-gray-50'>
                  <div className='flex items-center gap-3 mb-4'>
                    <div className='w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center'>
                      <svg className='w-4 h-4 text-indigo-600' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                        <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' />
                      </svg>
                    </div>
                    <div>
                      <h3 className='font-semibold text-gray-800'>{selectedCategory.name} Details</h3>
                      <p className='text-xs text-gray-500'>Fill in the specific details for this category</p>
                    </div>
                  </div>
                  <DynamicCategoryFields
                    fields={selectedCategory.fields}
                    values={formData.attributes || {}}
                    onChange={handleCategoryFieldChange}
                  />
                </div>
              )}
              {/* Location Coordinates */}
              <div className='grid grid-cols-2 gap-2'>
                <div>
                  <label className='block text-xs text-gray-600 mb-1'>Latitude</label>
                  <input
                    type='number'
                    step='any'
                    placeholder='Latitude'
                    className='w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                    value={formData.location?.lat ?? ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        location: {
                          lat: e.target.value ? parseFloat(e.target.value) : null,
                          lng: formData.location?.lng ?? null,
                        },
                      })
                    }
                  />
                </div>
                <div>
                  <label className='block text-xs text-gray-600 mb-1'>Longitude</label>
                  <input
                    type='number'
                    step='any'
                    placeholder='Longitude'
                    className='w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                    value={formData.location?.lng ?? ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        location: {
                          lat: formData.location?.lat ?? null,
                          lng: e.target.value ? parseFloat(e.target.value) : null,
                        },
                      })
                    }
                  />
                </div>
              </div>
              
              <div className='flex gap-2'>
                <button
                  type='button'
                  onClick={() =>
                    setFormData({
                      ...formData,
                      location: { lat: null, lng: null },
                    })
                  }
                  className='px-3 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50'
                >
                  Clear Location
                </button>
              </div>
              
              {formData.location && formData.location.lat && formData.location.lng && (
                <div className='w-full h-56 rounded-lg overflow-hidden border border-gray-300'>
                  <MapContainer
                    center={[formData.location.lat, formData.location.lng]}
                    zoom={14}
                    style={{ height: '100%', width: '100%' }}
                    scrollWheelZoom={false}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                      url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
                    />
                    <Marker
                      position={[formData.location.lat, formData.location.lng]}
                      icon={defaultIcon}
                    >
                      <Popup>{formData.address || 'Selected location'}</Popup>
                    </Marker>
                  </MapContainer>
                </div>
              )}
            </div>
              
            {/* Right Column */}
            <div className='space-y-4'>
              {/* Bedrooms & Bathrooms */}
              {shouldShowResidentialFields() && (
                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-2'>
                    Rooms & Amenities
                  </label>
                  <div className='grid grid-cols-2 gap-2'>
                    <div>
                      <label htmlFor='bedrooms' className='block text-xs text-gray-600 mb-1'>Bedrooms</label>
                      <input
                        type='number'
                        id='bedrooms'
                        min='1'
                        max='10'
                        required
                        className='w-full border border-gray-300 rounded px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors'
                        onChange={handleChange}
                        value={formData.bedrooms}
                      />
                    </div>
                    <div>
                      <label htmlFor='bathrooms' className='block text-xs text-gray-600 mb-1'>Bathrooms</label>
                      <input
                        type='number'
                        id='bathrooms'
                        min='1'
                        max='10'
                        required
                        className='w-full border border-gray-300 rounded px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors'
                        onChange={handleChange}
                        value={formData.bathrooms}
                      />
                    </div>
                  </div>
                  <div className='flex gap-4 mt-3'>
                    <label className='flex items-center gap-2 cursor-pointer'>
                      <input
                        type='checkbox'
                        id='parking'
                        className='w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500'
                        onChange={handleChange}
                        checked={formData.parking}
                      />
                      <span className='text-sm'>Parking</span>
                    </label>
                    <label className='flex items-center gap-2 cursor-pointer'>
                      <input
                        type='checkbox'
                        id='furnished'
                        className='w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500'
                        onChange={handleChange}
                        checked={formData.furnished}
                      />
                      <span className='text-sm'>Furnished</span>
                    </label>
                  </div>
                </div>
              )}
              {/* Price */}
              <div>
                <label htmlFor='regularPrice' className='block text-sm font-medium text-gray-700 mb-2'>
                  Price (₹) *
                </label>
                <input
                  type='number'
                  id='regularPrice'
                  min='0'
                  required
                  className='w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors'
                  onChange={handleChange}
                  value={formData.regularPrice}
                />
                {formData.offer && (
                  <div className='mt-2'>
                    <label htmlFor='discountPrice' className='block text-sm font-medium text-gray-700 mb-1'>
                      Discounted Price (₹) *
                    </label>
                    <input
                      type='number'
                      id='discountPrice'
                      min='0'
                      required
                      className='w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors'
                      onChange={handleChange}
                      value={formData.discountPrice}
                    />
                  </div>
                )}
              </div>

              {/* Property Type Selection */}
              <div>
                <label className='block text-sm font-medium text-gray-700 mb-2'>
                  Listing Type *
                </label>
                <div className='flex gap-4'>
                  <label className='flex items-center gap-2 cursor-pointer'>
                    <input
                      type='radio'
                      id='sale'
                      name='type'
                      checked={formData.type === 'sale'}
                      onChange={handleChange}
                      className='w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500'
                    />
                    <span className='text-sm'>For Sale</span>
                  </label>
                  <label className='flex items-center gap-2 cursor-pointer'>
                    <input
                      type='radio'
                      id='rent'
                      name='type'
                      checked={formData.type === 'rent'}
                      onChange={handleChange}
                      className='w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500'
                    />
                    <span className='text-sm'>For Rent</span>
                  </label>
                </div>
              </div>

              {/* Offer Checkbox */}
              <div>
                <label className='flex items-center gap-2 cursor-pointer'>
                  <input
                    type='checkbox'
                    id='offer'
                    className='w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500'
                    onChange={handleChange}
                    checked={formData.offer}
                  />
                  <span className='text-sm font-medium text-gray-700'>Special Offer Available</span>
                </label>
              </div>
              {/* Category */}
              <div>
                <label className='block text-sm font-medium text-gray-700 mb-2'>
                  Category
                </label>
                <select
                  id='category'
                  className='w-full border border-gray-300 rounded px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors'
                  value={formData.category}
                  onChange={(e) =>
                    setFormData(prev => ({ ...prev, category: e.target.value }))
                  }
                >
                  <option value=''>Select category</option>
                  {categories.map((c) => (
                    <option key={c._id} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <div className='flex gap-2 mt-2'>
                  <input
                    type='text'
                    placeholder='Add new category (e.g., DLF, M3M)'
                    className='flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                  />
                  <button
                    type='button'
                    onClick={handleCreateCategory}
                    className='px-3 py-2 text-blue-700 border border-blue-700 rounded text-sm hover:bg-blue-50'
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Owner Selection */}
              {currentUser?.role === 'admin' && (
                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-2'>
                    Property Owners
                  </label>
                  <input
                    type='text'
                    placeholder='Search owners by name or email'
                    className='w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                    value={ownersQuery}
                    onChange={(e) => setOwnersQuery(e.target.value)}
                  />
                  <div className='max-h-32 overflow-auto border border-gray-300 rounded mt-2 p-2 space-y-1 bg-gray-50'>
                    {owners
                      .filter((o) => {
                        if (!ownersQuery.trim()) return true;
                        const q = ownersQuery.toLowerCase();
                        return (
                          String(o.name || '').toLowerCase().includes(q) ||
                          String(o.email || '').toLowerCase().includes(q)
                        );
                      })
                      .map((o) => {
                        const checked = (formData.ownerIds || []).includes(o._id);
                        return (
                          <label key={o._id} className='flex items-center gap-2 text-sm'>
                            <input
                              type='checkbox'
                              checked={checked}
                              onChange={(e) => handleOwnerChange(o._id, e.target.checked)}
                              className='w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500'
                            />
                            <span className='truncate'>{o.name}{o.companyName ? ` • ${o.companyName}` : ''}</span>
                            {o.email && <span className='text-slate-500 truncate'>({o.email})</span>}
                          </label>
                        );
                      })}
                    {owners.length === 0 && (
                      <div className='text-sm text-slate-500'>No owners found. Create owners in Admin.</div>
                    )}
                  </div>
                  {(formData.ownerIds || []).length > 0 && (
                    <div className='text-xs text-slate-600 mt-1'>Selected: {(formData.ownerIds || []).length}</div>
                  )}
                </div>
              )}

              {/* Images */}
              <div>
                <label className='block text-sm font-medium text-gray-700 mb-3'>
                  Images <span className='text-gray-500 text-sm'>(Optional)</span>
                </label>
                
                {/* Image Upload */}
                <div className='space-y-4'>
                  {/* Upload Section */}
                  <div className='bg-gradient-to-r from-gray-50 to-blue-50 rounded-2xl p-4 border border-gray-200'>
                    <div className='flex items-center gap-3 mb-3'>
                      <div className='w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center'>
                        <svg className='w-4 h-4 text-blue-600' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                          <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' />
                        </svg>
                      </div>
                      <h3 className='text-lg font-semibold text-gray-900'>Upload Images <span className='text-gray-500 text-sm font-normal'>(Optional)</span></h3>
                    </div>
                    
                    <div className='space-y-3'>
                      {/* File Input */}
                      <div className='relative'>
                        <input
                          onChange={(e) => {
                            setFiles(e.target.files);
                          }}
                          className='w-full border-2 border-dashed border-gray-300 rounded-xl p-4 text-center hover:border-blue-400 hover:bg-blue-50/50 transition-all duration-300 cursor-pointer'
                          type='file'
                          id='images'
                          accept='image/*'
                          multiple
                        />
                        <div className='absolute inset-0 flex flex-col items-center justify-center pointer-events-none'>
                          <svg className='w-6 h-6 text-gray-400 mb-2' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12' />
                          </svg>
                          <p className='text-sm text-gray-600 font-medium'>Click to select images</p>
                          <p className='text-xs text-gray-500'>or drag and drop</p>
                        </div>
                      </div>
                      
                      {/* Action Buttons */}
                      <div className='flex gap-2'>
                        <button
                          type='button'
                          disabled={uploading || !files || files.length === 0}
                          onClick={handleImageSubmit}
                          className='flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium'
                        >
                          {uploading ? (
                            <>
                              <svg className='w-4 h-4 mr-2 animate-spin' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15' />
                              </svg>
                              Uploading...
                            </>
                          ) : (
                            <>
                              <svg className='w-4 h-4 mr-2' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12' />
                              </svg>
                              Upload Images (Optional)
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Error Message */}
                  {imageUploadError && (
                    <div className='text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg p-3'>
                      {imageUploadError}
                    </div>
                  )}

                  {/* Uploaded Images */}
                  {formData.imageUrls.length > 0 && (
                    <div className='bg-gradient-to-r from-gray-50 to-green-50 rounded-2xl p-4 border border-gray-200'>
                      <div className='flex items-center justify-between mb-3'>
                        <div className='flex items-center gap-3'>
                          <div className='w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center'>
                            <svg className='w-4 h-4 text-green-600' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M5 13l4 4L19 7' />
                            </svg>
                          </div>
                          <div>
                            <h3 className='text-lg font-semibold text-gray-900'>Uploaded Images</h3>
                            <p className='text-sm text-gray-600'>
                              {formData.imageUrls.length} image{formData.imageUrls.length !== 1 ? 's' : ''} ready for your listing
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      <div className='grid grid-cols-2 sm:grid-cols-3 gap-3'>
                        {formData.imageUrls.map((url, index) => (
                          <div key={url} className='relative group'>
                            <img
                              src={url}
                              alt={`Listing ${index + 1}`}
                              className='w-full h-24 object-cover rounded-lg border border-gray-200'
                            />
                            <button
                              type='button'
                              onClick={() => handleRemoveImage(index)}
                              className='absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600 transition-colors'
                            >
                              ×
                            </button>
                            {index === 0 && (
                              <div className='absolute bottom-1 left-1 bg-blue-600 text-white text-xs px-2 py-1 rounded'>
                                Cover
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Submit Button */}
              <div className='pt-4'>
                <button
                  type='submit'
                  disabled={loading || uploading}
                  className='w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors'
                >
                  {loading ? 'Updating...' : 'Update Listing'}
                </button>
                {error && (
                  <div className='mt-3 p-3 bg-red-50 border border-red-200 rounded-lg'>
                    <p className='text-red-600 text-sm'>{error}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}

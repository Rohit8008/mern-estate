import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { FaPlus, FaSearch, FaFilter, FaUser, FaPhone, FaEnvelope, FaMapMarkerAlt, FaHome, FaBed, FaBath, FaDollarSign, FaCalendarAlt, FaEdit, FaTrash, FaEye } from 'react-icons/fa';
import { parseJsonSafely, fetchWithRefresh } from '../utils/http';

export default function BuyerRequirements() {
  console.log('BuyerRequirements component is rendering');
  
  const [buyerRequirements, setBuyerRequirements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const { currentUser } = useSelector((state) => state.user);
  
  console.log('BuyerRequirements - currentUser:', currentUser);

  const [editingId, setEditingId] = useState(null);
  const [viewingRequirement, setViewingRequirement] = useState(null);

  const emptyForm = {
    buyerName: '',
    buyerEmail: '',
    buyerPhone: '',
    preferredLocation: '',
    propertyType: 'sale',
    minPrice: '',
    maxPrice: '',
    minBedrooms: '',
    minBathrooms: '',
    preferredArea: '',
    additionalRequirements: '',
    budget: '',
    timeline: '',
    notes: ''
  };

  // Form state
  const [formData, setFormData] = useState(emptyForm);

  useEffect(() => {
    fetchBuyerRequirements();
  }, []);

  const fetchBuyerRequirements = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithRefresh('/api/buyer-requirements');
      const data = await parseJsonSafely(response);
      setBuyerRequirements(data || []);
    } catch (error) {
      console.error('Error fetching buyer requirements:', error);
      setError('Failed to load buyer requirements');
    } finally {
      setLoading(false);
    }
  };

  const cleanPayload = (data) => {
    const payload = { ...data };
    ['minPrice', 'maxPrice', 'minBedrooms', 'minBathrooms'].forEach((key) => {
      if (payload[key] === '' || payload[key] === null || payload[key] === undefined) {
        delete payload[key];
      } else {
        payload[key] = Number(payload[key]);
      }
    });
    ['buyerEmail', 'preferredLocation', 'preferredArea', 'additionalRequirements', 'budget', 'timeline', 'notes'].forEach((key) => {
      if (payload[key] === '') delete payload[key];
    });
    return payload;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload = cleanPayload(formData);
      const isEditing = !!editingId;
      const url = isEditing ? `/api/buyer-requirements/${editingId}` : '/api/buyer-requirements';
      const method = isEditing ? 'PUT' : 'POST';

      const response = await fetchWithRefresh(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setShowForm(false);
        setEditingId(null);
        setFormData(emptyForm);
        fetchBuyerRequirements();
      } else {
        const errData = await parseJsonSafely(response);
        setError(errData?.message || `Failed to ${isEditing ? 'update' : 'create'} buyer requirement`);
      }
    } catch (error) {
      console.error('Error saving buyer requirement:', error);
      setError(`Failed to ${editingId ? 'update' : 'create'} buyer requirement`);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (requirement) => {
    setEditingId(requirement._id);
    setViewingRequirement(null);
    setFormData({
      buyerName: requirement.buyerName || '',
      buyerEmail: requirement.buyerEmail || '',
      buyerPhone: requirement.buyerPhone || '',
      preferredLocation: requirement.preferredLocation || '',
      propertyType: requirement.propertyType || 'sale',
      minPrice: requirement.minPrice || '',
      maxPrice: requirement.maxPrice || '',
      minBedrooms: requirement.minBedrooms || '',
      minBathrooms: requirement.minBathrooms || '',
      preferredArea: requirement.preferredArea || '',
      additionalRequirements: requirement.additionalRequirements || '',
      budget: requirement.budget || '',
      timeline: requirement.timeline || '',
      notes: requirement.notes || '',
    });
    setShowForm(true);
  };

  const handleCancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData(emptyForm);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this buyer requirement?')) {
      try {
        await fetchWithRefresh(`/api/buyer-requirements/${id}`, {
          method: 'DELETE',
        });
        fetchBuyerRequirements();
      } catch (error) {
        console.error('Error deleting buyer requirement:', error);
        setError('Failed to delete buyer requirement');
      }
    }
  };

  const filteredRequirements = buyerRequirements.filter(requirement => {
    const matchesSearch = requirement.buyerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         requirement.preferredLocation.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         requirement.additionalRequirements.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesFilter = filterType === 'all' || requirement.propertyType === filterType;
    
    return matchesSearch && matchesFilter;
  });

  return (
    <div>
      <div className='max-w-7xl mx-auto px-4 py-8'>
        {/* Header */}
        <div className='mb-8'>
          <h1 className='text-3xl font-bold text-gray-900 mb-2'>Buyer Requirements</h1>
          <p className='text-gray-600'>Manage and track buyer requirements to match with your properties</p>
        </div>

        {/* Controls */}
        <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6'>
          <div className='flex flex-col lg:flex-row gap-4 items-center justify-between'>
            <div className='flex flex-col sm:flex-row gap-4 flex-1'>
              {/* Search */}
              <div className='relative flex-1 max-w-md'>
                <FaSearch className='absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400' />
                <input
                  type='text'
                  placeholder='Search buyers or requirements...'
                  className='w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              {/* Filter */}
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className='px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
              >
                <option value='all'>All Types</option>
                <option value='sale'>For Sale</option>
                <option value='rent'>For Rent</option>
              </select>
            </div>

            {/* Add Button */}
            <button
              onClick={() => setShowForm(true)}
              className='bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors flex items-center gap-2'
            >
              <FaPlus className='w-4 h-4' />
              Add Buyer Requirement
            </button>
          </div>
        </div>

        {/* Add Buyer Requirement Form */}
        {showForm && (
          <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6'>
            <h2 className='text-xl font-semibold text-gray-900 mb-4'>Add New Buyer Requirement</h2>
            <form onSubmit={handleSubmit} className='space-y-6'>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                {/* Buyer Information */}
                <div className='space-y-4'>
                  <h3 className='text-lg font-medium text-gray-900 flex items-center gap-2'>
                    <FaUser className='w-5 h-5 text-blue-600' />
                    Buyer Information
                  </h3>
                  
                  <div>
                    <label className='block text-sm font-medium text-gray-700 mb-1'>Buyer Name *</label>
                    <input
                      type='text'
                      required
                      className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                      value={formData.buyerName}
                      onChange={(e) => setFormData({...formData, buyerName: e.target.value})}
                    />
                  </div>

                  <div>
                    <label className='block text-sm font-medium text-gray-700 mb-1'>Email</label>
                    <input
                      type='email'
                      className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                      value={formData.buyerEmail}
                      onChange={(e) => setFormData({...formData, buyerEmail: e.target.value})}
                    />
                  </div>

                  <div>
                    <label className='block text-sm font-medium text-gray-700 mb-1'>Phone *</label>
                    <input
                      type='tel'
                      required
                      className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                      value={formData.buyerPhone}
                      onChange={(e) => setFormData({...formData, buyerPhone: e.target.value})}
                    />
                  </div>
                </div>

                {/* Property Requirements */}
                <div className='space-y-4'>
                  <h3 className='text-lg font-medium text-gray-900 flex items-center gap-2'>
                    <FaHome className='w-5 h-5 text-green-600' />
                    Property Requirements
                  </h3>

                  <div>
                    <label className='block text-sm font-medium text-gray-700 mb-1'>Property Type *</label>
                    <select
                      required
                      className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                      value={formData.propertyType}
                      onChange={(e) => setFormData({...formData, propertyType: e.target.value})}
                    >
                      <option value='sale'>For Sale</option>
                      <option value='rent'>For Rent</option>
                    </select>
                  </div>

                  <div>
                    <label className='block text-sm font-medium text-gray-700 mb-1'>Preferred Location</label>
                    <input
                      type='text'
                      className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                      value={formData.preferredLocation}
                      onChange={(e) => setFormData({...formData, preferredLocation: e.target.value})}
                    />
                  </div>

                  <div className='grid grid-cols-2 gap-4'>
                    <div>
                      <label className='block text-sm font-medium text-gray-700 mb-1'>Min Price</label>
                      <input
                        type='number'
                        className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                        value={formData.minPrice}
                        onChange={(e) => setFormData({...formData, minPrice: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className='block text-sm font-medium text-gray-700 mb-1'>Max Price</label>
                      <input
                        type='number'
                        className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                        value={formData.maxPrice}
                        onChange={(e) => setFormData({...formData, maxPrice: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className='grid grid-cols-2 gap-4'>
                    <div>
                      <label className='block text-sm font-medium text-gray-700 mb-1'>Min Bedrooms</label>
                      <input
                        type='number'
                        min='1'
                        className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                        value={formData.minBedrooms}
                        onChange={(e) => setFormData({...formData, minBedrooms: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className='block text-sm font-medium text-gray-700 mb-1'>Min Bathrooms</label>
                      <input
                        type='number'
                        min='1'
                        className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                        value={formData.minBathrooms}
                        onChange={(e) => setFormData({...formData, minBathrooms: e.target.value})}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Additional Information */}
              <div className='space-y-4'>
                <h3 className='text-lg font-medium text-gray-900 flex items-center gap-2'>
                  <FaCalendarAlt className='w-5 h-5 text-purple-600' />
                  Additional Information
                </h3>

                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-1'>Budget Range</label>
                  <input
                    type='text'
                    placeholder='e.g., $300,000 - $500,000'
                    className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                    value={formData.budget}
                    onChange={(e) => setFormData({...formData, budget: e.target.value})}
                  />
                </div>

                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-1'>Timeline</label>
                  <input
                    type='text'
                    placeholder='e.g., Within 3 months, ASAP'
                    className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                    value={formData.timeline}
                    onChange={(e) => setFormData({...formData, timeline: e.target.value})}
                  />
                </div>

                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-1'>Additional Requirements</label>
                  <textarea
                    rows='3'
                    placeholder='Any specific features, amenities, or preferences...'
                    className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                    value={formData.additionalRequirements}
                    onChange={(e) => setFormData({...formData, additionalRequirements: e.target.value})}
                  />
                </div>

                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-1'>Notes</label>
                  <textarea
                    rows='2'
                    placeholder='Internal notes about this buyer...'
                    className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                    value={formData.notes}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  />
                </div>
              </div>

              {/* Form Actions */}
              <div className='flex justify-end gap-3 pt-4 border-t border-gray-200'>
                <button
                  type='button'
                  onClick={() => setShowForm(false)}
                  className='px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors'
                >
                  Cancel
                </button>
                <button
                  type='submit'
                  disabled={loading}
                  className='px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors flex items-center gap-2'
                >
                  {loading ? 'Adding...' : 'Add Buyer Requirement'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Buyer Requirements List */}
        <div className='space-y-4'>
          {loading && (
            <div className='text-center py-8'>
              <div className='inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600'></div>
              <p className='mt-2 text-gray-600'>Loading buyer requirements...</p>
            </div>
          )}

          {error && (
            <div className='bg-red-50 border border-red-200 rounded-lg p-4'>
              <p className='text-red-600'>{error}</p>
            </div>
          )}

          {!loading && !error && filteredRequirements.length === 0 && (
            <div className='text-center py-12'>
              <FaUser className='w-16 h-16 text-gray-300 mx-auto mb-4' />
              <h3 className='text-lg font-medium text-gray-900 mb-2'>No buyer requirements found</h3>
              <p className='text-gray-600 mb-4'>Start by adding your first buyer requirement</p>
              <button
                onClick={() => setShowForm(true)}
                className='bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors'
              >
                Add Buyer Requirement
              </button>
            </div>
          )}

          {!loading && !error && filteredRequirements.map((requirement) => (
            <div key={requirement._id} className='bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow'>
              <div className='flex items-start justify-between'>
                <div className='flex-1'>
                  <div className='flex items-center gap-3 mb-3'>
                    <div className='w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center'>
                      <FaUser className='w-6 h-6 text-blue-600' />
                    </div>
                    <div>
                      <h3 className='text-lg font-semibold text-gray-900'>{requirement.buyerName}</h3>
                      <div className='flex items-center gap-4 text-sm text-gray-600'>
                        <span className='flex items-center gap-1'>
                          <FaEnvelope className='w-4 h-4' />
                          {requirement.buyerEmail}
                        </span>
                        <span className='flex items-center gap-1'>
                          <FaPhone className='w-4 h-4' />
                          {requirement.buyerPhone}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4'>
                    <div className='flex items-center gap-2 text-sm'>
                      <FaMapMarkerAlt className='w-4 h-4 text-gray-400' />
                      <span className='text-gray-600'>Location:</span>
                      <span className='font-medium'>{requirement.preferredLocation}</span>
                    </div>
                    <div className='flex items-center gap-2 text-sm'>
                      <FaHome className='w-4 h-4 text-gray-400' />
                      <span className='text-gray-600'>Type:</span>
                      <span className='font-medium capitalize'>{requirement.propertyType}</span>
                    </div>
                    <div className='flex items-center gap-2 text-sm'>
                      <FaDollarSign className='w-4 h-4 text-gray-400' />
                      <span className='text-gray-600'>Budget:</span>
                      <span className='font-medium'>{requirement.budget || 'Not specified'}</span>
                    </div>
                    <div className='flex items-center gap-2 text-sm'>
                      <FaBed className='w-4 h-4 text-gray-400' />
                      <span className='text-gray-600'>Bedrooms:</span>
                      <span className='font-medium'>{requirement.minBedrooms || 'Any'}</span>
                    </div>
                    <div className='flex items-center gap-2 text-sm'>
                      <FaBath className='w-4 h-4 text-gray-400' />
                      <span className='text-gray-600'>Bathrooms:</span>
                      <span className='font-medium'>{requirement.minBathrooms || 'Any'}</span>
                    </div>
                    <div className='flex items-center gap-2 text-sm'>
                      <FaCalendarAlt className='w-4 h-4 text-gray-400' />
                      <span className='text-gray-600'>Timeline:</span>
                      <span className='font-medium'>{requirement.timeline || 'Not specified'}</span>
                    </div>
                  </div>

                  {requirement.additionalRequirements && (
                    <div className='mb-3'>
                      <p className='text-sm text-gray-600 mb-1'>Additional Requirements:</p>
                      <p className='text-sm text-gray-800 bg-gray-50 p-3 rounded-lg'>{requirement.additionalRequirements}</p>
                    </div>
                  )}

                  {requirement.notes && (
                    <div className='mb-3'>
                      <p className='text-sm text-gray-600 mb-1'>Notes:</p>
                      <p className='text-sm text-gray-800 bg-blue-50 p-3 rounded-lg'>{requirement.notes}</p>
                    </div>
                  )}
                </div>

                <div className='flex items-center gap-2 ml-4'>
                  <button
                    onClick={() => {/* Handle view matches */}}
                    className='p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors'
                    title='View matching properties'
                  >
                    <FaEye className='w-4 h-4' />
                  </button>
                  <button
                    onClick={() => {/* Handle edit */}}
                    className='p-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors'
                    title='Edit requirement'
                  >
                    <FaEdit className='w-4 h-4' />
                  </button>
                  <button
                    onClick={() => handleDelete(requirement._id)}
                    className='p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors'
                    title='Delete requirement'
                  >
                    <FaTrash className='w-4 h-4' />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import ConfirmDialog from '../components/ConfirmDialog';
import { useSelector } from 'react-redux';
import {
  HiPlus, HiSearch, HiUser, HiPhone, HiMail, HiLocationMarker,
  HiHome, HiCurrencyDollar, HiCalendar, HiPencil, HiTrash, HiEye,
} from 'react-icons/hi';
import { parseJsonSafely, fetchWithRefresh } from '../utils/http';
import { useBuyerView } from '../contexts/BuyerViewContext';

export default function BuyerRequirements() {
  const [buyerRequirements, setBuyerRequirements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const { currentUser } = useSelector((state) => state.user);
  const { isBuyerViewMode } = useBuyerView();

  const [editingId, setEditingId] = useState(null);
  const [viewingRequirement, setViewingRequirement] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

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

  const handleView = (requirement) => {
    setViewingRequirement(requirement);
    setEditingId(null);
    setShowForm(false);
  };

  const handleDelete = async (id) => {
    try {
      await fetchWithRefresh(`/api/buyer-requirements/${id}`, {
        method: 'DELETE',
      });
      fetchBuyerRequirements();
    } catch (error) {
      console.error('Error deleting buyer requirement:', error);
      setError('Failed to delete buyer requirement');
    }
  };

  const filteredRequirements = buyerRequirements.filter(requirement => {
    const q = (searchTerm || '').toLowerCase();
    const matchesSearch = (requirement?.buyerName || '').toLowerCase().includes(q) ||
                         (requirement?.preferredLocation || '').toLowerCase().includes(q) ||
                         (requirement?.additionalRequirements || '').toLowerCase().includes(q);
    
    const matchesFilter = filterType === 'all' || requirement.propertyType === filterType;
    
    return matchesSearch && matchesFilter;
  });

  return (
    <div className='space-y-6'>
      <div>
        {/* Header */}
          <div className='flex flex-col md:flex-row md:items-center md:justify-between gap-4'>
            <div>
              <h1 className='text-xl font-bold text-slate-900'>Buyer Requirements</h1>
              <p className='text-slate-500 mt-0.5'>Manage and track buyer requirements</p>
            </div>

            {!isBuyerViewMode && (
              <button
                onClick={() => {
                  setViewingRequirement(null);
                  setShowForm(true);
                }}
                className='inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors'
              >
                <HiPlus className='w-4 h-4' />
                Add Requirement
              </button>
            )}
          </div>

        {/* Controls */}
        <div className='bg-white rounded-xl border border-slate-200 p-4 mb-6'>
          <div className='flex flex-col lg:flex-row gap-4 items-center justify-between'>
            <div className='flex flex-col sm:flex-row gap-3 flex-1 w-full'>
              {/* Search */}
              <div className='relative flex-1 max-w-xl w-full'>
                <HiSearch className='absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400' />
                <input
                  type='text'
                  placeholder='Search buyers or requirements...'
                  className='w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400 bg-white'
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              {/* Filter */}
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className='px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400 bg-white'
              >
                <option value='all'>All Types</option>
                <option value='sale'>For Sale</option>
                <option value='rent'>For Rent</option>
              </select>
            </div>
          </div>
        </div>

        {viewingRequirement && (
          <div className='fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-4 z-50'>
            <div className='bg-white rounded-2xl shadow-xl border border-slate-200 p-6 w-full max-w-2xl'>
              <div className='flex items-start justify-between gap-4 mb-4'>
                <div>
                  <h2 className='text-xl font-semibold text-slate-900'>Buyer Requirement</h2>
                  <p className='text-slate-600 text-sm'>Details</p>
                </div>
                <button
                  onClick={() => setViewingRequirement(null)}
                  className='px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700'
                >
                  Close
                </button>
              </div>

              <div className='grid grid-cols-1 md:grid-cols-2 gap-4 text-sm'>
                <div>
                  <div className='text-slate-500'>Name</div>
                  <div className='font-medium text-slate-900'>{viewingRequirement.buyerName || '-'}</div>
                </div>
                <div>
                  <div className='text-slate-500'>Phone</div>
                  <div className='font-medium text-slate-900'>{viewingRequirement.buyerPhone || '-'}</div>
                </div>
                <div>
                  <div className='text-slate-500'>Email</div>
                  <div className='font-medium text-slate-900'>{viewingRequirement.buyerEmail || '-'}</div>
                </div>
                <div>
                  <div className='text-slate-500'>Location</div>
                  <div className='font-medium text-slate-900'>{viewingRequirement.preferredLocation || '-'}</div>
                </div>
                <div>
                  <div className='text-slate-500'>Type</div>
                  <div className='font-medium text-slate-900'>{viewingRequirement.propertyType || '-'}</div>
                </div>
                <div>
                  <div className='text-slate-500'>Budget</div>
                  <div className='font-medium text-slate-900'>{viewingRequirement.budget || '-'}</div>
                </div>
              </div>

              {(viewingRequirement.additionalRequirements || viewingRequirement.notes) && (
                <div className='mt-4 space-y-3'>
                  {viewingRequirement.additionalRequirements && (
                    <div>
                      <div className='text-slate-500 text-sm mb-1'>Additional Requirements</div>
                      <div className='bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800 text-sm'>
                        {viewingRequirement.additionalRequirements}
                      </div>
                    </div>
                  )}
                  {viewingRequirement.notes && (
                    <div>
                      <div className='text-slate-500 text-sm mb-1'>Notes</div>
                      <div className='bg-blue-50 border border-blue-200 rounded-lg p-3 text-slate-800 text-sm'>
                        {viewingRequirement.notes}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!isBuyerViewMode && (
                <div className='flex justify-end gap-3 mt-6'>
                  <button
                    onClick={() => {
                      const req = viewingRequirement;
                      setViewingRequirement(null);
                      handleEdit(req);
                    }}
                    className='inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium'
                  >
                    <HiPencil className='w-4 h-4' />
                    Edit
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Add Buyer Requirement Form */}
        {showForm && (
          <div className='fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-4 z-50'>
            <div className='bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-5xl overflow-hidden'>
              <div className='px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4'>
                <div>
                  <h2 className='text-xl font-semibold text-slate-900'>
                    {editingId ? 'Edit Buyer Requirement' : 'Add Buyer Requirement'}
                  </h2>
                  <p className='text-sm text-slate-600 mt-0.5'>Capture the buyer profile and preferences.</p>
                </div>
                <button
                  type='button'
                  onClick={handleCancelForm}
                  className='px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700'
                >
                  Close
                </button>
              </div>

              <form onSubmit={handleSubmit} className='space-y-6 p-6 max-h-[75vh] overflow-auto'>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                {/* Buyer Information */}
                <div className='space-y-4'>
                  <h3 className='text-base font-semibold text-slate-900 flex items-center gap-2'>
                    <HiUser className='w-5 h-5 text-slate-900' />
                    Buyer Information
                  </h3>
                  
                  <div>
                    <label htmlFor='buyerName' className='block text-sm font-medium text-slate-700 mb-1'>Buyer Name *</label>
                    <input
                      id='buyerName'
                      type='text'
                      required
                      className='w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400'
                      value={formData.buyerName}
                      onChange={(e) => setFormData({...formData, buyerName: e.target.value})}
                    />
                  </div>

                  <div>
                    <label htmlFor='buyerEmail' className='block text-sm font-medium text-slate-700 mb-1'>Email</label>
                    <input
                      id='buyerEmail'
                      type='email'
                      className='w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400'
                      value={formData.buyerEmail}
                      onChange={(e) => setFormData({...formData, buyerEmail: e.target.value})}
                    />
                  </div>

                  <div>
                    <label htmlFor='buyerPhone' className='block text-sm font-medium text-slate-700 mb-1'>Phone *</label>
                    <input
                      id='buyerPhone'
                      type='tel'
                      required
                      className='w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400'
                      value={formData.buyerPhone}
                      onChange={(e) => setFormData({...formData, buyerPhone: e.target.value})}
                    />
                  </div>
                </div>

                {/* Property Requirements */}
                <div className='space-y-4'>
                  <h3 className='text-base font-semibold text-slate-900 flex items-center gap-2'>
                    <HiHome className='w-5 h-5 text-slate-900' />
                    Property Requirements
                  </h3>

                  <div>
                    <label className='block text-sm font-medium text-slate-700 mb-1'>Property Type *</label>
                    <select
                      required
                      className='w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400 bg-white'
                      value={formData.propertyType}
                      onChange={(e) => setFormData({...formData, propertyType: e.target.value})}
                    >
                      <option value='sale'>For Sale</option>
                      <option value='rent'>For Rent</option>
                    </select>
                  </div>

                  <div>
                    <label className='block text-sm font-medium text-slate-700 mb-1'>Preferred Location</label>
                    <input
                      type='text'
                      className='w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400'
                      value={formData.preferredLocation}
                      onChange={(e) => setFormData({...formData, preferredLocation: e.target.value})}
                    />
                  </div>

                  <div className='grid grid-cols-2 gap-4'>
                    <div>
                      <label className='block text-sm font-medium text-slate-700 mb-1'>Min Price</label>
                      <input
                        type='number'
                        className='w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400'
                        value={formData.minPrice}
                        onChange={(e) => setFormData({...formData, minPrice: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className='block text-sm font-medium text-slate-700 mb-1'>Max Price</label>
                      <input
                        type='number'
                        className='w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400'
                        value={formData.maxPrice}
                        onChange={(e) => setFormData({...formData, maxPrice: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className='grid grid-cols-2 gap-4'>
                    <div>
                      <label className='block text-sm font-medium text-slate-700 mb-1'>Min Bedrooms</label>
                      <input
                        type='number'
                        min='1'
                        className='w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400'
                        value={formData.minBedrooms}
                        onChange={(e) => setFormData({...formData, minBedrooms: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className='block text-sm font-medium text-slate-700 mb-1'>Min Bathrooms</label>
                      <input
                        type='number'
                        min='1'
                        className='w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400'
                        value={formData.minBathrooms}
                        onChange={(e) => setFormData({...formData, minBathrooms: e.target.value})}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Additional Information */}
              <div className='space-y-4'>
                <h3 className='text-base font-semibold text-slate-900 flex items-center gap-2'>
                  <HiCalendar className='w-5 h-5 text-slate-900' />
                  Additional Information
                </h3>

                <div>
                  <label className='block text-sm font-medium text-slate-700 mb-1'>Budget Range</label>
                  <input
                    type='text'
                    placeholder='e.g., $300,000 - $500,000'
                    className='w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400'
                    value={formData.budget}
                    onChange={(e) => setFormData({...formData, budget: e.target.value})}
                  />
                </div>

                <div>
                  <label className='block text-sm font-medium text-slate-700 mb-1'>Timeline</label>
                  <input
                    type='text'
                    placeholder='e.g., Within 3 months, ASAP'
                    className='w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400'
                    value={formData.timeline}
                    onChange={(e) => setFormData({...formData, timeline: e.target.value})}
                  />
                </div>

                <div>
                  <label className='block text-sm font-medium text-slate-700 mb-1'>Additional Requirements</label>
                  <textarea
                    rows='3'
                    placeholder='Any specific features, amenities, or preferences...'
                    className='w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400'
                    value={formData.additionalRequirements}
                    onChange={(e) => setFormData({...formData, additionalRequirements: e.target.value})}
                  />
                </div>

                <div>
                  <label className='block text-sm font-medium text-slate-700 mb-1'>Notes</label>
                  <textarea
                    rows='2'
                    placeholder='Internal notes about this buyer...'
                    className='w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400'
                    value={formData.notes}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  />
                </div>
              </div>

              {/* Form Actions */}
              <div className='flex justify-end gap-3 pt-4 border-t border-slate-200'>
                <button
                  type='button'
                  onClick={handleCancelForm}
                  className='px-4 py-2 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl font-semibold transition-colors'
                >
                  Cancel
                </button>
                <button
                  type='submit'
                  disabled={loading}
                  className='px-6 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white rounded-xl font-semibold transition-colors flex items-center gap-2'
                >
                  {loading
                    ? (editingId ? 'Saving...' : 'Creating...')
                    : (editingId ? 'Save Changes' : 'Create Requirement')}
                </button>
              </div>
              </form>
            </div>
          </div>
        )}

        {/* Buyer Requirements List */}
        <div className='space-y-4'>
          {loading && (
            <div className='text-center py-8'>
              <div className='inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900'></div>
              <p className='mt-2 text-slate-500'>Loading buyer requirements...</p>
            </div>
          )}

          {error && (
            <div className='bg-red-50 border border-red-200 rounded-lg p-4'>
              <p className='text-red-600'>{error}</p>
            </div>
          )}

          {!loading && !error && filteredRequirements.length === 0 && (
            <div className='text-center py-12'>
              <HiUser className='w-14 h-14 text-slate-300 mx-auto mb-4' />
              <h3 className='text-lg font-semibold text-slate-900 mb-2'>No buyer requirements found</h3>
              <p className='text-slate-500 mb-4'>Start by adding your first buyer requirement</p>
              <button
                onClick={() => setShowForm(true)}
                className='bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors'
              >
                Add Buyer Requirement
              </button>
            </div>
          )}

          {!loading && !error && filteredRequirements.map((requirement) => (
            <div key={requirement._id} className='bg-white rounded-2xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow'>
              <div className='flex items-start justify-between'>
                <div className='flex-1'>
                  <div className='flex items-center gap-3 mb-3'>
                    <div className='w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center shadow-sm'>
                      <HiUser className='w-6 h-6 text-white' />
                    </div>
                    <div>
                      <div className='flex items-center gap-2 flex-wrap'>
                        <h3 className='text-lg font-semibold text-slate-900'>{requirement.buyerName}</h3>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                          requirement.propertyType === 'rent'
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                          {requirement.propertyType === 'rent' ? 'Rent' : 'Sale'}
                        </span>
                      </div>
                      <div className='flex items-center gap-4 text-sm text-slate-600 mt-1'>
                        {requirement.buyerEmail && (
                          <span className='flex items-center gap-1'>
                            <HiMail className='w-4 h-4' />
                            {requirement.buyerEmail}
                          </span>
                        )}
                        {requirement.buyerPhone && (
                          <span className='flex items-center gap-1'>
                            <HiPhone className='w-4 h-4' />
                            {requirement.buyerPhone}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4'>
                    <div className='flex items-center gap-2 text-sm'>
                      <HiLocationMarker className='w-4 h-4 text-slate-400' />
                      <span className='text-slate-600'>Location:</span>
                      <span className='font-medium'>{requirement.preferredLocation}</span>
                    </div>
                    <div className='flex items-center gap-2 text-sm'>
                      <HiHome className='w-4 h-4 text-slate-400' />
                      <span className='text-slate-600'>Type:</span>
                      <span className='font-medium capitalize'>{requirement.propertyType}</span>
                    </div>
                    <div className='flex items-center gap-2 text-sm'>
                      <HiCurrencyDollar className='w-4 h-4 text-slate-400' />
                      <span className='text-slate-600'>Budget:</span>
                      <span className='font-medium'>{requirement.budget || 'Not specified'}</span>
                    </div>
                    <div className='flex items-center gap-2 text-sm'>
                      <span className='text-slate-600'>Bedrooms:</span>
                      <span className='font-medium'>{requirement.minBedrooms || 'Any'}</span>
                    </div>
                    <div className='flex items-center gap-2 text-sm'>
                      <span className='text-slate-600'>Bathrooms:</span>
                      <span className='font-medium'>{requirement.minBathrooms || 'Any'}</span>
                    </div>
                    <div className='flex items-center gap-2 text-sm'>
                      <HiCalendar className='w-4 h-4 text-slate-400' />
                      <span className='text-slate-600'>Timeline:</span>
                      <span className='font-medium'>{requirement.timeline || 'Not specified'}</span>
                    </div>
                  </div>

                  {requirement.additionalRequirements && (
                    <div className='mb-3'>
                      <p className='text-sm text-slate-600 mb-1'>Additional Requirements:</p>
                      <p className='text-sm text-slate-800 bg-slate-50 p-3 rounded-lg'>{requirement.additionalRequirements}</p>
                    </div>
                  )}

                  {requirement.notes && (
                    <div className='mb-3'>
                      <p className='text-sm text-slate-600 mb-1'>Notes:</p>
                      <p className='text-sm text-slate-800 bg-blue-50 p-3 rounded-lg'>{requirement.notes}</p>
                    </div>
                  )}
                </div>

                <div className='flex items-center gap-2 ml-4'>
                  <button
                    onClick={() => handleView(requirement)}
                    className='p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200'
                    title='View requirement'
                  >
                    <HiEye className='w-4 h-4' />
                  </button>
                  {!isBuyerViewMode && (
                    <>
                      <button
                        onClick={() => handleEdit(requirement)}
                        className='p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200'
                        title='Edit requirement'
                      >
                        <HiPencil className='w-4 h-4' />
                      </button>
                      <button
                        onClick={() => setPendingDelete(requirement._id)}
                        className='p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-rose-200'
                        title='Delete requirement'
                      >
                        <HiTrash className='w-4 h-4' />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <ConfirmDialog
        open={!!pendingDelete}
        title='Delete buyer requirement?'
        description='This cannot be undone.'
        confirmLabel='Delete'
        onConfirm={() => { handleDelete(pendingDelete); setPendingDelete(null); }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

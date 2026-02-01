import { useState, useEffect } from 'react';
import { apiClient } from '../utils/http';
import { useNotification } from '../contexts/NotificationContext';
import LoadingSpinner from '../components/LoadingSpinner';

export default function PropertyTypeManagement() {
  const [propertyTypes, setPropertyTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingType, setEditingType] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    icon: '🏠',
    category: 'residential',
    fields: [],
  });
  const { showSuccess, showError } = useNotification();

  useEffect(() => {
    fetchPropertyTypes();
  }, []);

  const fetchPropertyTypes = async () => {
    try {
      setLoading(true);
      const data = await apiClient.get('/property-types/list?includeInactive=true');
      setPropertyTypes(data.data || []);
    } catch (error) {
      showError('Failed to load property types');
    } finally {
      setLoading(false);
    }
  };

  const handleSeedDefaults = async () => {
    try {
      await apiClient.post('/property-types/seed');
      showSuccess('Default property types seeded successfully');
      fetchPropertyTypes();
    } catch (error) {
      showError('Failed to seed default property types');
    }
  };

  const handleCreateType = async () => {
    try {
      await apiClient.post('/property-types/create', formData);
      showSuccess('Property type created successfully');
      setShowCreateModal(false);
      setFormData({
        name: '',
        description: '',
        icon: '🏠',
        category: 'residential',
        fields: [],
      });
      fetchPropertyTypes();
    } catch (error) {
      showError(error.message || 'Failed to create property type');
    }
  };

  const handleUpdateType = async (id, updates) => {
    try {
      await apiClient.put(`/property-types/${id}`, updates);
      showSuccess('Property type updated successfully');
      fetchPropertyTypes();
    } catch (error) {
      showError('Failed to update property type');
    }
  };

  const handleDeleteType = async (id) => {
    if (!confirm('Are you sure you want to delete this property type?')) return;
    
    try {
      await apiClient.delete(`/property-types/${id}`);
      showSuccess('Property type deleted successfully');
      fetchPropertyTypes();
    } catch (error) {
      showError(error.message || 'Failed to delete property type');
    }
  };

  const addField = (typeId) => {
    const newField = {
      key: '',
      label: '',
      type: 'text',
      required: false,
      order: 0,
      group: 'general',
    };
    
    const type = propertyTypes.find(t => t._id === typeId);
    if (type) {
      const updatedFields = [...(type.fields || []), newField];
      handleUpdateType(typeId, { fields: updatedFields });
    }
  };

  const updateField = (typeId, fieldIndex, updates) => {
    const type = propertyTypes.find(t => t._id === typeId);
    if (type) {
      const updatedFields = [...type.fields];
      updatedFields[fieldIndex] = { ...updatedFields[fieldIndex], ...updates };
      handleUpdateType(typeId, { fields: updatedFields });
    }
  };

  const removeField = (typeId, fieldIndex) => {
    const type = propertyTypes.find(t => t._id === typeId);
    if (type) {
      const updatedFields = type.fields.filter((_, idx) => idx !== fieldIndex);
      handleUpdateType(typeId, { fields: updatedFields });
    }
  };

  if (loading) {
    return (
      <div className='flex justify-center items-center min-h-screen'>
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className='max-w-7xl mx-auto p-6'>
      <div className='mb-8'>
        <div className='flex justify-between items-center mb-4'>
          <div>
            <h1 className='text-3xl font-bold text-gray-900'>Property Type Management</h1>
            <p className='text-gray-600 mt-2'>Configure property types and their custom fields</p>
          </div>
          <div className='flex gap-3'>
            <button
              onClick={handleSeedDefaults}
              className='px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors'
            >
              Seed Defaults
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className='px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors'
            >
              + Create New Type
            </button>
          </div>
        </div>
      </div>

      <div className='grid gap-6'>
        {propertyTypes.map((type) => (
          <div key={type._id} className='bg-white rounded-lg shadow-md border border-gray-200 p-6'>
            <div className='flex justify-between items-start mb-4'>
              <div className='flex items-center gap-3'>
                <span className='text-4xl'>{type.icon}</span>
                <div>
                  <h3 className='text-xl font-semibold text-gray-900'>{type.name}</h3>
                  <p className='text-sm text-gray-600'>{type.description}</p>
                  <div className='flex gap-2 mt-1'>
                    <span className='text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded'>
                      {type.category}
                    </span>
                    {type.isSystem && (
                      <span className='text-xs px-2 py-1 bg-gray-100 text-gray-800 rounded'>
                        System
                      </span>
                    )}
                    <span className={`text-xs px-2 py-1 rounded ${type.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {type.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              </div>
              <div className='flex gap-2'>
                <button
                  onClick={() => handleUpdateType(type._id, { isActive: !type.isActive })}
                  className='px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50'
                >
                  {type.isActive ? 'Deactivate' : 'Activate'}
                </button>
                {!type.isSystem && (
                  <button
                    onClick={() => handleDeleteType(type._id)}
                    className='px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700'
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>

            <div className='mt-4'>
              <div className='flex justify-between items-center mb-3'>
                <h4 className='font-semibold text-gray-900'>Fields ({type.fields?.length || 0})</h4>
                <button
                  onClick={() => addField(type._id)}
                  className='text-sm px-3 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100'
                >
                  + Add Field
                </button>
              </div>
              
              {type.fields && type.fields.length > 0 ? (
                <div className='space-y-3'>
                  {type.fields.map((field, idx) => (
                    <div key={idx} className='bg-gray-50 p-4 rounded-lg border border-gray-200'>
                      <div className='grid grid-cols-4 gap-3'>
                        <div>
                          <label className='text-xs text-gray-600'>Key</label>
                          <input
                            type='text'
                            value={field.key}
                            onChange={(e) => updateField(type._id, idx, { key: e.target.value })}
                            className='w-full text-sm border border-gray-300 rounded px-2 py-1'
                            placeholder='e.g., bedrooms'
                          />
                        </div>
                        <div>
                          <label className='text-xs text-gray-600'>Label</label>
                          <input
                            type='text'
                            value={field.label}
                            onChange={(e) => updateField(type._id, idx, { label: e.target.value })}
                            className='w-full text-sm border border-gray-300 rounded px-2 py-1'
                            placeholder='e.g., Bedrooms'
                          />
                        </div>
                        <div>
                          <label className='text-xs text-gray-600'>Type</label>
                          <select
                            value={field.type}
                            onChange={(e) => updateField(type._id, idx, { type: e.target.value })}
                            className='w-full text-sm border border-gray-300 rounded px-2 py-1'
                          >
                            <option value='text'>Text</option>
                            <option value='textarea'>Textarea</option>
                            <option value='number'>Number</option>
                            <option value='select'>Select</option>
                            <option value='boolean'>Boolean</option>
                            <option value='date'>Date</option>
                          </select>
                        </div>
                        <div>
                          <label className='text-xs text-gray-600'>Group</label>
                          <input
                            type='text'
                            value={field.group}
                            onChange={(e) => updateField(type._id, idx, { group: e.target.value })}
                            className='w-full text-sm border border-gray-300 rounded px-2 py-1'
                            placeholder='e.g., rooms'
                          />
                        </div>
                      </div>
                      
                      <div className='grid grid-cols-5 gap-3 mt-3'>
                        <div>
                          <label className='flex items-center text-xs text-gray-600'>
                            <input
                              type='checkbox'
                              checked={field.required}
                              onChange={(e) => updateField(type._id, idx, { required: e.target.checked })}
                              className='mr-1'
                            />
                            Required
                          </label>
                        </div>
                        <div>
                          <label className='text-xs text-gray-600'>Min</label>
                          <input
                            type='number'
                            value={field.min || ''}
                            onChange={(e) => updateField(type._id, idx, { min: e.target.value ? Number(e.target.value) : null })}
                            className='w-full text-sm border border-gray-300 rounded px-2 py-1'
                          />
                        </div>
                        <div>
                          <label className='text-xs text-gray-600'>Max</label>
                          <input
                            type='number'
                            value={field.max || ''}
                            onChange={(e) => updateField(type._id, idx, { max: e.target.value ? Number(e.target.value) : null })}
                            className='w-full text-sm border border-gray-300 rounded px-2 py-1'
                          />
                        </div>
                        <div>
                          <label className='text-xs text-gray-600'>Unit</label>
                          <input
                            type='text'
                            value={field.unit || ''}
                            onChange={(e) => updateField(type._id, idx, { unit: e.target.value })}
                            className='w-full text-sm border border-gray-300 rounded px-2 py-1'
                            placeholder='e.g., sq.ft'
                          />
                        </div>
                        <div>
                          <label className='text-xs text-gray-600'>Order</label>
                          <input
                            type='number'
                            value={field.order || 0}
                            onChange={(e) => updateField(type._id, idx, { order: Number(e.target.value) })}
                            className='w-full text-sm border border-gray-300 rounded px-2 py-1'
                          />
                        </div>
                      </div>

                      {field.type === 'select' && (
                        <div className='mt-3'>
                          <label className='text-xs text-gray-600'>Options (comma-separated)</label>
                          <input
                            type='text'
                            value={field.options?.join(', ') || ''}
                            onChange={(e) => updateField(type._id, idx, { 
                              options: e.target.value.split(',').map(o => o.trim()).filter(Boolean) 
                            })}
                            className='w-full text-sm border border-gray-300 rounded px-2 py-1'
                            placeholder='e.g., North, South, East, West'
                          />
                        </div>
                      )}

                      <div className='mt-3 flex justify-end'>
                        <button
                          onClick={() => removeField(type._id, idx)}
                          className='text-xs px-3 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100'
                        >
                          Remove Field
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className='text-sm text-gray-500 italic'>No fields configured</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {showCreateModal && (
        <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
          <div className='bg-white rounded-lg p-6 max-w-md w-full'>
            <h3 className='text-xl font-semibold mb-4'>Create New Property Type</h3>
            <div className='space-y-4'>
              <div>
                <label className='block text-sm font-medium text-gray-700 mb-1'>Name</label>
                <input
                  type='text'
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className='w-full border border-gray-300 rounded px-3 py-2'
                  placeholder='e.g., Warehouse'
                />
              </div>
              <div>
                <label className='block text-sm font-medium text-gray-700 mb-1'>Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className='w-full border border-gray-300 rounded px-3 py-2'
                  rows={3}
                />
              </div>
              <div>
                <label className='block text-sm font-medium text-gray-700 mb-1'>Icon (Emoji)</label>
                <input
                  type='text'
                  value={formData.icon}
                  onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                  className='w-full border border-gray-300 rounded px-3 py-2'
                  placeholder='🏠'
                />
              </div>
              <div>
                <label className='block text-sm font-medium text-gray-700 mb-1'>Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className='w-full border border-gray-300 rounded px-3 py-2'
                >
                  <option value='residential'>Residential</option>
                  <option value='commercial'>Commercial</option>
                  <option value='land'>Land</option>
                  <option value='industrial'>Industrial</option>
                  <option value='other'>Other</option>
                </select>
              </div>
            </div>
            <div className='flex gap-3 mt-6'>
              <button
                onClick={() => setShowCreateModal(false)}
                className='flex-1 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50'
              >
                Cancel
              </button>
              <button
                onClick={handleCreateType}
                className='flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700'
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

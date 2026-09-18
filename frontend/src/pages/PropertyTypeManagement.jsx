import { useState, useEffect, useRef } from 'react';
import { HiOutlineOfficeBuilding } from 'react-icons/hi';
import ConfirmDialog from '../components/ConfirmDialog';
import { apiClient } from '../utils/http';
import { useNotification } from '../contexts/NotificationContext';
import { PageLoader, Modal, EmptyState, Button } from '../design-system';
import { useTranslation } from 'react-i18next';

const CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'residential', label: 'Residential' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'land', label: 'Land' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'other', label: 'Other' },
];

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Textarea' },
  { value: 'number', label: 'Number' },
  { value: 'select', label: 'Select' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'date', label: 'Date' },
];

// Module-level cache so data survives component unmount/remount
let cachedPropertyTypes = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export default function PropertyTypeManagement() {
  const { t } = useTranslation();
  const [propertyTypes, setPropertyTypes] = useState(cachedPropertyTypes || []);
  const [loading, setLoading] = useState(!cachedPropertyTypes);
  const [expandedId, setExpandedId] = useState(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    icon: '🏠',
    category: 'residential',
  });
  // Local draft for fields being edited — keyed by property type id
  const [dirtyFields, setDirtyFields] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const { showSuccess, showError } = useNotification();
  const isFetching = useRef(false);

  useEffect(() => {
    const isCacheValid = cachedPropertyTypes && (Date.now() - cacheTimestamp < CACHE_TTL);
    if (isCacheValid) {
      setPropertyTypes(cachedPropertyTypes);
      setLoading(false);
      return;
    }
    if (!isFetching.current) {
      fetchPropertyTypes();
    }
  }, []);

  const fetchPropertyTypes = async () => {
    isFetching.current = true;
    try {
      setLoading(true);
      const data = await apiClient.get('/property-types/list?includeInactive=true', { silent: true });
      const types = data.data || [];
      setPropertyTypes(types);
      cachedPropertyTypes = types;
      cacheTimestamp = Date.now();
    } catch (error) {
      showError('Failed to load property types');
    } finally {
      setLoading(false);
      isFetching.current = false;
    }
  };

  // Get the fields to display — draft if editing, otherwise from server data
  const getDisplayFields = (type) => {
    if (dirtyFields[type._id]) {
      return dirtyFields[type._id];
    }
    return type.fields || [];
  };

  const hasDirtyFields = (typeId) => !!dirtyFields[typeId];

  // Update draft fields locally — NO api call
  const updateLocalField = (typeId, fieldIndex, updates) => {
    setDirtyFields(prev => {
      const type = propertyTypes.find(t => t._id === typeId);
      const currentFields = prev[typeId] || [...(type?.fields || [])];
      const updated = [...currentFields];
      updated[fieldIndex] = { ...updated[fieldIndex], ...updates };
      return { ...prev, [typeId]: updated };
    });
  };

  // Add a new field locally — NO api call
  const addLocalField = (typeId) => {
    setDirtyFields(prev => {
      const type = propertyTypes.find(t => t._id === typeId);
      const currentFields = prev[typeId] || [...(type?.fields || [])];
      return {
        ...prev,
        [typeId]: [...currentFields, {
          key: '',
          label: '',
          type: 'text',
          required: false,
          order: currentFields.length + 1,
          group: 'general',
        }],
      };
    });
  };

  // Remove a field locally — NO api call
  const removeLocalField = (typeId, fieldIndex) => {
    setDirtyFields(prev => {
      const type = propertyTypes.find(t => t._id === typeId);
      const currentFields = prev[typeId] || [...(type?.fields || [])];
      return {
        ...prev,
        [typeId]: currentFields.filter((_, idx) => idx !== fieldIndex),
      };
    });
  };

  // Discard local changes
  const discardFieldChanges = (typeId) => {
    setDirtyFields(prev => {
      const next = { ...prev };
      delete next[typeId];
      return next;
    });
  };

  // Save fields to server — only API call for fields
  const saveFields = async (typeId) => {
    const fields = dirtyFields[typeId];
    if (!fields) return;
    try {
      setSavingId(typeId);
      await apiClient.put(`/property-types/${typeId}`, { fields }, { silent: true });
      // Update local cache
      setPropertyTypes(prev => {
        const updated = prev.map(t => (t._id === typeId ? { ...t, fields } : t));
        cachedPropertyTypes = updated;
        cacheTimestamp = Date.now();
        return updated;
      });
      // Clear dirty state
      setDirtyFields(prev => {
        const next = { ...prev };
        delete next[typeId];
        return next;
      });
      showSuccess('Fields saved successfully');
    } catch (error) {
      showError('Failed to save fields');
    } finally {
      setSavingId(null);
    }
  };

  const handleSeedDefaults = async () => {
    try {
      await apiClient.post('/property-types/seed', {}, { silent: true });
      showSuccess('Default property types seeded successfully');
      fetchPropertyTypes();
    } catch (error) {
      showError('Failed to seed default property types');
    }
  };

  const handleCreateType = async () => {
    if (!formData.name.trim()) {
      showError('Name is required');
      return;
    }
    try {
      const result = await apiClient.post('/property-types/create', formData, { silent: true });
      showSuccess('Property type created successfully');
      setShowCreateModal(false);
      setFormData({ name: '', description: '', icon: '🏠', category: 'residential' });
      if (result.data) {
        setPropertyTypes(prev => {
          const updated = [...prev, result.data];
          cachedPropertyTypes = updated;
          cacheTimestamp = Date.now();
          return updated;
        });
      } else {
        fetchPropertyTypes();
      }
    } catch (error) {
      showError(error.message || 'Failed to create property type');
    }
  };

  const handleToggleActive = async (id, currentActive) => {
    try {
      setPropertyTypes(prev => {
        const updated = prev.map(t => (t._id === id ? { ...t, isActive: !currentActive } : t));
        cachedPropertyTypes = updated;
        cacheTimestamp = Date.now();
        return updated;
      });
      await apiClient.put(`/property-types/${id}`, { isActive: !currentActive }, { silent: true });
      showSuccess('Updated successfully');
    } catch (error) {
      showError('Failed to update property type');
      fetchPropertyTypes();
    }
  };

  const handleDeleteType = async (id) => {
    try {
      await apiClient.delete(`/property-types/${id}`, { silent: true });
      showSuccess('Property type deleted successfully');
      setPropertyTypes(prev => {
        const updated = prev.filter(t => t._id !== id);
        cachedPropertyTypes = updated;
        cacheTimestamp = Date.now();
        return updated;
      });
      // Clean up any dirty state
      setDirtyFields(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (error) {
      showError(error.message || 'Failed to delete property type');
    }
  };

  const filtered = activeCategory === 'all'
    ? propertyTypes
    : propertyTypes.filter(t => t.category === activeCategory);

  if (loading) {
    return <PageLoader message='Loading property types…' />;
  }

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
        <div>
          <h1 className='text-xl font-bold text-slate-900'>{t('propertyType.propertyTypes')}</h1>
          <p className='text-sm text-slate-500 mt-0.5'>
            {propertyTypes.length} type{propertyTypes.length !== 1 && 's'} configured
          </p>
        </div>
        <div className='flex gap-3'>
          <button
            onClick={handleSeedDefaults}
            className='px-4 py-2 text-sm font-medium border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors'
          >{t('propertyType.seedDefaults')}</button>
          <button
            onClick={() => setShowCreateModal(true)}
            className='px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors'
          >{t('propertyType.newType')}</button>
        </div>
      </div>

      {/* Category Tabs */}
      <div className='flex gap-2 overflow-x-auto pb-1'>
        {CATEGORIES.map(cat => (
          <button
            key={cat.value}
            onClick={() => setActiveCategory(cat.value)}
            className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
              activeCategory === cat.value
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Empty State */}
      {filtered.length === 0 && (
        <div className='bg-white rounded-xl border border-slate-200'>
          <EmptyState
            icon={HiOutlineOfficeBuilding}
            title={propertyTypes.length === 0 ? 'No property types yet' : 'No types in this category'}
            body={
              propertyTypes.length === 0
                ? 'Get started by seeding the default types or creating a new one.'
                : 'Try selecting a different category above.'
            }
            action={
              propertyTypes.length === 0 && (
                <Button onClick={handleSeedDefaults}>{t('propertyType.seedDefaultTypes')}</Button>
              )
            }
          />
        </div>
      )}

      {/* Property Type Cards */}
      <div className='space-y-4'>
        {filtered.map((type) => {
          const isExpanded = expandedId === type._id;
          const isDirty = hasDirtyFields(type._id);
          const isSaving = savingId === type._id;
          const displayFields = getDisplayFields(type);

          return (
            <div key={type._id} className={`bg-white rounded-xl border overflow-hidden shadow-sm ${isDirty ? 'border-amber-300' : 'border-slate-200'}`}>
              {/* Card Header */}
              <div className='flex items-center justify-between p-5'>
                <div className='flex items-center gap-4 min-w-0'>
                  <span className='text-3xl flex-shrink-0'>{type.icon}</span>
                  <div className='min-w-0'>
                    <div className='flex items-center gap-2 flex-wrap'>
                      <h3 className='text-lg font-semibold text-slate-900'>{type.name}</h3>
                      <span className='text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-medium capitalize'>
                        {type.category}
                      </span>
                      {type.isSystem && (
                        <span className='text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium'>{t('propertyType.system')}</span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        type.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                      }`}>
                        {type.isActive ? 'Active' : 'Inactive'}
                      </span>
                      {isDirty && (
                        <span className='text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium'>{t('propertyType.unsavedChanges')}</span>
                      )}
                    </div>
                    <p className='text-sm text-slate-500 mt-0.5 truncate'>{type.description}</p>
                  </div>
                </div>
                <div className='flex items-center gap-2 flex-shrink-0 ml-4'>
                  <button
                    onClick={() => handleToggleActive(type._id, type.isActive)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      type.isActive
                        ? 'border-amber-200 text-amber-700 hover:bg-amber-50'
                        : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                    }`}
                  >
                    {type.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                  {!type.isSystem && (
                    <button
                      onClick={() => setPendingDelete(type._id)}
                      className='px-3 py-1.5 text-xs font-medium rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 transition-colors'
                    >{t('propertyType.delete')}</button>
                  )}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : type._id)}
                    className='p-2 rounded-lg hover:bg-slate-100 transition-colors'
                  >
                    <svg
                      className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                      fill='none' stroke='currentColor' viewBox='0 0 24 24'
                    >
                      <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M19 9l-7 7-7-7' />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Expandable Fields Section */}
              {isExpanded && (
                <div className='border-t border-slate-100 bg-slate-50/50 p-5'>
                  <div className='flex items-center justify-between mb-4'>
                    <h4 className='text-sm font-semibold text-slate-700'>{t('propertyType.fields')}<span className='ml-2 text-xs font-normal text-slate-400'>
                        ({displayFields.length})
                      </span>
                    </h4>
                    <div className='flex items-center gap-2'>
                      {isDirty && (
                        <>
                          <button
                            onClick={() => discardFieldChanges(type._id)}
                            disabled={isSaving}
                            className='px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50'
                          >{t('propertyType.discard')}</button>
                          <button
                            onClick={() => saveFields(type._id)}
                            disabled={isSaving}
                            className='px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50'
                          >
                            {isSaving ? 'Saving...' : 'Save Fields'}
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => addLocalField(type._id)}
                        className='px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors'
                      >{t('propertyType.addField')}</button>
                    </div>
                  </div>

                  {displayFields.length > 0 ? (
                    <div className='space-y-3'>
                      {displayFields.map((field, idx) => (
                        <div key={idx} className='bg-white rounded-lg border border-slate-200 p-4'>
                          <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
                            <div>
                              <label className='block text-xs font-medium text-slate-500 mb-1'>{t('propertyType.key')}</label>
                              <input
                                type='text'
                                value={field.key}
                                onChange={(e) => updateLocalField(type._id, idx, { key: e.target.value })}
                                className='w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500'
                                placeholder='bedrooms'
                              />
                            </div>
                            <div>
                              <label className='block text-xs font-medium text-slate-500 mb-1'>{t('propertyType.label')}</label>
                              <input
                                type='text'
                                value={field.label}
                                onChange={(e) => updateLocalField(type._id, idx, { label: e.target.value })}
                                className='w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500'
                                placeholder={t('propertyType.bedrooms')}
                              />
                            </div>
                            <div>
                              <label className='block text-xs font-medium text-slate-500 mb-1'>{t('propertyType.type')}</label>
                              <select
                                value={field.type}
                                onChange={(e) => updateLocalField(type._id, idx, { type: e.target.value })}
                                className='w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500'
                              >
                                {FIELD_TYPES.map(ft => (
                                  <option key={ft.value} value={ft.value}>{ft.label}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className='block text-xs font-medium text-slate-500 mb-1'>{t('propertyType.group')}</label>
                              <input
                                type='text'
                                value={field.group}
                                onChange={(e) => updateLocalField(type._id, idx, { group: e.target.value })}
                                className='w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500'
                                placeholder='rooms'
                              />
                            </div>
                          </div>

                          <div className='grid grid-cols-3 sm:grid-cols-5 gap-3 mt-3 items-end'>
                            <div className='flex items-center pt-4'>
                              <label className='flex items-center gap-1.5 text-xs font-medium text-slate-600 cursor-pointer'>
                                <input
                                  type='checkbox'
                                  checked={field.required}
                                  onChange={(e) => updateLocalField(type._id, idx, { required: e.target.checked })}
                                  className='rounded border-slate-300 text-indigo-600 focus:ring-indigo-500'
                                />{t('propertyType.required')}</label>
                            </div>
                            <div>
                              <label className='block text-xs font-medium text-slate-500 mb-1'>{t('propertyType.min')}</label>
                              <input
                                type='number'
                                value={field.min ?? ''}
                                onChange={(e) => updateLocalField(type._id, idx, { min: e.target.value ? Number(e.target.value) : null })}
                                className='w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500'
                              />
                            </div>
                            <div>
                              <label className='block text-xs font-medium text-slate-500 mb-1'>{t('propertyType.max')}</label>
                              <input
                                type='number'
                                value={field.max ?? ''}
                                onChange={(e) => updateLocalField(type._id, idx, { max: e.target.value ? Number(e.target.value) : null })}
                                className='w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500'
                              />
                            </div>
                            <div>
                              <label className='block text-xs font-medium text-slate-500 mb-1'>{t('propertyType.unit')}</label>
                              <input
                                type='text'
                                value={field.unit || ''}
                                onChange={(e) => updateLocalField(type._id, idx, { unit: e.target.value })}
                                className='w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500'
                                placeholder={t('propertyType.sqFt')}
                              />
                            </div>
                            <div>
                              <label className='block text-xs font-medium text-slate-500 mb-1'>{t('propertyType.order')}</label>
                              <input
                                type='number'
                                value={field.order || 0}
                                onChange={(e) => updateLocalField(type._id, idx, { order: Number(e.target.value) })}
                                className='w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500'
                              />
                            </div>
                          </div>

                          {field.type === 'select' && (
                            <div className='mt-3'>
                              <label className='block text-xs font-medium text-slate-500 mb-1'>Options (comma-separated)</label>
                              <input
                                type='text'
                                value={field.options?.join(', ') || ''}
                                onChange={(e) => updateLocalField(type._id, idx, {
                                  options: e.target.value.split(',').map(o => o.trim()).filter(Boolean)
                                })}
                                className='w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500'
                                placeholder={t('propertyType.northSouthEastWest')}
                              />
                            </div>
                          )}

                          <div className='mt-3 flex justify-end'>
                            <button
                              onClick={() => removeLocalField(type._id, idx)}
                              className='text-xs px-3 py-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors'
                            >{t('propertyType.remove')}</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className='text-center py-8 text-sm text-slate-400'>{t('propertyType.noFieldsConfiguredClickAddField')}</div>
                  )}

                  {/* Bottom save bar when dirty */}
                  {isDirty && (
                    <div className='mt-4 flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg'>
                      <span className='text-sm text-amber-800'>{t('propertyType.youHaveUnsavedChanges')}</span>
                      <div className='flex gap-2'>
                        <button
                          onClick={() => discardFieldChanges(type._id)}
                          disabled={isSaving}
                          className='px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 text-slate-700 hover:bg-white transition-colors disabled:opacity-50'
                        >{t('propertyType.discard')}</button>
                        <button
                          onClick={() => saveFields(type._id)}
                          disabled={isSaving}
                          className='px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50'
                        >
                          {isSaving ? 'Saving...' : 'Save Fields'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Create Modal */}
      <Modal
        open={showCreateModal}
        onClose={() => { setShowCreateModal(false); setFormData({ name: '', description: '', icon: '🏠', category: 'residential' }); }}
        title={t('propertyType.createPropertyType')}
        footer={
          <>
            <Button
              variant='secondary'
              onClick={() => { setShowCreateModal(false); setFormData({ name: '', description: '', icon: '🏠', category: 'residential' }); }}
            >{t('propertyType.cancel')}</Button>
            <Button onClick={handleCreateType}>{t('propertyType.create')}</Button>
          </>
        }
      >
        <div className='space-y-4'>
          <div>
            <label className='block text-sm font-medium text-slate-700 mb-1'>{t('propertyType.name')}</label>
            <input
              type='text'
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className='w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500'
              placeholder={t('propertyType.eGWarehouse')}
              autoFocus
            />
          </div>
          <div>
            <label className='block text-sm font-medium text-slate-700 mb-1'>{t('propertyType.description')}</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className='w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500'
              rows={3}
              placeholder={t('propertyType.briefDescription')}
            />
          </div>
          <div className='grid grid-cols-2 gap-4'>
            <div>
              <label className='block text-sm font-medium text-slate-700 mb-1'>{t('propertyType.icon')}</label>
              <input
                type='text'
                value={formData.icon}
                onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                className='w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-center text-2xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500'
              />
            </div>
            <div>
              <label className='block text-sm font-medium text-slate-700 mb-1'>{t('propertyType.category')}</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className='w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500'
              >
                {CATEGORIES.filter(c => c.value !== 'all').map(cat => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </Modal>
      <ConfirmDialog
        open={!!pendingDelete}
        title={t('propertyType.deleteThisPropertyType')}
        description={t('propertyType.thisCannotBeUndone')}
        confirmLabel={t('propertyType.delete')}
        onConfirm={() => { handleDeleteType(pendingDelete); setPendingDelete(null); }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

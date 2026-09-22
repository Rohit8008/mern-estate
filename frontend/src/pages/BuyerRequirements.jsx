import { useState, useEffect } from 'react';
import ConfirmDialog from '../components/ConfirmDialog';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import {
  HiPlus, HiSearch, HiUser, HiPhone, HiMail, HiLocationMarker,
  HiHome, HiCurrencyDollar, HiCalendar, HiPencil, HiTrash, HiEye,
  HiSparkles, HiExternalLink, HiDownload,
} from 'react-icons/hi';
import { parseJsonSafely, fetchWithRefresh } from '../utils/http';
import { useBuyerView } from '../contexts/BuyerViewContext';
import { Modal, Input, Select, Textarea, Spinner, Button, EmptyState } from '../design-system';
import { formatListingPrice, formatCompactCurrency } from '../utils/currency';
import { useTranslation } from 'react-i18next';
import { localDateString } from '../utils/localDate';

function intentLabel(value, translate) {
  if (value === 'sale') return translate('buyerRequirements.buy');
  if (value === 'rent') return translate('buyerRequirements.rent');
  return value || '-';
}

// The form saves minPrice/maxPrice; the card only read the free-text `budget`,
// so every requirement with a range said "Not specified".
function budgetLabel(r, translate) {
  const min = Number(r.minPrice) || 0;
  const max = Number(r.maxPrice) || 0;
  if (min && max) return `${formatCompactCurrency(min)} – ${formatCompactCurrency(max)}`;
  if (min) return translate('buyerRequirements.budgetFrom', { amount: formatCompactCurrency(min) });
  if (max) return translate('buyerRequirements.budgetUpTo', { amount: formatCompactCurrency(max) });
  return r.budget || translate('buyerRequirements.notSpecified');
}

export default function BuyerRequirements() {
  const { t } = useTranslation();
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

  /**
   * Property matches for one buyer.
   *
   * The scoring engine (getMatchingScore in buyerRequirement.model.js) and its
   * endpoint have existed since the model was written, and nothing in the app
   * ever called them — so an agent had no way to see which of the workspace's
   * properties fit a buyer. This is that screen.
   */
  const [matchesFor, setMatchesFor] = useState(null);
  const [matches, setMatches] = useState([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchesError, setMatchesError] = useState(null);

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


  /**
   * Export the filtered set, server-side.
   *
   * Via fetch rather than a link so the session cookie and the refresh-on-401
   * path apply, and so the file reflects the whole filtered result rather than
   * the page of rows that happens to be loaded.
   */
  const exportCsv = async () => {
    try {
      const params = new URLSearchParams({ ...(searchTerm ? { search: searchTerm } : {}), ...(filterType !== 'all' ? { propertyType: filterType } : {}) });
      const response = await fetchWithRefresh(`/api/buyer-requirements/export?${params}`);
      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `buyers-${localDateString()}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    }
  };

  const handleShowMatches = async (requirement) => {
    setMatchesFor(requirement);
    setMatches([]);
    setMatchesError(null);
    setMatchesLoading(true);

    try {
      const response = await fetchWithRefresh(`/api/buyer-requirements/${requirement._id}/matches`);
      const data = await parseJsonSafely(response);
      if (!response.ok) throw new Error(data?.message || 'Could not load matches');
      setMatches(data?.matchingProperties || []);
    } catch (err) {
      setMatchesError(err.message || 'Could not load matches');
    } finally {
      setMatchesLoading(false);
    }
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
              <h1 className='text-xl font-bold text-slate-900'>{t('buyerRequirements.buyerRequirements')}</h1>
              <p className='text-slate-500 mt-0.5'>{t('buyerRequirements.manageAndTrackBuyerRequirements')}</p>
            </div>

            <div className='flex items-center gap-2'>
              <button
                onClick={exportCsv}
                className='inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors'
              >
                <HiDownload className='w-4 h-4' />{t('buyerRequirements.export')}</button>

              {!isBuyerViewMode && (
                <button
                  onClick={() => {
                    setViewingRequirement(null);
                    setShowForm(true);
                  }}
                  className='inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors'
                >
                  <HiPlus className='w-4 h-4' />{t('buyerRequirements.addRequirement')}</button>
              )}
            </div>
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
                  placeholder={t('buyerRequirements.searchBuyersOrRequirements')}
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
                <option value='all'>{t('buyerRequirements.allTypes')}</option>
                <option value='sale'>{t('buyerRequirements.forSale')}</option>
                <option value='rent'>{t('buyerRequirements.forRent')}</option>
              </select>
            </div>
          </div>
        </div>

        {matchesFor && (
          <Modal
            open
            onClose={() => setMatchesFor(null)}
            title={`Properties for ${matchesFor.buyerName || 'this buyer'}`}
            description={
              matchesLoading
                ? 'Scoring your properties against this requirement\u2026'
                : `${matches.length} match${matches.length === 1 ? '' : 'es'}, best first`
            }
            size='2xl'
          >
            {matchesLoading ? (
              <div className='py-12 flex justify-center'><Spinner /></div>
            ) : matchesError ? (
              <p className='text-sm text-rose-600 py-6 text-center'>{matchesError}</p>
            ) : !matches.length ? (
              <EmptyState
                icon={HiHome}
                title={t('buyerRequirements.noPropertiesMatchYet')}
                body={t('buyerRequirements.nothingInYourPortfolioFitsThis')}
              />
            ) : (
              <ul className='divide-y divide-slate-100 -my-2'>
                {matches.map((property) => (
                  <li key={property._id} className='py-3 flex items-start gap-3'>
                    {/*
                      * The score bands are literal class strings. Tailwind reads
                      * source as plain text, so `bg-${x}-50` is never emitted.
                      */}
                    <span
                      className={
                        property.matchingScore >= 80
                          ? 'px-2 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 flex-shrink-0'
                          : property.matchingScore >= 50
                            ? 'px-2 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 ring-1 ring-amber-100 flex-shrink-0'
                            : 'px-2 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 flex-shrink-0'
                      }
                    >
                      {property.matchingScore}%
                    </span>

                    <div className='flex-1 min-w-0'>
                      <div className='text-sm font-medium text-slate-900 truncate'>
                        {property.name || 'Untitled property'}
                      </div>
                      <div className='text-xs text-slate-500 truncate'>{property.address}</div>
                      <div className='text-xs text-slate-600 mt-0.5'>
                        {formatListingPrice(property.regularPrice)}
                        {property.bedrooms ? ` \u00b7 ${property.bedrooms} bed` : ''}
                        {property.bathrooms ? ` \u00b7 ${property.bathrooms} bath` : ''}
                      </div>
                    </div>

                    <Link
                      to={`/listing/${property._id}`}
                      className='p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0'
                      title={t('buyerRequirements.openProperty')}
                    >
                      <HiExternalLink className='w-4 h-4' />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Modal>
        )}

        {viewingRequirement && (
          <Modal
            open
            onClose={() => setViewingRequirement(null)}
            title={t('buyerRequirements.buyerRequirement')}
            description={t('buyerRequirements.details')}
            size='2xl'
            footer={!isBuyerViewMode ? (
              <Button
                icon={HiPencil}
                onClick={() => {
                  const req = viewingRequirement;
                  setViewingRequirement(null);
                  handleEdit(req);
                }}
              >{t('buyerRequirements.edit')}</Button>
            ) : null}
          >
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4 text-sm'>
              <div>
                <div className='text-slate-500'>{t('buyerRequirements.name')}</div>
                <div className='font-medium text-slate-900'>{viewingRequirement.buyerName || '-'}</div>
              </div>
              <div>
                <div className='text-slate-500'>{t('buyerRequirements.phone')}</div>
                <div className='font-medium text-slate-900'>{viewingRequirement.buyerPhone || '-'}</div>
              </div>
              <div>
                <div className='text-slate-500'>{t('buyerRequirements.email')}</div>
                <div className='font-medium text-slate-900'>{viewingRequirement.buyerEmail || '-'}</div>
              </div>
              <div>
                <div className='text-slate-500'>{t('buyerRequirements.location')}</div>
                <div className='font-medium text-slate-900'>{viewingRequirement.preferredLocation || '-'}</div>
              </div>
              <div>
                <div className='text-slate-500'>{t('buyerRequirements.type')}</div>
                <div className='font-medium text-slate-900'>{intentLabel(viewingRequirement.propertyType, t)}</div>
              </div>
              <div>
                <div className='text-slate-500'>{t('buyerRequirements.budget')}</div>
                <div className='font-medium text-slate-900'>{viewingRequirement.budget || '-'}</div>
              </div>
            </div>

            {(viewingRequirement.additionalRequirements || viewingRequirement.notes) && (
              <div className='mt-4 space-y-3'>
                {viewingRequirement.additionalRequirements && (
                  <div>
                    <div className='text-slate-500 text-sm mb-1'>{t('buyerRequirements.additionalRequirements')}</div>
                    <div className='bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800 text-sm'>
                      {viewingRequirement.additionalRequirements}
                    </div>
                  </div>
                )}
                {viewingRequirement.notes && (
                  <div>
                    <div className='text-slate-500 text-sm mb-1'>{t('buyerRequirements.notes')}</div>
                    <div className='bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-800 text-sm'>
                      {viewingRequirement.notes}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Modal>
        )}

        {/* Add Buyer Requirement Form */}
        {showForm && (
          <Modal
            open
            onClose={handleCancelForm}
            title={editingId ? 'Edit Buyer Requirement' : 'Add Buyer Requirement'}
            description={t('buyerRequirements.captureTheBuyerProfileAndPreferences')}
            size='2xl'
            className='!max-w-4xl'
            footer={
              <>
                <Button type='button' variant='secondary' onClick={handleCancelForm}>{t('buyerRequirements.cancel')}</Button>
                <Button type='submit' form='buyer-requirement-form' loading={loading}>
                  {editingId ? 'Save Changes' : 'Create Requirement'}
                </Button>
              </>
            }
          >
            <form id='buyer-requirement-form' onSubmit={handleSubmit} className='space-y-6'>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                {/* Buyer Information */}
                <div className='space-y-4'>
                  <h3 className='text-base font-semibold text-slate-900 flex items-center gap-2'>
                    <HiUser className='w-5 h-5 text-slate-900' />{t('buyerRequirements.buyerInformation')}</h3>

                  <Input
                    id='buyerName'
                    label={t('buyerRequirements.buyerName')}
                    type='text'
                    required
                    value={formData.buyerName}
                    onChange={(e) => setFormData({...formData, buyerName: e.target.value})}
                  />

                  <Input
                    id='buyerEmail'
                    label={t('buyerRequirements.email')}
                    type='email'
                    value={formData.buyerEmail}
                    onChange={(e) => setFormData({...formData, buyerEmail: e.target.value})}
                  />

                  <Input
                    id='buyerPhone'
                    label={t('buyerRequirements.phone')}
                    type='tel'
                    required
                    value={formData.buyerPhone}
                    onChange={(e) => setFormData({...formData, buyerPhone: e.target.value})}
                  />
                </div>

                {/* Property Requirements */}
                <div className='space-y-4'>
                  <h3 className='text-base font-semibold text-slate-900 flex items-center gap-2'>
                    <HiHome className='w-5 h-5 text-slate-900' />{t('buyerRequirements.propertyRequirements')}</h3>

                  {/* The field is named propertyType but holds buy vs rent, so it is
                      labelled for what the buyer wants, not as a property type. */}
                  <Select
                    label={t('buyerRequirements.lookingTo')}
                    required
                    value={formData.propertyType}
                    onChange={(e) => setFormData({...formData, propertyType: e.target.value})}
                  >
                    <option value='sale'>{t('buyerRequirements.buy')}</option>
                    <option value='rent'>{t('buyerRequirements.rent')}</option>
                  </Select>

                  <Input
                    label={t('buyerRequirements.preferredLocation')}
                    type='text'
                    value={formData.preferredLocation}
                    onChange={(e) => setFormData({...formData, preferredLocation: e.target.value})}
                  />

                  <div className='grid grid-cols-2 gap-4'>
                    <Input
                      label={t('buyerRequirements.minPrice')}
                      type='number'
                      value={formData.minPrice}
                      onChange={(e) => setFormData({...formData, minPrice: e.target.value})}
                    />
                    <Input
                      label={t('buyerRequirements.maxPrice')}
                      type='number'
                      value={formData.maxPrice}
                      onChange={(e) => setFormData({...formData, maxPrice: e.target.value})}
                    />
                  </div>

                  <div className='grid grid-cols-2 gap-4'>
                    <Input
                      label={t('buyerRequirements.minBedrooms')}
                      type='number'
                      min='1'
                      value={formData.minBedrooms}
                      onChange={(e) => setFormData({...formData, minBedrooms: e.target.value})}
                    />
                    <Input
                      label={t('buyerRequirements.minBathrooms')}
                      type='number'
                      min='1'
                      value={formData.minBathrooms}
                      onChange={(e) => setFormData({...formData, minBathrooms: e.target.value})}
                    />
                  </div>
                </div>
              </div>

              {/* Additional Information */}
              <div className='space-y-4'>
                <h3 className='text-base font-semibold text-slate-900 flex items-center gap-2'>
                  <HiCalendar className='w-5 h-5 text-slate-900' />{t('buyerRequirements.additionalInformation')}</h3>

                <Input
                  label={t('buyerRequirements.budgetRange')}
                  type='text'
                  placeholder={t('buyerRequirements.eG300000500000')}
                  value={formData.budget}
                  onChange={(e) => setFormData({...formData, budget: e.target.value})}
                />

                <Input
                  label={t('buyerRequirements.timeline')}
                  type='text'
                  placeholder={t('buyerRequirements.eGWithin3MonthsAsap')}
                  value={formData.timeline}
                  onChange={(e) => setFormData({...formData, timeline: e.target.value})}
                />

                <Textarea
                  label={t('buyerRequirements.additionalRequirements')}
                  rows={3}
                  placeholder={t('buyerRequirements.anySpecificFeaturesAmenitiesOrPreferences')}
                  value={formData.additionalRequirements}
                  onChange={(e) => setFormData({...formData, additionalRequirements: e.target.value})}
                />

                <Textarea
                  label={t('buyerRequirements.notes')}
                  rows={2}
                  placeholder={t('buyerRequirements.internalNotesAboutThisBuyer')}
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                />
              </div>
            </form>
          </Modal>
        )}

        {/* Buyer Requirements List */}
        <div className='space-y-4'>
          {loading && (
            <div className='text-center py-8'>
              <Spinner size='lg' className='mx-auto' />
              <p className='mt-2 text-slate-500'>{t('buyerRequirements.loadingBuyerRequirements')}</p>
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
              <h3 className='text-lg font-semibold text-slate-900 mb-2'>{t('buyerRequirements.noBuyerRequirementsFound')}</h3>
              <p className='text-slate-500 mb-4'>{t('buyerRequirements.startByAddingYourFirstBuyer')}</p>
              <button
                onClick={() => setShowForm(true)}
                className='bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors'
              >{t('buyerRequirements.addBuyerRequirement')}</button>
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
                      <span className='text-slate-600'>{t('buyerRequirements.location2')}</span>
                      <span className='font-medium'>{requirement.preferredLocation}</span>
                    </div>
                    <div className='flex items-center gap-2 text-sm'>
                      <HiHome className='w-4 h-4 text-slate-400' />
                      <span className='text-slate-600'>{t('buyerRequirements.type2')}</span>
                      <span className='font-medium'>{intentLabel(requirement.propertyType, t)}</span>
                    </div>
                    <div className='flex items-center gap-2 text-sm'>
                      <HiCurrencyDollar className='w-4 h-4 text-slate-400' />
                      <span className='text-slate-600'>{t('buyerRequirements.budget2')}</span>
                      <span className='font-medium'>{budgetLabel(requirement, t)}</span>
                    </div>
                    <div className='flex items-center gap-2 text-sm'>
                      <span className='text-slate-600'>{t('buyerRequirements.bedrooms')}</span>
                      <span className='font-medium'>{requirement.minBedrooms || 'Any'}</span>
                    </div>
                    <div className='flex items-center gap-2 text-sm'>
                      <span className='text-slate-600'>{t('buyerRequirements.bathrooms')}</span>
                      <span className='font-medium'>{requirement.minBathrooms || 'Any'}</span>
                    </div>
                    <div className='flex items-center gap-2 text-sm'>
                      <HiCalendar className='w-4 h-4 text-slate-400' />
                      <span className='text-slate-600'>{t('buyerRequirements.timeline2')}</span>
                      <span className='font-medium'>{requirement.timeline || 'Not specified'}</span>
                    </div>
                  </div>

                  {requirement.additionalRequirements && (
                    <div className='mb-3'>
                      <p className='text-sm text-slate-600 mb-1'>{t('buyerRequirements.additionalRequirements2')}</p>
                      <p className='text-sm text-slate-800 bg-slate-50 p-3 rounded-lg'>{requirement.additionalRequirements}</p>
                    </div>
                  )}

                  {requirement.notes && (
                    <div className='mb-3'>
                      <p className='text-sm text-slate-600 mb-1'>{t('buyerRequirements.notes2')}</p>
                      <p className='text-sm text-slate-800 bg-blue-50 p-3 rounded-lg'>{requirement.notes}</p>
                    </div>
                  )}
                </div>

                <div className='flex items-center gap-2 ml-4'>
                  <button
                    onClick={() => handleView(requirement)}
                    className='p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200'
                    title={t('buyerRequirements.viewRequirement')}
                  >
                    <HiEye className='w-4 h-4' />
                  </button>
                  <button
                    onClick={() => handleShowMatches(requirement)}
                    className='p-2 text-violet-600 hover:bg-violet-50 rounded-lg transition-colors border border-violet-200'
                    title={t('buyerRequirements.findMatchingProperties')}
                  >
                    <HiSparkles className='w-4 h-4' />
                  </button>
                  {!isBuyerViewMode && (
                    <>
                      <button
                        onClick={() => handleEdit(requirement)}
                        className='p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200'
                        title={t('buyerRequirements.editRequirement')}
                      >
                        <HiPencil className='w-4 h-4' />
                      </button>
                      <button
                        onClick={() => setPendingDelete(requirement._id)}
                        className='p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-rose-200'
                        title={t('buyerRequirements.deleteRequirement')}
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
        title={t('buyerRequirements.deleteBuyerRequirement')}
        description={t('buyerRequirements.thisCannotBeUndone')}
        confirmLabel={t('buyerRequirements.delete')}
        onConfirm={() => { handleDelete(pendingDelete); setPendingDelete(null); }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

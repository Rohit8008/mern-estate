import { useState, useEffect, useCallback, useRef } from 'react';
import ConfirmDialog from '../components/ConfirmDialog';
import { useSelector } from 'react-redux';
import { Link, useSearchParams } from 'react-router-dom';
import BuyerClientLink from '../components/crm/BuyerClientLink';
import {
  HiPlus, HiSearch, HiUser, HiPhone, HiMail, HiLocationMarker,
  HiHome, HiCurrencyDollar, HiCalendar, HiPencil, HiTrash, HiEye,
  HiSparkles, HiExternalLink, HiDownload, HiBookmark, HiX,
} from 'react-icons/hi';
import { apiClient, parseJsonSafely, fetchWithRefresh } from '../utils/http';
import { useBuyerView } from '../contexts/BuyerViewContext';
import { usePermissions } from '../contexts/PermissionsContext';
import {
  Modal, Input, Select, Textarea, Spinner, Button, EmptyState, Pagination, SkeletonCard, Badge, Checkbox,
} from '../design-system';
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

/**
 * Orders the list can be shown in. Values are the server's `sort` parameter
 * (see BUYER_SORTS in buyerRequirement.controller.js) — sorting one page in the
 * browser would sort the wrong set.
 */
const SORT_OPTIONS = [
  { value: 'createdAt:desc',       labelKey: 'buyerRequirements.sortNewest' },
  { value: 'createdAt:asc',        labelKey: 'buyerRequirements.sortOldest' },
  { value: 'name:asc',             labelKey: 'buyerRequirements.sortName' },
  { value: 'followUpDate:asc',     labelKey: 'buyerRequirements.sortFollowUp' },
  { value: 'lastContactDate:desc', labelKey: 'buyerRequirements.sortLastContact' },
];

/** Values are the model's enum (buyerRequirement.model.js); the server rejects anything else. */
const STATUSES = [
  { value: 'active',   labelKey: 'buyerRequirements.statusActive',   fallback: 'Active',   variant: 'success' },
  { value: 'matched',  labelKey: 'buyerRequirements.statusMatched',  fallback: 'Matched',  variant: 'info' },
  { value: 'closed',   labelKey: 'buyerRequirements.statusClosed',   fallback: 'Closed',   variant: 'slate' },
  { value: 'inactive', labelKey: 'buyerRequirements.statusInactive', fallback: 'Inactive', variant: 'warning' },
];
const statusMeta = (value) => STATUSES.find((s) => s.value === value) || STATUSES[0];

/** How long typing settles before the search goes to the server. */
const SEARCH_DEBOUNCE_MS = 300;

export default function BuyerRequirements() {
  const { t } = useTranslation();
  const [buyerRequirements, setBuyerRequirements] = useState([]);
  // Two flags: `loading` is the form's save in flight, `listLoading` the list.
  // Sharing one turned the whole list into a spinner every time someone saved.
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState(null);
  const { canAct } = usePermissions();
  const canCreateBuyer = canAct('createBuyerRequirement');
  const canUpdateBuyer = canAct('updateBuyerRequirement');
  const canDeleteBuyer = canAct('deleteBuyerRequirement');
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [stats, setStats] = useState(null);
  const [sort, setSort] = useState(SORT_OPTIONS[0].value);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const { currentUser } = useSelector((state) => state.user);
  const { isBuyerViewMode } = useBuyerView();

  const [editingId, setEditingId] = useState(null);
  const [viewingRequirement, setViewingRequirement] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  // Row actions that go to the server: a status change on one card, a bulk
  // action on the ticked ones, and saving/dismissing a match.
  const [notice, setNotice] = useState(null); // { type: 'success' | 'error', text }
  const [statusBusy, setStatusBusy] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const [savedIds, setSavedIds] = useState(() => new Set());
  const [matchBusy, setMatchBusy] = useState(null);

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
    clientId: null,
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
  // The linked client's name for display, whether picked just now or loaded.
  const [clientName, setClientName] = useState('');
  const [alsoCreateClient, setAlsoCreateClient] = useState(false);
  const [declinedClient, setDeclinedClient] = useState(false);
  // What the requirement was linked to when the form opened — an edit that
  // leaves the link alone must not send it (and re-run the server's check).
  const initialClientId = useRef(null);

  // "Add requirement" from a client's page: /buyers?new=1&client=<id>.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    const clientParam = searchParams.get('client');
    setSearchParams({}, { replace: true });
    (async () => {
      if (clientParam) {
        try {
          const res = await apiClient.get(`/clients/${clientParam}`, { silent: true });
          const c = res?.data;
          if (c) {
            setFormData({ ...emptyForm, clientId: c._id, buyerName: c.name || '', buyerPhone: c.phone || '', buyerEmail: c.email || '' });
            setClientName(c.name || '');
          }
        } catch (_) { /* the form still opens, unlinked */ }
      }
      initialClientId.current = null;
      setShowForm(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Typing settles before it becomes a request, and a new search starts from
  // page 1 — page 4 of a narrower result is usually empty.
  useEffect(() => {
    const id = setTimeout(() => { setQuery(searchTerm.trim()); setPage(1); }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [searchTerm]);

  // Asking with `page` is what makes the endpoint answer { data, total } — the
  // mobile app calls it without one and still gets the bare array it expects.
  const fetchBuyerRequirements = useCallback(async () => {
    setListLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize), sort });
      if (query) params.set('search', query);
      if (filterType !== 'all') params.set('propertyType', filterType);
      if (filterStatus !== 'all') params.set('status', filterStatus);
      const res = await apiClient.get(`/buyer-requirements?${params}`);
      const data = Array.isArray(res) ? res : res?.data || [];
      setBuyerRequirements(data);
      setTotal(Array.isArray(res) ? data.length : Number(res?.total) || 0);
    } catch (error) {
      console.error('Error fetching buyer requirements:', error);
      setError('Failed to load buyer requirements');
    } finally {
      setListLoading(false);
    }
  }, [page, pageSize, sort, query, filterType, filterStatus]);

  useEffect(() => { fetchBuyerRequirements(); }, [fetchBuyerRequirements]);

  // Whole-workspace counts, refreshed whenever the list is (a status change or
  // a bulk action moves them). Silent: the tiles are a nicety, not the page.
  useEffect(() => {
    apiClient.get('/buyer-requirements/stats', { silent: true })
      .then((res) => setStats(res?.overview || null))
      .catch(() => setStats(null));
  }, [buyerRequirements]);

  // A tick belongs to the page it was made on.
  useEffect(() => { setSelected(new Set()); }, [page, pageSize, sort, query, filterType, filterStatus]);

  // Deleting the last card of the last page would otherwise leave an empty
  // page with a pager saying there are more.
  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(total / pageSize));
    if (!listLoading && page > lastPage) setPage(lastPage);
  }, [total, pageSize, page, listLoading]);

  const isFiltered = Boolean(query) || filterType !== 'all' || filterStatus !== 'all';

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

      // "Also add as a client" goes through the normal client create (limits,
      // assignment rules, duplicate check). A 409 means they already exist.
      if (!isEditing && !payload.clientId && alsoCreateClient) {
        try {
          const made = await apiClient.post('/clients', {
            name: payload.buyerName,
            phone: payload.buyerPhone,
            ...(payload.buyerEmail ? { email: payload.buyerEmail } : {}),
          }, { silent: true });
          payload.clientId = made?.data?._id || made?._id || null;
        } catch (err) {
          const existing = err?.details?.duplicate?._id;
          if (!existing) {
            setError(err?.message || 'Could not add them as a client.');
            return;
          }
          payload.clientId = existing;
        }
      }
      // Absent lets the server attach the client already on file with this
      // phone; an explicit null ("Not them", or an unlink) stops it doing so.
      // A linked requirement takes its contact details from the client, so a
      // pre-existing copy is not sent back for validation.
      if (isEditing && formData.clientId) {
        delete payload.buyerName;
        delete payload.buyerPhone;
        delete payload.buyerEmail;
      }
      if (isEditing) {
        if (payload.clientId === initialClientId.current) delete payload.clientId;
      } else if (payload.clientId === null && !declinedClient) {
        delete payload.clientId;
      }

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
        setAlsoCreateClient(false);
        setDeclinedClient(false);
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
      clientId: requirement.clientId || null,
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
    initialClientId.current = requirement.clientId || null;
    setClientName('');
    setAlsoCreateClient(false);
    setShowForm(true);
  };

  const handleCancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData(emptyForm);
    setAlsoCreateClient(false);
    setDeclinedClient(false);
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
      const params = new URLSearchParams({ ...(searchTerm ? { search: searchTerm } : {}), ...(filterType !== 'all' ? { propertyType: filterType } : {}), ...(filterStatus !== 'all' ? { status: filterStatus } : {}) });
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
      setSavedIds(new Set((data?.buyerRequirement?.matchedProperties || []).map(String)));
    } catch (err) {
      setMatchesError(err.message || 'Could not load matches');
    } finally {
      setMatchesLoading(false);
    }
  };

  // PATCH /buyer-requirements/:id/status
  const changeStatus = async (requirement, status) => {
    if (status === requirement.status) return;
    setStatusBusy(requirement._id);
    setNotice(null);
    try {
      const updated = await apiClient.patch(`/buyer-requirements/${requirement._id}/status`, { status });
      setBuyerRequirements((rows) => rows.map((r) => (r._id === requirement._id ? { ...r, status: updated?.status || status } : r)));
      // The status filter may now exclude this row; refetch so counts stay true.
      if (filterStatus !== 'all') fetchBuyerRequirements();
    } catch (err) {
      setNotice({ type: 'error', text: err?.message || t('buyerRequirements.statusFailed', 'Could not change the status') });
    } finally {
      setStatusBusy(null);
    }
  };

  // POST /buyer-requirements/bulk
  const runBulk = async (action, value) => {
    const ids = [...selected];
    if (!ids.length) return;
    setBulkBusy(true);
    setNotice(null);
    try {
      const res = await apiClient.post('/buyer-requirements/bulk', { ids, action, value });
      const done = res?.data?.modified ?? res?.data?.matched ?? ids.length;
      const skipped = ids.length - (res?.data?.matched ?? ids.length);
      setNotice({
        type: 'success',
        text: skipped > 0
          ? t('buyerRequirements.bulkPartial', { defaultValue: '{{done}} updated, {{skipped}} skipped (not yours to change)', done, skipped })
          : t('buyerRequirements.bulkDone', { defaultValue: '{{done}} updated', done }),
      });
      setSelected(new Set());
      fetchBuyerRequirements();
    } catch (err) {
      setNotice({ type: 'error', text: err?.message || t('buyerRequirements.bulkFailed', 'Bulk action failed') });
    } finally {
      setBulkBusy(false);
    }
  };

  const toggleSelected = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allSelected = buyerRequirements.length > 0 && buyerRequirements.every((r) => selected.has(r._id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(buyerRequirements.map((r) => r._id)));

  // POST / DELETE /buyer-requirements/matches
  const toggleSavedMatch = async (propertyId) => {
    const isSaved = savedIds.has(String(propertyId));
    setMatchBusy(propertyId);
    setMatchesError(null);
    try {
      await apiClient.request('/buyer-requirements/matches', {
        method: isSaved ? 'DELETE' : 'POST',
        body: JSON.stringify({ buyerRequirementId: matchesFor._id, propertyId }),
      });
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (isSaved) next.delete(String(propertyId)); else next.add(String(propertyId));
        return next;
      });
    } catch (err) {
      setNotice({ type: 'error', text: err?.message || t('buyerRequirements.matchSaveFailed', 'Could not update the saved matches') });
    } finally {
      setMatchBusy(null);
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
              <button type="button"
                onClick={exportCsv}
                className='inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors'
              >
                <HiDownload className='w-4 h-4' />{t('buyerRequirements.export')}</button>

              {!isBuyerViewMode && canCreateBuyer && (
                <button type="button"
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

        {stats && stats.total > 0 && (
          <div className='grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4'>
            {[
              ['Total', stats.total, 'border-t-slate-400', null],
              ['Active', stats.active, 'border-t-emerald-500', 'active'],
              ['Matched', stats.matched, 'border-t-blue-500', 'matched'],
              ['High priority', stats.highPriority, 'border-t-rose-500', null],
            ].map(([label, value, tone, status]) => (
              <button
                key={label}
                type='button'
                disabled={!status}
                onClick={() => { setFilterStatus(filterStatus === status ? 'all' : status); setPage(1); }}
                className={`text-left bg-white border border-slate-200 border-t-2 ${tone} rounded-xl p-4 ${status ? 'hover:shadow-md transition-shadow' : 'cursor-default'}`}
              >
                <div className='text-2xl font-semibold tabular-nums text-slate-900 leading-none'>{value}</div>
                <div className='text-sm text-slate-600 mt-1.5'>{label}</div>
              </button>
            ))}
          </div>
        )}

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
                onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
                aria-label={t('buyerRequirements.type')}
                className='px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400 bg-white'
              >
                <option value='all'>{t('buyerRequirements.allTypes')}</option>
                <option value='sale'>{t('buyerRequirements.forSale')}</option>
                <option value='rent'>{t('buyerRequirements.forRent')}</option>
              </select>

              <select
                value={filterStatus}
                onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
                aria-label={t('buyerRequirements.status', 'Status')}
                className='px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400 bg-white'
              >
                <option value='all'>{t('buyerRequirements.allStatuses', 'All statuses')}</option>
                {STATUSES.map((s) => <option key={s.value} value={s.value}>{t(s.labelKey, s.fallback)}</option>)}
              </select>

              <select
                value={sort}
                onChange={(e) => { setSort(e.target.value); setPage(1); }}
                aria-label={t('buyerRequirements.sortBy')}
                className='px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400 bg-white'
              >
                {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{t(o.labelKey)}</option>)}
              </select>
            </div>

            <span className='text-sm text-muted-foreground tabular-nums whitespace-nowrap' aria-live='polite'>
              {listLoading ? '' : t('buyerRequirements.buyerCount', { count: total })}
            </span>
          </div>
        </div>

        {notice && (
          <div
            role={notice.type === 'error' ? 'alert' : 'status'}
            className={`mb-4 flex items-start justify-between gap-3 rounded-lg border p-3 text-sm ${
              notice.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
            }`}
          >
            <span>{notice.text}</span>
            <button type='button' onClick={() => setNotice(null)} aria-label={t('common.close', 'Close')} className='p-0.5'>
              <HiX className='w-4 h-4' />
            </button>
          </div>
        )}

        {!isBuyerViewMode && selected.size > 0 && (
          <div className='mb-4 flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm'>
            <span className='text-sm font-medium text-slate-900 tabular-nums'>
              {t('buyerRequirements.selectedCount', { defaultValue: '{{count}} selected', count: selected.size })}
            </span>
            <div className='flex flex-wrap items-center gap-2 sm:ml-auto'>
              {canUpdateBuyer && <select
                aria-label={t('buyerRequirements.setStatusFor', 'Set status for selected')}
                disabled={bulkBusy}
                value=''
                onChange={(e) => { if (e.target.value) runBulk('status', e.target.value); }}
                className='px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white'
              >
                <option value=''>{t('buyerRequirements.setStatus', 'Set status...')}</option>
                {STATUSES.map((s) => <option key={s.value} value={s.value}>{t(s.labelKey, s.fallback)}</option>)}
              </select>}
              {canDeleteBuyer && <Button variant='danger' icon={HiTrash} disabled={bulkBusy} onClick={() => setPendingBulkDelete(true)}>
                {t('buyerRequirements.delete')}
              </Button>}
              <Button variant='secondary' disabled={bulkBusy} onClick={() => setSelected(new Set())}>
                {t('common.clearAll')}
              </Button>
            </div>
          </div>
        )}

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

                    {!isBuyerViewMode && (
                      <button
                        type='button'
                        disabled={matchBusy === property._id}
                        onClick={() => toggleSavedMatch(property._id)}
                        aria-pressed={savedIds.has(String(property._id))}
                        title={savedIds.has(String(property._id))
                          ? t('buyerRequirements.dismissMatch', 'Remove from saved matches')
                          : t('buyerRequirements.saveMatch', 'Save as a match for this buyer')}
                        className={`p-2 rounded-lg transition-colors flex-shrink-0 disabled:opacity-50 ${
                          savedIds.has(String(property._id))
                            ? 'text-violet-700 bg-violet-50 hover:bg-violet-100'
                            : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                        }`}
                      >
                        {matchBusy === property._id ? <Spinner /> : <HiBookmark className='w-4 h-4' />}
                      </button>
                    )}

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
              {viewingRequirement.clientId && (
                <div>
                  <div className='text-slate-500'>Client</div>
                  <Link to={`/clients/${viewingRequirement.clientId}`} className='font-medium text-brand-700 hover:underline'>View client record</Link>
                </div>
              )}
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

                  <BuyerClientLink
                    clientId={formData.clientId}
                    clientName={clientName}
                    phone={formData.buyerPhone}
                    email={formData.buyerEmail}
                    isNew={!editingId}
                    alsoCreate={alsoCreateClient}
                    onAlsoCreate={setAlsoCreateClient}
                    onDecline={() => setDeclinedClient(true)}
                    onChange={(c) => {
                      setClientName(c?.name || '');
                      setFormData((f) => c
                        ? { ...f, clientId: c._id, buyerName: c.name || f.buyerName, buyerPhone: c.phone || f.buyerPhone, buyerEmail: c.email || f.buyerEmail }
                        : { ...f, clientId: null });
                      if (!c) setDeclinedClient(true);
                    }}
                  />

                  <Input
                    id='buyerName'
                    label={t('buyerRequirements.buyerName')}
                    type='text'
                    required
                    value={formData.buyerName}
                    readOnly={!!formData.clientId}
                    hint={formData.clientId ? 'Taken from the client — edit it on their page.' : undefined}
                    onChange={(e) => setFormData({...formData, buyerName: e.target.value})}
                  />

                  <Input
                    id='buyerEmail'
                    label={t('buyerRequirements.email')}
                    type='email'
                    value={formData.buyerEmail}
                    readOnly={!!formData.clientId}
                    onChange={(e) => setFormData({...formData, buyerEmail: e.target.value})}
                  />

                  <Input
                    id='buyerPhone'
                    label={t('buyerRequirements.phone')}
                    type='tel'
                    required
                    value={formData.buyerPhone}
                    readOnly={!!formData.clientId}
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
          {listLoading && (
            <div className='space-y-4' role='status' aria-label={t('buyerRequirements.loadingBuyerRequirements')}>
              {Array.from({ length: 3 }, (_, i) => <SkeletonCard key={i} className='rounded-2xl p-6' />)}
            </div>
          )}

          {error && (
            <div className='bg-red-50 border border-red-200 rounded-lg p-4'>
              <p className='text-red-600'>{error}</p>
            </div>
          )}

          {!listLoading && !error && buyerRequirements.length === 0 && (
            isFiltered ? (
              <EmptyState
                icon={HiSearch}
                title={t('buyerRequirements.noMatch')}
                body={t('buyerRequirements.noMatchBody')}
                action={
                  <Button variant='secondary' onClick={() => { setSearchTerm(''); setFilterType('all'); setPage(1); }}>
                    {t('common.clearAll')}
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={HiUser}
                title={t('buyerRequirements.noBuyerRequirementsFound')}
                body={t('buyerRequirements.startByAddingYourFirstBuyer')}
                action={!isBuyerViewMode && canCreateBuyer && (
                  <Button icon={HiPlus} onClick={() => setShowForm(true)}>{t('buyerRequirements.addBuyerRequirement')}</Button>
                )}
              />
            )
          )}

          {!isBuyerViewMode && !listLoading && !error && buyerRequirements.length > 0 && (
            <label className='flex items-center gap-2 px-1 text-sm text-slate-600 cursor-pointer w-fit'>
              <Checkbox checked={allSelected} indeterminate={!allSelected && selected.size > 0} onChange={toggleAll} />
              {t('buyerRequirements.selectPage', 'Select all on this page')}
            </label>
          )}

          {!listLoading && !error && buyerRequirements.map((requirement) => (
            <div key={requirement._id} className='bg-white rounded-2xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow'>
              <div className='flex items-start justify-between'>
                <div className='flex-1'>
                  <div className='flex items-center gap-3 mb-3'>
                    {!isBuyerViewMode && (
                      <Checkbox
                        checked={selected.has(requirement._id)}
                        onChange={() => toggleSelected(requirement._id)}
                        aria-label={t('buyerRequirements.selectRow', 'Select this buyer')}
                      />
                    )}
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
                        {isBuyerViewMode ? (
                          <Badge variant={statusMeta(requirement.status).variant}>{t(statusMeta(requirement.status).labelKey, statusMeta(requirement.status).fallback)}</Badge>
                        ) : (
                          <select
                            value={requirement.status || 'active'}
                            disabled={statusBusy === requirement._id}
                            onChange={(e) => changeStatus(requirement, e.target.value)}
                            aria-label={t('buyerRequirements.status', 'Status')}
                            className='text-xs font-medium border border-slate-200 rounded-full px-2 py-0.5 bg-white disabled:opacity-50'
                          >
                            {STATUSES.map((s) => <option key={s.value} value={s.value}>{t(s.labelKey, s.fallback)}</option>)}
                          </select>
                        )}
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
                  <button type="button"
                    onClick={() => handleView(requirement)}
                    className='p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200'
                    title={t('buyerRequirements.viewRequirement')}
                  >
                    <HiEye className='w-4 h-4' />
                  </button>
                  <button type="button"
                    onClick={() => handleShowMatches(requirement)}
                    className='p-2 text-violet-600 hover:bg-violet-50 rounded-lg transition-colors border border-violet-200'
                    title={t('buyerRequirements.findMatchingProperties')}
                  >
                    <HiSparkles className='w-4 h-4' />
                  </button>
                  {!isBuyerViewMode && (
                    <>
                      {canUpdateBuyer && <button type="button"
                        onClick={() => handleEdit(requirement)}
                        className='p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200'
                        title={t('buyerRequirements.editRequirement')}
                      >
                        <HiPencil className='w-4 h-4' />
                      </button>}
                      {canDeleteBuyer && <button type="button"
                        onClick={() => setPendingDelete(requirement._id)}
                        className='p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-rose-200'
                        title={t('buyerRequirements.deleteRequirement')}
                      >
                        <HiTrash className='w-4 h-4' />
                      </button>}
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}

          {!listLoading && !error && total > 0 && (
            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              pageSizes={[10, 20, 50]}
              onPageChange={(n) => { setPage(n); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
            />
          )}
        </div>
      </div>
      <ConfirmDialog
        open={pendingBulkDelete}
        title={t('buyerRequirements.deleteSelected', { defaultValue: 'Delete {{count}} buyer requirements?', count: selected.size })}
        description={t('buyerRequirements.thisCannotBeUndone')}
        confirmLabel={t('buyerRequirements.delete')}
        onConfirm={() => { setPendingBulkDelete(false); runBulk('delete'); }}
        onCancel={() => setPendingBulkDelete(false)}
      />
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

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { apiClient, normalizeImageUrl } from '../utils/http';
import { formatListingPrice, formatNumber, isPlaceholderPrice, formatCurrency as formatMoney, formatDate } from '../utils/currency';
import BulkActionBar, { BulkSelect, BulkButton } from '../components/BulkActionBar';
import ShareLinksDialog from '../components/ShareLinksDialog';
import DeletedListingsDialog from '../components/DeletedListingsDialog';
import { toCsv, downloadTextFile } from '../utils/spreadsheet';
import { localDateString } from '../utils/localDate';
import { useNotification } from '../contexts/NotificationContext';
import { useBuyerView } from '../contexts/BuyerViewContext';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import SavedViewsBar from '../components/SavedViewsBar';
import SharePropertiesDialog from '../components/SharePropertiesDialog';
import { HiPlus, HiOfficeBuilding, HiOutlineUpload, HiOutlineShare, HiX } from 'react-icons/hi';
import { PageHeader, Button, EmptyState, Modal } from '../design-system';
import { useTranslation } from 'react-i18next';
import { LISTING_STATUS_LABELS, listingStatusLabel } from '../utils/listingStatus';

const PAGE_SIZE = 50;

const VIEW_TABS = [
  { id: 'table', label: 'Main table' },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'cards', label: 'Cards' },
  { id: 'map', label: 'Map' },
];

const STATUS_ORDER = ['available', 'under_negotiation', 'sold', 'rented'];
// Names come from utils/listingStatus.js so every view agrees.
const STATUS_LABEL = LISTING_STATUS_LABELS;

const STATUS_STYLE = {
  available: { stripe: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  under_negotiation: { stripe: 'bg-amber-500', pill: 'bg-amber-50 text-amber-800 border-amber-200' },
  sold: { stripe: 'bg-slate-500', pill: 'bg-slate-100 text-slate-800 border-slate-200' },
  rented: { stripe: 'bg-purple-500', pill: 'bg-purple-50 text-purple-800 border-purple-200' },
};


function classNames(...xs) {
  return xs.filter(Boolean).join(' ');
}

const formatCurrency = formatListingPrice;

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

export default function PropertiesBoard() {
  const { t } = useTranslation();
  const { currentUser } = useSelector((state) => state.user);
  const { isBuyerViewMode } = useBuyerView();
  const [searchParams, setSearchParams] = useSearchParams();

  const view = searchParams.get('view') || 'table';
  const q = searchParams.get('q') || '';
  const status = searchParams.get('status') || '';
  const assignedAgent = searchParams.get('assignedAgent') || '';
  const ownerId = searchParams.get('ownerId') || '';
  const city = searchParams.get('city') || '';
  const locality = searchParams.get('locality') || '';
  const minPrice = searchParams.get('minPrice') || '';
  const maxPrice = searchParams.get('maxPrice') || '';
  const minBedrooms = searchParams.get('minBedrooms') || '';
  const minBathrooms = searchParams.get('minBathrooms') || '';
  const furnished = searchParams.get('furnished') || '';
  const parking = searchParams.get('parking') || '';
  const offer = searchParams.get('offer') || '';
  const propertyCategory = searchParams.get('propertyCategory') || '';
  const propertyType = searchParams.get('propertyType') || '';
  const category = searchParams.get('category') || '';
  const type = searchParams.get('type') || '';

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [quickView, setQuickView] = useState(null);
  const [agents, setAgents] = useState([]);
  const [owners, setOwners] = useState([]);
  const [filesQ, setFilesQ] = useState('');
  // Counts across the WHOLE filtered set. The pipeline columns and the map used
  // to be built from `items`, which holds one 50-row page — so a column header
  // counted a page sample and presented it as the total.
  const [facets, setFacets] = useState(null);
  const [dragOverStatus, setDragOverStatus] = useState('');
  // Properties picked for a share link. The book is not public, so this is the
  // only way anything in it reaches someone outside the agency.
  const [selectedToShare, setSelectedToShare] = useState([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [linksOpen, setLinksOpen] = useState(false);
  const [binOpen, setBinOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  // For the Filters panel: pick a category / property type instead of typing
  // its slug.
  const [filterCategories, setFilterCategories] = useState([]);
  const [filterTypes, setFilterTypes] = useState([]);
  useEffect(() => {
    let alive = true;
    const unwrap = (r) => (Array.isArray(r) ? r : r?.data || []);
    Promise.all([
      apiClient.get('/category/list', { silent: true }).catch(() => []),
      apiClient.get('/property-types/list', { silent: true }).catch(() => []),
    ]).then(([cats, types]) => {
      if (!alive) return;
      setFilterCategories(unwrap(cats));
      setFilterTypes(unwrap(types));
    });
    return () => { alive = false; };
  }, []);
  // Row selection for Share / bulk actions / export. Share used to send every
  // property in the current results, with no way to choose.
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const { showSuccess, showError: toastError } = useNotification();
  // Inline editing: { id: listingId, field: 'status'|'agent'|'owner' }
  const [editingCell, setEditingCell] = useState(null);

  // Close inline dropdown on outside click
  const closeInlineEdit = useCallback((e) => {
    if (editingCell && !e.target.closest('[data-inline-dropdown]')) {
      setEditingCell(null);
    }
  }, [editingCell]);
  useEffect(() => {
    if (editingCell) document.addEventListener('mousedown', closeInlineEdit);
    return () => document.removeEventListener('mousedown', closeInlineEdit);
  }, [editingCell, closeInlineEdit]);

  const canAccess = useMemo(() => {
    if (!currentUser) return false;
    if (isBuyerViewMode) return false;
    return currentUser.role === 'admin' || currentUser.role === 'employee';
  }, [currentUser, isBuyerViewMode]);

  function setParam(key, value) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  }

  const getCurrentQueryString = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('view');
    return next.toString();
  };

  const applyQueryString = (qs) => {
    const next = new URLSearchParams(String(qs || ''));
    const keepView = searchParams.get('view');
    if (keepView) next.set('view', keepView);
    setSearchParams(next);
  };

  function clearAllFilters() {
    const next = new URLSearchParams(searchParams);
    ['q', 'status', 'assignedAgent', 'ownerId', 'city', 'locality', 'minPrice', 'maxPrice', 'minBedrooms', 'minBathrooms', 'furnished', 'parking', 'offer', 'propertyCategory', 'propertyType', 'category', 'type'].forEach(
      (k) => next.delete(k)
    );
    setSearchParams(next);
  }

  /**
   * Every filter currently narrowing the list, as removable chips.
   *
   * A board can carry eight filters at once across a search box, four selects
   * and a slide-over panel, and none of them are visible together — so an empty
   * result looks like an empty database. Naming them, and letting each be lifted
   * on its own, is what turns "nothing here" into something a person can act on.
   */
  const activeFilters = useMemo(() => {
    const agentName = (id) => agents.find((a) => a._id === id)?.username || 'agent';
    const ownerName = (id) => owners.find((o) => o._id === id)?.name || 'owner';
    const chips = [
      q && { key: 'q', label: `“${q}”` },
      status && { key: 'status', label: STATUS_LABEL[status] || status },
      assignedAgent && {
        key: 'assignedAgent',
        label: assignedAgent === 'unassigned' ? 'Unassigned' : agentName(assignedAgent),
      },
      ownerId && { key: 'ownerId', label: ownerName(ownerId) },
      category && { key: 'category', label: category },
      type && { key: 'type', label: type },
      propertyCategory && { key: 'propertyCategory', label: propertyCategory },
      propertyType && { key: 'propertyType', label: propertyType },
      city && { key: 'city', label: city },
      locality && { key: 'locality', label: locality },
      (minPrice || maxPrice) && {
        key: 'price',
        label: `${minPrice ? formatCurrency(Number(minPrice)) : 'any'} – ${maxPrice ? formatCurrency(Number(maxPrice)) : 'any'}`,
        clears: ['minPrice', 'maxPrice'],
      },
      minBedrooms && { key: 'minBedrooms', label: `${minBedrooms}+ beds` },
      minBathrooms && { key: 'minBathrooms', label: `${minBathrooms}+ baths` },
      furnished === 'true' && { key: 'furnished', label: 'Furnished' },
      parking === 'true' && { key: 'parking', label: 'Parking' },
      offer === 'true' && { key: 'offer', label: 'On offer' },
    ].filter(Boolean);
    return chips;
  }, [
    q, status, assignedAgent, ownerId, category, type, propertyCategory, propertyType,
    city, locality, minPrice, maxPrice, minBedrooms, minBathrooms, furnished, parking, offer,
    agents, owners,
  ]);

  function clearFilter(chip) {
    const next = new URLSearchParams(searchParams);
    (chip.clears || [chip.key]).forEach((k) => next.delete(k));
    setSearchParams(next);
  }

  const query = useMemo(() => {
    const params = new URLSearchParams();

    // /listing/get supports searchTerm, /listing/my-assigned does not.
    // We only send searchTerm for admin view; for employee we filter client-side.
    if (status) params.set('status', status);
    if (assignedAgent) params.set('assignedAgent', assignedAgent);
    if (ownerId) params.set('ownerId', ownerId);
    if (city) params.set('city', city);
    if (locality) params.set('locality', locality);
    if (propertyCategory) params.set('propertyCategory', propertyCategory);
    if (propertyType) params.set('propertyType', propertyType);
    if (category) params.set('category', category);
    if (type) params.set('type', type);
    if (minPrice) params.set('minPrice', minPrice);
    if (maxPrice) params.set('maxPrice', maxPrice);
    if (minBedrooms) params.set('minBedrooms', minBedrooms);
    if (minBathrooms) params.set('minBathrooms', minBathrooms);
    if (furnished) params.set('furnished', furnished);
    if (parking) params.set('parking', parking);
    if (offer) params.set('offer', offer);

    params.set('populate', 'agent,owners');

    params.set('limit', String(PAGE_SIZE));
    params.set('startIndex', String(page * PAGE_SIZE));

    return `?${params.toString()}`;
  }, [
    assignedAgent,
    category,
    city,
    furnished,
    locality,
    maxPrice,
    minBathrooms,
    minBedrooms,
    minPrice,
    offer,
    ownerId,
    page,
    parking,
    propertyCategory,
    propertyType,
    status,
    type,
  ]);

  // Reset to the first page whenever filters change (not on page changes themselves)
  useEffect(() => {
    setPage(0);
  }, [
    assignedAgent,
    category,
    city,
    furnished,
    locality,
    maxPrice,
    minBathrooms,
    minBedrooms,
    minPrice,
    offer,
    ownerId,
    parking,
    propertyCategory,
    propertyType,
    q,
    status,
    type,
  ]);

  const adminQuery = useMemo(() => {
    const params = new URLSearchParams(query.replace(/^\?/, ''));
    if (q) params.set('searchTerm', q);
    return `?${params.toString()}`;
  }, [q, query]);

  useEffect(() => {
    if (!canAccess) return;

    let mounted = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        // Employee: assigned-only
        // Admin: show all (can still filter by assignedAgent etc later)
        const isEmployee = currentUser?.role === 'employee';
        const endpoint = isEmployee ? `/listing/my-assigned${adminQuery}` : `/listing/get${adminQuery}`;
        const data = await apiClient.get(endpoint);

        // sendSuccessResponse returns: { success, message, data }
        const listings = data?.data?.listings || [];
        let normalized = Array.isArray(listings) ? listings : [];

        if (!mounted) return;
        setItems(normalized);
        const pagination = data?.data?.pagination;
        setTotalCount(pagination?.total ?? normalized.length);
        setHasMore(Boolean(pagination?.hasMore));

        // Same filters, minus paging — so the counts always describe the rows.
        const facetQs = new URLSearchParams(adminQuery.replace(/^\?/, ''));
        ['limit', 'startIndex', 'populate'].forEach((k) => facetQs.delete(k));
        apiClient
          .get(`/listing/facets?${facetQs}`, { silent: true })
          .then((res) => { if (mounted) setFacets(res?.data || null); })
          .catch(() => { if (mounted) setFacets(null); });
      } catch (e) {
        if (!mounted) return;
        setItems([]);
        setTotalCount(0);
        setHasMore(false);
        setError(e?.message || 'Failed to load properties');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [adminQuery, canAccess, currentUser?.role]);

  async function reload() {
    const isEmployee = currentUser?.role === 'employee';
    const endpoint = isEmployee ? `/listing/my-assigned${adminQuery}` : `/listing/get${adminQuery}`;
    const data = await apiClient.get(endpoint);
    const listings = data?.data?.listings || [];
    setItems(Array.isArray(listings) ? listings : []);
  }

  async function updateStatus(listingId, toStatus) {
    try {
      await apiClient.post(`/listing/update/${listingId}`, { status: toStatus });
      await reload();
      showSuccess(`Marked ${listingStatusLabel(toStatus).toLowerCase()}.`);
    } catch (e) {
      setError(e?.message || 'Failed to update status');
    }
  }

  const selectedItems = items.filter((x) => selectedIds.has(x._id));
  const toggleSelected = (id) => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allSelected = items.length > 0 && items.every((x) => selectedIds.has(x._id));
  const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(items.map((x) => x._id)));

  // One request per property: there is no bulk endpoint, and the per-listing
  // routes carry the permission checks (an employee only changes their own).
  async function runBulk(label, fn) {
    const targets = selectedItems;
    if (!targets.length) return;
    setBulkBusy(true);
    let ok = 0;
    let failed = 0;
    for (const x of targets) {
      try { await fn(x); ok += 1; } catch { failed += 1; }
    }
    setBulkBusy(false);
    try { await reload(); } catch { /* the list keeps what it had */ }
    setSelectedIds(new Set());
    if (ok) showSuccess(`${label}: ${ok} propert${ok === 1 ? 'y' : 'ies'}.`);
    if (failed) toastError(`${failed} could not be changed. You can only change properties you added or that are assigned to you.`);
  }

  function exportCsv(rows) {
    const grid = [
      ['Name', 'Status', 'For', 'Property type', 'Price', 'Offer price', 'Address', 'Locality', 'City', 'State', 'Pincode', 'Bedrooms', 'Bathrooms', 'Agent', 'Owner', 'Added'],
      ...rows.map((x) => [
        x.name, listingStatusLabel(x.status), x.type === 'rent' ? 'Rent' : x.type === 'lease' ? 'Lease' : 'Sale',
        x.propertyType || '', Number(x.regularPrice) > 1 ? x.regularPrice : '', Number(x.discountPrice) > 0 ? x.discountPrice : '',
        x.address || '', x.locality || '', x.city || '', x.state || '', x.pincode || '',
        x.bedrooms || '', x.bathrooms || '', x.assignedAgent?.username || '',
        (x.ownerIds || []).map((o) => o?.name).filter(Boolean).join('; '),
        x.createdAt ? formatDate(x.createdAt) : '',
      ]),
    ];
    downloadTextFile(`properties-${localDateString()}.csv`, toCsv(grid));
    showSuccess(`Exported ${rows.length} propert${rows.length === 1 ? 'y' : 'ies'}.`);
  }

  // Inline update: status, agent, or owner — optimistic UI
  async function inlineUpdate(listingId, field, value) {
    setEditingCell(null);
    // Optimistic update
    setItems((prev) =>
      prev.map((it) => {
        if (it._id !== listingId) return it;
        if (field === 'status') return { ...it, status: value };
        if (field === 'agent') {
          const agent = agents.find((a) => a._id === value) || null;
          return { ...it, assignedAgent: agent ? { _id: agent._id, username: agent.username, avatar: agent.avatar } : null };
        }
        if (field === 'owner') {
          const owner = owners.find((o) => o._id === value) || null;
          return { ...it, ownerIds: owner ? [owner] : [] };
        }
        return it;
      })
    );

    try {
      if (field === 'status') {
        await apiClient.post(`/listing/update/${listingId}`, { status: value });
      } else if (field === 'agent') {
        if (value) {
          await apiClient.post('/listing/assign-agent', { listingId, agentId: value });
        } else {
          await apiClient.post('/listing/unassign-agent', { listingId });
        }
      } else if (field === 'owner') {
        await apiClient.post(`/listing/update/${listingId}`, { ownerIds: value ? [value] : [] });
      }
      showSuccess(
        field === 'status' ? `Marked ${listingStatusLabel(value).toLowerCase()}.`
          : field === 'agent' ? (value ? 'Agent assigned.' : 'Agent removed.')
            : (value ? 'Owner linked.' : 'Owner removed.')
      );
    } catch (e) {
      setError(e?.message || `Failed to update ${field}`);
      // Revert on error — refetch
      try {
        const isEmployee = currentUser?.role === 'employee';
        const endpoint = isEmployee ? `/listing/my-assigned${adminQuery}` : `/listing/get${adminQuery}`;
        const data = await apiClient.get(endpoint);
        const listings = data?.data?.listings || [];
        setItems(Array.isArray(listings) ? listings : []);
      } catch (_) {}
    }
  }

  function onDragStart(e, payload) {
    try {
      e.dataTransfer.setData('application/json', JSON.stringify(payload));
      e.dataTransfer.effectAllowed = 'move';
    } catch (_) {}
  }

  function onDragOver(e, statusId) {
    e.preventDefault();
    if (dragOverStatus !== statusId) setDragOverStatus(statusId);
    try {
      e.dataTransfer.dropEffect = 'move';
    } catch (_) {}
  }

  async function onDrop(e, statusId) {
    e.preventDefault();
    setDragOverStatus('');
    let payload = null;
    try {
      payload = JSON.parse(e.dataTransfer.getData('application/json') || 'null');
    } catch (_) {
      payload = null;
    }
    if (!payload?.listingId) return;
    if (!statusId || payload.fromStatus === statusId) return;
    await updateStatus(payload.listingId, statusId);
  }

  useEffect(() => {
    if (!canAccess) return;

    let mounted = true;
    (async () => {
      try {
        if (currentUser?.role === 'admin') {
          const userList = await apiClient.get('/user/list');
          const people = Array.isArray(userList) ? userList : [];
          if (mounted) {
            setAgents(
              people
                .filter((u) => u && (u.role === 'admin' || u.role === 'employee'))
                .map((u) => ({
                  _id: u._id,
                  username: u.username,
                  avatar: u.avatar,
                  role: u.role,
                }))
            );
          }
        } else {
          setAgents([]);
        }
      } catch (_) {
        if (mounted) setAgents([]);
      }

      try {
        const ownerList = await apiClient.get('/owner/list');
        const list = Array.isArray(ownerList) ? ownerList : [];
        if (mounted) {
          setOwners(
            list.map((o) => ({
              _id: o._id,
              name: o.name,
              email: o.email,
              phone: o.phone,
              companyName: o.companyName,
            }))
          );
        }
      } catch (_) {
        if (mounted) setOwners([]);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [canAccess, currentUser?.role]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const s of STATUS_ORDER) map.set(s, []);
    for (const it of items || []) {
      const s = it?.status || 'available';
      if (!map.has(s)) map.set(s, []);
      map.get(s).push(it);
    }
    return map;
  }, [items]);

  const columns = useMemo(() => {
    return STATUS_ORDER.map((s) => {
      const deals = (groups.get(s) || []).map((x) => ({
        id: x._id,
        title: x.name,
        city: x.city,
        locality: x.locality,
        price: x.regularPrice,
        image: Array.isArray(x.imageUrls) ? normalizeImageUrl(x.imageUrls[0]) : null,
        raw: x,
      }));

      const total = deals.reduce((acc, d) => acc + (Number(d.price) || 0), 0);
      // The true count for this status comes from the facets; `deals` is only
      // what fits on the current page. Showing the page length as the count is
      // what made a board with 600 properties report 50.
      const trueCount = facets?.status?.[s];
      return {
        id: s,
        label: STATUS_LABEL[s] || s,
        stripe: STATUS_STYLE[s]?.stripe || 'bg-slate-400',
        pill: STATUS_STYLE[s]?.pill || 'bg-slate-100 text-slate-700 border-slate-200',
        count: trueCount ?? deals.length,
        showing: deals.length,
        total,
        items: deals,
      };
    });
  }, [groups, facets]);

  const mapItems = useMemo(() => (items || []).filter((x) => x?.effectiveLocation?.lat && x?.effectiveLocation?.lng), [items]);
  const mapCenter = useMemo(() => {
    if (mapItems.length) return [Number(mapItems[0].effectiveLocation.lat), Number(mapItems[0].effectiveLocation.lng)];
    return [28.6139, 77.209];
  }, [mapItems]);

  const quickFiles = useMemo(() => {
    if (!quickView) return [];
    const x = quickView;
    const files = [];
    const urls = Array.isArray(x?.imageUrls) ? x.imageUrls.map(normalizeImageUrl) : [];
    urls.forEach((u, idx) => {
      if (!u) return;
      files.push({
        id: `img-${idx}`,
        kind: 'image',
        url: u,
        name: `Image ${idx + 1}`,
      });
    });
    if (x?.otherAttachment) {
      const name = String(x.otherAttachment).split('/').pop() || 'Attachment';
      files.push({ id: 'attachment', kind: 'file', url: x.otherAttachment, name });
    }
    const term = String(filesQ || '').trim().toLowerCase();
    if (!term) return files;
    return files.filter((f) => `${f.name} ${f.url}`.toLowerCase().includes(term));
  }, [quickView, filesQ]);

  /**
   * "You have no properties" and "no property matches these filters" call for
   * completely different advice, and the board used to give the first answer to
   * both — telling someone with eight filters applied to add their first
   * property. This decides which situation it actually is.
   */
  function BoardEmptyState() {
    if (loading) return null;

    if (activeFilters.length > 0) {
      return (
        <EmptyState
          icon={HiOfficeBuilding}
          title={t('properties.noPropertyMatchesTheseFilters')}
          body={
            activeFilters.length === 1
              ? 'Try lifting the filter above.'
              : `${activeFilters.length} filters are narrowing the list. Remove one or two and see what comes back.`
          }
          action={
            <Button variant='secondary' onClick={clearAllFilters}>{t('properties.clearAllFilters')}</Button>
          }
        />
      );
    }

    return (
      <EmptyState
        icon={HiOfficeBuilding}
        title={t('properties.noPropertiesYet')}
        body={t('properties.addOneByHandOrBring')}
        action={
          <div className='flex flex-wrap items-center justify-center gap-2'>
            <Link
              to='/create-listing'
              className='inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg font-medium bg-slate-900 text-white hover:bg-slate-800 transition-colors'
            >
              <HiPlus className='w-4 h-4' aria-hidden='true' />{t('properties.addAProperty')}</Link>
            {currentUser?.role === 'admin' && (
              <Link
                to='/admin/import'
                className='inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors'
              >
                <HiOutlineUpload className='w-4 h-4' aria-hidden='true' />{t('properties.importASpreadsheet')}</Link>
            )}
          </div>
        }
      />
    );
  }

  if (!canAccess) return null;

  return (
    <div className='space-y-4'>
      <PageHeader
        title={t('properties.properties')}
        description={`${totalCount} propert${totalCount === 1 ? 'y' : 'ies'}`}
        actions={
          <>
            {currentUser?.role === 'admin' && (
              <Link
                to='/admin/import'
                className='inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg font-medium border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1'
              >
                <HiOutlineUpload className='w-4 h-4' aria-hidden='true' />{t('properties.import')}</Link>
            )}
            <button
              type='button'
              onClick={() => { setSelectedToShare(selectedItems.length ? selectedItems : items); setShareOpen(true); }}
              disabled={items.length === 0}
              title={selectedItems.length ? `Share the ${selectedItems.length} selected` : 'Choose which properties to share'}
              className='inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg font-medium border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1'
            >
              <HiOutlineShare className='w-4 h-4' aria-hidden='true' />{t('properties.share')}</button>
            <button
              type='button'
              onClick={() => setLinksOpen(true)}
              className='inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg font-medium border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1'
            >
              {t('properties.sharedLinks')}
            </button>
            <button
              type='button'
              onClick={() => exportCsv(items)}
              disabled={items.length === 0}
              className='inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg font-medium border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1'
            >
              {t('properties.export')}
            </button>
            {currentUser?.role === 'admin' && (
              <button
                type='button'
                onClick={() => setBinOpen(true)}
                className='inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg font-medium border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1'
              >
                {t('properties.deleted')}
              </button>
            )}
            <Link
              to='/create-listing'
              className='inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg font-medium bg-slate-900 text-white hover:bg-slate-800 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1'
            >
              <HiPlus className='w-4 h-4' aria-hidden='true' />{t('properties.newProperty')}</Link>
          </>
        }
      />

      <SharePropertiesDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        listings={selectedToShare}
      />
      <ShareLinksDialog open={linksOpen} onClose={() => setLinksOpen(false)} />
      {currentUser?.role === 'admin' && (
        <DeletedListingsDialog open={binOpen} onClose={() => setBinOpen(false)} onRestored={() => reload().catch(() => {})} />
      )}

      <BulkActionBar count={selectedItems.length} onClear={() => setSelectedIds(new Set())}>
        <BulkSelect
          value=''
          disabled={bulkBusy}
          aria-label='Set status'
          onChange={(e) => { const v = e.target.value; if (v) runBulk(`Marked ${listingStatusLabel(v).toLowerCase()}`, (x) => apiClient.post(`/listing/update/${x._id}`, { status: v }, { silent: true })); }}
        >
          <option value=''>Set status…</option>
          {STATUS_ORDER.map((st) => <option key={st} value={st}>{listingStatusLabel(st)}</option>)}
        </BulkSelect>
        {currentUser?.role === 'admin' && (
          <BulkSelect
            value=''
            disabled={bulkBusy}
            aria-label='Assign agent'
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              if (v === '__none') runBulk('Unassigned', (x) => apiClient.post('/listing/unassign-agent', { listingId: x._id }, { silent: true }));
              else runBulk('Assigned', (x) => apiClient.post('/listing/assign-agent', { listingId: x._id, agentId: v }, { silent: true }));
            }}
          >
            <option value=''>Assign agent…</option>
            <option value='__none'>No agent</option>
            {agents.map((a) => <option key={a._id} value={a._id}>{a.username}</option>)}
          </BulkSelect>
        )}
        <BulkButton onClick={() => { setSelectedToShare(selectedItems); setShareOpen(true); }} disabled={bulkBusy}>Share</BulkButton>
        <BulkButton onClick={() => exportCsv(selectedItems)} disabled={bulkBusy}>Export</BulkButton>
        {currentUser?.role === 'admin' && (
          <BulkButton
            danger
            disabled={bulkBusy}
            onClick={() => {
              const n = selectedItems.length;
              if (window.confirm(`Delete ${n} propert${n === 1 ? 'y' : 'ies'}? This cannot be undone from here.`)) {
                runBulk('Deleted', (x) => apiClient.delete(`/listing/delete/${x._id}`, { silent: true }));
              }
            }}
          >
            Delete
          </BulkButton>
        )}
      </BulkActionBar>

      <div className='bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden'>
        {/* Two rows: view tabs and saved views, then the filters across the
            full width. On one row the filters were squeezed into a sliver. */}
        <div className='px-4 py-2.5 border-b border-slate-200 flex flex-wrap items-center gap-3'>
          <div className='order-1 flex items-center gap-1'>
            {VIEW_TABS.map((t) => (
              <button
                key={t.id}
                type='button'
                onClick={() => setParam('view', t.id)}
                aria-pressed={view === t.id}
                className={classNames(
                  'px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors',
                  view === t.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          

          <div className='order-3 basis-full flex flex-col md:flex-row md:flex-wrap md:items-center gap-2'>
            <div className='relative w-full md:w-[280px]'>
              <svg aria-hidden='true' className='w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none' fill='none' viewBox='0 0 24 24' stroke='currentColor'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' /></svg>
              <input
                className='w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-white text-sm outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all placeholder:text-slate-500'
                aria-label='Search properties'
                placeholder={t('properties.searchProperties')}
                value={q}
                onChange={(e) => setParam('q', e.target.value)}
              />
            </div>
            {/* Phones: the selects filled the whole first screen, so they sit
                behind this toggle; from md up they are always shown. */}
            <button
              type='button'
              onClick={() => setMobileFiltersOpen((v) => !v)}
              aria-expanded={mobileFiltersOpen}
              className='md:hidden w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700'
            >
              {mobileFiltersOpen ? 'Hide filters' : `Filters${activeFilters?.length ? ` (${activeFilters.length})` : ''}`}
            </button>
            <select
              className={`${mobileFiltersOpen ? '' : 'hidden'} md:block w-full md:w-auto px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all`}
              aria-label='Filter by status'
              value={status}
              onChange={(e) => setParam('status', e.target.value)}
            >
              <option value=''>{t('properties.allStatuses')}</option>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s] || s}
                </option>
              ))}
            </select>

            {currentUser?.role === 'admin' && (
              <select
                className={`${mobileFiltersOpen ? '' : 'hidden'} md:block w-full md:w-auto px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all`}
                aria-label='Filter by agent'
                value={assignedAgent}
                onChange={(e) => setParam('assignedAgent', e.target.value)}
              >
                <option value=''>{t('properties.allAgents')}</option>
                <option value='unassigned'>{t('properties.unassigned')}</option>
                {agents.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.username || a._id}
                  </option>
                ))}
              </select>
            )}

            <select
              className={`${mobileFiltersOpen ? '' : 'hidden'} md:block w-full md:w-auto px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all`}
              aria-label='Filter by owner'
              value={ownerId}
              onChange={(e) => setParam('ownerId', e.target.value)}
              disabled={owners.length === 0}
            >
              <option value=''>{t('properties.allOwners')}</option>
              {owners.map((o) => (
                <option key={o._id} value={o._id}>
                  {o.name || o._id}
                </option>
              ))}
            </select>

            <button
              type='button'
              onClick={() => setFiltersOpen(true)}
              className={`${mobileFiltersOpen ? 'flex' : 'hidden'} md:flex px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-sm font-medium items-center gap-1.5 transition-colors`}
            >
              <svg aria-hidden='true' className='w-4 h-4' fill='none' viewBox='0 0 24 24' stroke='currentColor'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z' /></svg>{t('properties.filters')}</button>
            {(q || status || assignedAgent || ownerId || city || locality || minPrice || maxPrice) && (
              <button
                type='button'
                onClick={clearAllFilters}
                className='px-3 py-2 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 text-sm font-medium transition-colors'
              >{t('properties.clearAll')}</button>
            )}
          </div>

          <div className='order-2 ml-auto w-full sm:w-auto'>
            <SavedViewsBar
              namespace='properties'
              getCurrentQueryString={getCurrentQueryString}
              onApplyQueryString={applyQueryString}
            />
          </div>
        </div>

        {/* What is actually narrowing the list. Without this a board filtered
            down to nothing is indistinguishable from an empty database. */}
        {activeFilters.length > 0 && (
          <div className='px-4 py-2.5 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center gap-1.5'>
            <span className='text-xs text-slate-500 mr-0.5'>
              Showing {formatNumber(totalCount)} matching
            </span>
            {activeFilters.map((chip) => (
              <button
                key={chip.key}
                type='button'
                onClick={() => clearFilter(chip)}
                title={`Remove this filter`}
                aria-label={`Remove filter: ${chip.label}`}
                className='group inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-md bg-white border border-slate-200 text-xs text-slate-700 hover:border-rose-300 hover:text-rose-700 transition-colors'
              >
                {chip.label}
                <HiX aria-hidden='true' className='w-3 h-3 text-slate-500 group-hover:text-rose-500' />
              </button>
            ))}
            <button
              type='button'
              onClick={clearAllFilters}
              className='text-xs text-slate-500 hover:text-rose-600 underline ml-1'
            >{t('properties.clearAll')}</button>
          </div>
        )}

        {error && (
          <div className='px-4 py-2.5 text-sm bg-rose-50 border-b border-rose-200 text-rose-700 flex items-center gap-2'>
            <svg aria-hidden='true' className='w-4 h-4 flex-shrink-0' fill='none' viewBox='0 0 24 24' stroke='currentColor'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' /></svg>
            {error}
          </div>
        )}
        {loading && (
          <div className='divide-y divide-slate-100'>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className='flex items-center gap-4 px-4 py-3 animate-pulse'>
                <div className='w-10 h-10 rounded-lg bg-slate-200 flex-shrink-0' />
                <div className='flex-1 space-y-2'>
                  <div className='h-3.5 bg-slate-200 rounded w-1/3' />
                  <div className='h-2.5 bg-slate-100 rounded w-1/4' />
                </div>
                <div className='h-3.5 bg-slate-200 rounded w-16' />
                <div className='h-3.5 bg-slate-200 rounded w-20' />
                <div className='h-6 bg-slate-100 rounded-full w-20' />
              </div>
            ))}
          </div>
        )}

        {view === 'table' && (
          <div className='overflow-x-auto'>
            <table className='min-w-full text-sm'>
              <thead className='bg-slate-50/80 sticky top-0 z-10'>
                <tr className='border-b border-slate-200'>
                  <th className='pl-4 pr-1 py-3 w-8'>
                    <input
                      type='checkbox'
                      aria-label='Select all'
                      checked={allSelected}
                      onChange={toggleAll}
                      className='w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500'
                    />
                  </th>
                  <th className='text-left pl-2 pr-2 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider w-[280px]'>{t('properties.property')}</th>
                  <th className='text-left px-3 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider'>{t('properties.location')}</th>
                  <th className='text-left px-3 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider'>{t('properties.type')}</th>
                  <th className='text-left px-3 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider'>{t('properties.price')}</th>
                  <th className='text-left px-3 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider'>{t('properties.agent')}</th>
                  <th className='text-left px-3 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider'>{t('properties.owner')}</th>
                  <th className='text-left px-3 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider'>{t('properties.status')}</th>
                  <th className='text-right px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider w-[100px]'></th>
                </tr>
              </thead>
              <tbody className='divide-y divide-slate-100'>
                {STATUS_ORDER.map((s) => {
                  const rows = groups.get(s) || [];
                  if (rows.length === 0) return null;
                  const stripe = STATUS_STYLE[s]?.stripe || 'bg-slate-300';
                  // Sale prices and monthly rents are different quantities; adding
                  // them gave a meaningless total.
                  const sumOf = (list) => list.reduce((acc, x) => acc + (isPlaceholderPrice(x.regularPrice) ? 0 : Number(x.regularPrice) || 0), 0);
                  const saleTotal = sumOf(rows.filter((x) => x.type !== 'rent'));
                  const rentTotal = sumOf(rows.filter((x) => x.type === 'rent'));
                  const totalLabel = [saleTotal > 0 && formatMoney(saleTotal), rentTotal > 0 && `${formatMoney(rentTotal)} / month`].filter(Boolean).join(' · ');

                  return (
                    <>{ }
                      <tr key={`${s}-header`}>
                        <td colSpan={9} className='px-0 py-0'>
                          <div className='flex items-center gap-3 px-4 py-2.5 bg-slate-50/60 border-y border-slate-200'>
                            <div className={`w-1 h-5 rounded-full ${stripe}`} />
                            <span className='text-[13px] font-bold text-slate-800'>{STATUS_LABEL[s] || s}</span>
                            <span className='text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full'>{rows.length}</span>
                            {totalLabel && <span className='text-xs text-slate-500 ml-auto'>{totalLabel}</span>}
                          </div>
                        </td>
                      </tr>

                      {rows.map((x) => {
                        const thumb = Array.isArray(x.imageUrls) && normalizeImageUrl(x.imageUrls[0]);
                        const ownerName = Array.isArray(x?.ownerIds) && x.ownerIds.length > 0 ? (x.ownerIds[0]?.name || 'Owner') : null;
                        const agentName = x?.assignedAgent?.username;
                        const pill = STATUS_STYLE[x.status || 'available']?.pill || 'bg-slate-100 text-slate-700 border-slate-200';
                        // The row opens the quick view from the keyboard too; keys pressed
                        // on the checkbox or an inline editor inside stay with that control.

                        return (
                          <tr
                            key={x._id}
                            className='group hover:bg-indigo-50/40 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500'
                            onClick={() => { setFilesQ(''); setQuickView(x); }}
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.target !== e.currentTarget) return;
                              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFilesQ(''); setQuickView(x); }
                            }}
                          >
                            <td className='pl-4 pr-1 py-2.5' onClick={(e) => e.stopPropagation()}>
                              <input
                                type='checkbox'
                                aria-label={`Select ${x.name}`}
                                checked={selectedIds.has(x._id)}
                                onChange={() => toggleSelected(x._id)}
                                className='w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500'
                              />
                            </td>
                            <td className='pl-2 pr-2 py-2.5'>
                              <div className='flex items-center gap-3'>
                                <div className='w-10 h-10 rounded-lg bg-slate-100 flex-shrink-0 overflow-hidden border border-slate-200'>
                                  {thumb ? (
                                    <img src={thumb} alt='' className='w-full h-full object-cover' loading='lazy' />
                                  ) : (
                                    <div className='w-full h-full flex items-center justify-center text-slate-300'>
                                      <svg aria-hidden='true' className='w-5 h-5' fill='none' viewBox='0 0 24 24' stroke='currentColor'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth={1.5} d='M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 0h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z' /></svg>
                                    </div>
                                  )}
                                </div>
                                <div className='min-w-0'>
                                  <div className='font-semibold text-slate-900 truncate text-[13px] group-hover:text-indigo-700 transition-colors'>{x.name}</div>
                                  {Boolean(x.bedrooms || x.bathrooms) && (
                                    <div className='text-[11px] text-slate-500 mt-0.5'>
                                      {x.bedrooms ? `${x.bedrooms} bed` : ''}{x.bedrooms && x.bathrooms ? ' · ' : ''}{x.bathrooms ? `${x.bathrooms} bath` : ''}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className='px-3 py-2.5'>
                              <div className='text-slate-700 text-[13px] truncate max-w-[200px]'>{x.city || '-'}</div>
                              {x.locality && <div className='text-[11px] text-slate-500 truncate'>{x.locality}</div>}
                            </td>
                            <td className='px-3 py-2.5'>
                              <span className='text-[12px] font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded-md'>{x.type === 'rent' ? 'Rent' : x.type === 'lease' ? 'Lease' : 'Sale'}</span>
                              {x.propertyType && <div className='text-[11px] text-slate-500 mt-1 capitalize truncate'>{String(x.propertyType).replace(/[-_]+/g, ' ')}</div>}
                            </td>
                            <td className='px-3 py-2.5'>
                              <div className='font-semibold text-slate-900 text-[13px]'>
                                {formatCurrency(x.regularPrice)}
                                {x.type === 'rent' && Number(x.regularPrice) > 1 && <span className='font-normal text-slate-500'> / month</span>}
                              </div>
                              {x.discountPrice > 0 && x.discountPrice < x.regularPrice && (
                                <div className='text-[11px] text-emerald-600 font-medium'>{formatCurrency(x.discountPrice)}</div>
                              )}
                            </td>
                            {/* Agent — inline editable */}
                            <td className='px-3 py-2.5'>
                              <div className='relative' data-inline-dropdown>
                                <button
                                  type='button'
                                  onClick={(e) => { e.stopPropagation(); setEditingCell(editingCell?.id === x._id && editingCell?.field === 'agent' ? null : { id: x._id, field: 'agent' }); }}
                                  className='flex items-center gap-2 rounded-lg px-2 py-1 -mx-2 -my-1 min-h-[36px] hover:bg-slate-100 transition-colors w-full text-left'
                                  title={t('properties.clickToAssignAgent')}
                                >
                                  {agentName ? (
                                    <>
                                      <div className='w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0'>
                                        {agentName[0]?.toUpperCase()}
                                      </div>
                                      <span className='text-[13px] text-slate-700 truncate'>{agentName}</span>
                                    </>
                                  ) : (
                                    <span className='text-[12px] text-slate-500 italic'>{t('properties.assign')}</span>
                                  )}
                                </button>
                                {editingCell?.id === x._id && editingCell?.field === 'agent' && (
                                  <div data-inline-dropdown className='absolute top-full left-0 mt-1 w-52 bg-white border border-slate-200 rounded-xl shadow-xl z-30 py-1 max-h-56 overflow-y-auto' onClick={(e) => e.stopPropagation()}>
                                    <button
                                      type='button'
                                      onClick={() => inlineUpdate(x._id, 'agent', null)}
                                      className='w-full text-left px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 italic'
                                    >{t('properties.unassigned')}</button>
                                    {agents.map((a) => (
                                      <button
                                        key={a._id}
                                        type='button'
                                        onClick={() => inlineUpdate(x._id, 'agent', a._id)}
                                        className={`w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 flex items-center gap-2 ${x.assignedAgent?._id === a._id ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-700'}`}
                                      >
                                        <div className='w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0'>
                                          {(a.username?.[0] || '?').toUpperCase()}
                                        </div>
                                        {a.username}
                                        {x.assignedAgent?._id === a._id && <svg aria-hidden='true' className='w-4 h-4 ml-auto text-indigo-600' fill='none' viewBox='0 0 24 24' stroke='currentColor'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M5 13l4 4L19 7' /></svg>}
                                      </button>
                                    ))}
                                    {agents.length === 0 && <div className='px-3 py-2 text-xs text-slate-500'>{t('properties.noAgentsAvailable')}</div>}
                                  </div>
                                )}
                              </div>
                            </td>
                            {/* Owner — inline editable */}
                            <td className='px-3 py-2.5'>
                              <div className='relative' data-inline-dropdown>
                                <button
                                  type='button'
                                  onClick={(e) => { e.stopPropagation(); setEditingCell(editingCell?.id === x._id && editingCell?.field === 'owner' ? null : { id: x._id, field: 'owner' }); }}
                                  className='rounded-lg px-2 py-1 -mx-2 -my-1 hover:bg-slate-100 transition-colors w-full text-left truncate block'
                                  title={t('properties.clickToAssignOwner')}
                                >
                                  {ownerName ? (
                                    <span className='text-[13px] text-slate-700 truncate block max-w-[140px]'>{ownerName}</span>
                                  ) : (
                                    <span className='text-[12px] text-slate-500 italic'>{t('properties.assign')}</span>
                                  )}
                                </button>
                                {editingCell?.id === x._id && editingCell?.field === 'owner' && (
                                  <div data-inline-dropdown className='absolute top-full left-0 mt-1 w-56 bg-white border border-slate-200 rounded-xl shadow-xl z-30 py-1 max-h-56 overflow-y-auto' onClick={(e) => e.stopPropagation()}>
                                    <button
                                      type='button'
                                      onClick={() => inlineUpdate(x._id, 'owner', null)}
                                      className='w-full text-left px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 italic'
                                    >{t('properties.noOwner')}</button>
                                    {owners.map((o) => {
                                      const isActive = Array.isArray(x?.ownerIds) && x.ownerIds.some((ow) => ow?._id === o._id);
                                      return (
                                        <button
                                          key={o._id}
                                          type='button'
                                          onClick={() => inlineUpdate(x._id, 'owner', o._id)}
                                          className={`w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 flex items-center gap-2 ${isActive ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-700'}`}
                                        >
                                          <span className='truncate'>{o.name || o.email || o._id}</span>
                                          {isActive && <svg aria-hidden='true' className='w-4 h-4 ml-auto text-indigo-600 flex-shrink-0' fill='none' viewBox='0 0 24 24' stroke='currentColor'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M5 13l4 4L19 7' /></svg>}
                                        </button>
                                      );
                                    })}
                                    {owners.length === 0 && <div className='px-3 py-2 text-xs text-slate-500'>{t('properties.noOwnersAvailable')}</div>}
                                  </div>
                                )}
                              </div>
                            </td>
                            {/* Status — inline editable */}
                            <td className='px-3 py-2.5'>
                              <div className='relative' data-inline-dropdown>
                                <button
                                  type='button'
                                  onClick={(e) => { e.stopPropagation(); setEditingCell(editingCell?.id === x._id && editingCell?.field === 'status' ? null : { id: x._id, field: 'status' }); }}
                                  className='rounded-lg px-1 py-0.5 -mx-1 -my-0.5 hover:bg-slate-100 transition-colors'
                                  title={t('properties.clickToChangeStatus')}
                                >
                                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border ${pill}`}>
                                    {listingStatusLabel(x.status)}
                                  </span>
                                </button>
                                {editingCell?.id === x._id && editingCell?.field === 'status' && (
                                  <div data-inline-dropdown className='absolute top-full left-0 mt-1 w-48 bg-white border border-slate-200 rounded-xl shadow-xl z-30 py-1' onClick={(e) => e.stopPropagation()}>
                                    {STATUS_ORDER.map((st) => {
                                      const stPill = STATUS_STYLE[st]?.pill || 'bg-slate-100 text-slate-700 border-slate-200';
                                      const stStripe = STATUS_STYLE[st]?.stripe || 'bg-slate-300';
                                      return (
                                        <button
                                          key={st}
                                          type='button'
                                          onClick={() => inlineUpdate(x._id, 'status', st)}
                                          className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2.5 ${x.status === st ? 'bg-slate-50 font-medium' : ''}`}
                                        >
                                          <div className={`w-2 h-2 rounded-full ${stStripe}`} />
                                          <span>{listingStatusLabel(st)}</span>
                                          {x.status === st && <svg aria-hidden='true' className='w-4 h-4 ml-auto text-indigo-600' fill='none' viewBox='0 0 24 24' stroke='currentColor'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M5 13l4 4L19 7' /></svg>}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className='px-4 py-2.5 text-right'>
                              <div className='flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity'>
                                <button
                                  type='button'
                                  onClick={(e) => { e.stopPropagation(); setFilesQ(''); setQuickView(x); }}
                                  className='p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'
                                  title={t('properties.quickView')}
                                  aria-label={t('properties.quickView')}
                                >
                                  <svg aria-hidden='true' className='w-4 h-4' fill='none' viewBox='0 0 24 24' stroke='currentColor'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M15 12a3 3 0 11-6 0 3 3 0 016 0z' /><path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z' /></svg>
                                </button>
                                <Link
                                  to={`/listing/${x._id}`}
                                  target='_blank'
                                  rel='noreferrer'
                                  onClick={(e) => e.stopPropagation()}
                                  className='p-1.5 rounded-lg text-slate-500 hover:text-brand-600 hover:bg-brand-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'
                                  title={t('properties.openInNewTab')}
                                  aria-label={t('properties.openInNewTab')}
                                >
                                  <svg aria-hidden='true' className='w-4 h-4' fill='none' viewBox='0 0 24 24' stroke='currentColor'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14' /></svg>
                                </Link>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </>
                  );
                })}

                {items.length === 0 && !loading && (
                  <tr>
                    <td colSpan={9}>
                      <BoardEmptyState />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Footer summary */}
            {items.length > 0 && (
              <div className='px-4 py-2.5 border-t border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2'>
                <span className='text-xs text-slate-500'>
                  Showing {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + items.length} of {totalCount} propert{totalCount === 1 ? 'y' : 'ies'}
                </span>
                <div className='flex items-center gap-3'>
                  {/* A sum of prices, so the plain currency format; sale prices only, since
                      adding monthly rents to them means nothing. */}
                  {(() => {
                    const saleSum = items.filter((x) => x.type !== 'rent').reduce((a, x) => a + (isPlaceholderPrice(x.regularPrice) ? 0 : Number(x.regularPrice) || 0), 0);
                    return saleSum > 0 ? (
                      <span className='text-xs text-slate-500'>{t('properties.pageTotalValue')} <span className='font-semibold text-slate-700'>{formatMoney(saleSum)}</span></span>
                    ) : null;
                  })()}
                  <div className='flex items-center gap-1'>
                    <button
                      type='button'
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0}
                      className='px-2.5 py-1 rounded-md text-xs font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors'
                    >{t('properties.prev')}</button>
                    <button
                      type='button'
                      onClick={() => setPage((p) => p + 1)}
                      disabled={!hasMore}
                      className='px-2.5 py-1 rounded-md text-xs font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors'
                    >{t('properties.next')}</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {view === 'pipeline' && items.length === 0 && !loading && (
          <BoardEmptyState />
        )}

        {view === 'pipeline' && (items.length > 0 || loading) && (
          <div className='overflow-x-auto'>
            <div className='min-w-[1100px] grid grid-cols-12 gap-3 p-4 bg-slate-50'>
              {columns.map((col) => (
                <div key={col.id} className='col-span-12 sm:col-span-6 lg:col-span-4 xl:col-span-3'>
                  <div className='rounded-2xl border border-slate-200 bg-white overflow-hidden'>
                    <div className='px-4 py-3 flex items-center justify-between border-b border-slate-200'>
                      <div className='flex items-center gap-3'>
                        <div className={`w-2 h-6 rounded-full ${col.stripe}`} />
                        <div>
                          <div className='font-bold text-slate-900'>{col.label}</div>
                          <div className='text-xs text-slate-500 mt-0.5'>
                            {col.showing < col.count
                              ? `${col.showing} of ${col.count}`
                              : `${col.count} item(s)`}
                            {' · '}
                            {formatCurrency(col.total)}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div
                      className={`p-3 space-y-3 transition-colors ${
                        dragOverStatus === col.id ? 'bg-slate-50/60' : ''
                      }`}
                      onDragOver={(e) => onDragOver(e, col.id)}
                      onDragLeave={() => setDragOverStatus('')}
                      onDrop={(e) => onDrop(e, col.id)}
                    >
                      {col.items.map((it) => (
                        <Link
                          key={it.id}
                          to={`/listing/${it.id}`}
                          target='_blank'
                          rel='noreferrer'
                          className='block rounded-xl border border-slate-200 bg-white hover:bg-slate-50 shadow-sm overflow-hidden cursor-grab active:cursor-grabbing'
                          draggable
                          onDragStart={(e) => onDragStart(e, { listingId: it.id, fromStatus: col.id })}
                        >
                          <div className='aspect-[16/9] bg-slate-100'>
                            {it.image ? (
                              <img
                                src={it.image}
                                alt=''
                                className='w-full h-full object-cover'
                                loading='lazy'
                              />
                            ) : (
                              <div className='w-full h-full flex items-center justify-center text-slate-600 text-sm'>{t('properties.noImage')}</div>
                            )}
                          </div>
                          <div className='p-3'>
                            <div className='font-semibold text-slate-900'>{it.title}</div>
                            <div className='text-xs text-slate-500 mt-1'>
                              {[it.city, it.locality].filter(Boolean).join(' · ') || '-'}
                            </div>
                            <div className='mt-2 flex items-center justify-between'>
                              <div className='text-sm font-semibold text-slate-800'>{formatCurrency(it.price)}</div>
                              <span className={`inline-flex items-center px-2 py-1 rounded-lg border text-[11px] font-semibold ${col.pill}`}>
                                {col.id}
                              </span>
                            </div>
                          </div>
                        </Link>
                      ))}
                      {col.items.length === 0 && <div className='text-sm text-slate-500 px-1 py-2'>{t('properties.noItems')}</div>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === 'cards' && (
          <div className='p-4 bg-slate-50'>
            <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3'>
              {items.map((x) => (
                <button
                  key={x._id}
                  type='button'
                  onClick={() => {
                    setFilesQ('');
                    setQuickView(x);
                  }}
                  className='text-left rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 shadow-sm overflow-hidden'
                >
                  <div className='aspect-[16/9] bg-slate-100'>
                    {Array.isArray(x.imageUrls) && x.imageUrls[0] ? (
                      <img
                        src={normalizeImageUrl(x.imageUrls[0])}
                        alt=''
                        className='w-full h-full object-cover'
                        loading='lazy'
                      />
                    ) : (
                      <div className='w-full h-full flex items-center justify-center text-slate-600 text-sm'>{t('properties.noImage')}</div>
                    )}
                  </div>
                  <div className='p-3'>
                    <div className='font-semibold text-slate-900'>{x.name}</div>
                    <div className='text-xs text-slate-500 mt-1'>
                      {[x.city, x.locality].filter(Boolean).join(' · ') || '-'}
                    </div>
                    <div className='mt-2 flex items-center justify-between'>
                      <div className='text-sm font-semibold text-slate-800'>{formatCurrency(x.regularPrice)}</div>
                      <span
                        className={classNames(
                          'inline-flex items-center px-2 py-1 rounded-lg border text-[11px] font-semibold',
                          STATUS_STYLE[x.status || 'available']?.pill || 'bg-slate-100 text-slate-700 border-slate-200'
                        )}
                      >
                        {listingStatusLabel(x.status)}
                      </span>
                    </div>
                  </div>
                </button>
              ))}

              {items.length === 0 && !loading && (
                <div className='col-span-full'><BoardEmptyState /></div>
              )}
            </div>
          </div>
        )}

        {view === 'map' && items.length === 0 && !loading && (
          <BoardEmptyState />
        )}

        {view === 'map' && (items.length > 0 || loading) && (
          <div className='p-4 bg-slate-50'>
            <div className='rounded-2xl border border-slate-200 bg-white overflow-hidden'>
              <div className='px-4 py-3 border-b border-slate-200 flex items-center justify-between'>
                <div className='font-semibold text-slate-900'>{t('properties.map')}</div>
                {/* Says plainly that the map shows this page, not the whole
                    set — a map of 50 pins beside a filter matching 600 reads as
                    "there are 50", which is the wrong thing to conclude. */}
                <div className='text-sm text-slate-600'>
                  {mapItems.length === 0
                    ? 'None of these have a location yet'
                    : totalCount > items.length
                      ? `${mapItems.length} of ${totalCount} shown — narrow the filters to map more`
                      : `${mapItems.length} propert${mapItems.length === 1 ? 'y' : 'ies'} on the map`}
                  {/* Otherwise the unplotted ones simply seemed not to exist. */}
                  {mapItems.length > 0 && items.length > mapItems.length && (
                    <span className='text-slate-500'>
                      {`. ${items.length - mapItems.length} more ha${items.length - mapItems.length === 1 ? 's' : 've'} no location; set one with Find on map in the property form.`}
                    </span>
                  )}
                </div>
              </div>
              <div className='h-[520px]'>
                <MapContainer center={mapCenter} zoom={11} className='h-full w-full'>
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
                  />
                  {mapItems.map((x) => (
                    <Marker key={x._id} position={[Number(x.effectiveLocation.lat), Number(x.effectiveLocation.lng)]}>
                      <Popup>
                        <div className='space-y-1'>
                          <div className='font-semibold'>{x.name}</div>
                          <div className='text-xs'>{[x.city, x.locality].filter(Boolean).join(' · ')}</div>
                          <div className='text-sm font-semibold'>{formatCurrency(x.regularPrice)}</div>
                          <button
                            type='button'
                            className='text-indigo-600 text-sm font-semibold'
                            onClick={() => {
                              setFilesQ('');
                              setQuickView(x);
                            }}
                          >{t('properties.quickView')}</button>
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              </div>
            </div>
          </div>
        )}
      </div>

      <Modal
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title={t('properties.advancedFilters')}
        description={t('properties.whereConditionValue')}
        size='2xl'
        footer={<Button onClick={() => setFiltersOpen(false)}>{t('properties.apply')}</Button>}
      >
            <div className='space-y-4'>
              <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
                <div>
                  <label htmlFor='pb-filter-city' className='block text-xs font-semibold text-slate-600 mb-1'>{t('properties.city')}</label>
                  <input
                    id='pb-filter-city'
                    value={city}
                    onChange={(e) => setParam('city', e.target.value)}
                    className='w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm'
                    placeholder={t('properties.eGDelhi')}
                  />
                </div>
                <div>
                  <label htmlFor='pb-filter-locality' className='block text-xs font-semibold text-slate-600 mb-1'>{t('properties.locality')}</label>
                  <input
                    id='pb-filter-locality'
                    value={locality}
                    onChange={(e) => setParam('locality', e.target.value)}
                    className='w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm'
                    placeholder={t('properties.eGDwarka')}
                  />
                </div>
                <div>
                  <label htmlFor='pb-filter-property-category' className='block text-xs font-semibold text-slate-600 mb-1'>{t('properties.category')}</label>
                  <select
                    id='pb-filter-property-category'
                    value={propertyCategory}
                    onChange={(e) => setParam('propertyCategory', e.target.value)}
                    className='w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm'
                  >
                    <option value=''>{t('properties.any')}</option>
                    <option value='residential'>{t('properties.residential')}</option>
                    <option value='commercial'>{t('properties.commercial')}</option>
                    <option value='land'>{t('properties.land')}</option>
                  </select>
                </div>
              </div>

              <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
                <div>
                  <label htmlFor='pb-filter-min-price' className='block text-xs font-semibold text-slate-600 mb-1'>{t('properties.minPrice')}</label>
                  <input
                    id='pb-filter-min-price'
                    value={minPrice}
                    onChange={(e) => setParam('minPrice', e.target.value)}
                    className='w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm'
                    placeholder={t('properties.eG5000000')}
                  />
                </div>
                <div>
                  <label htmlFor='pb-filter-max-price' className='block text-xs font-semibold text-slate-600 mb-1'>{t('properties.maxPrice')}</label>
                  <input
                    id='pb-filter-max-price'
                    value={maxPrice}
                    onChange={(e) => setParam('maxPrice', e.target.value)}
                    className='w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm'
                    placeholder={t('properties.eG15000000')}
                  />
                </div>
                <div>
                  <label htmlFor='pb-filter-property-type' className='block text-xs font-semibold text-slate-600 mb-1'>{t('properties.propertyType')}</label>
                  <select
                    id='pb-filter-property-type'
                    value={propertyType}
                    onChange={(e) => setParam('propertyType', e.target.value)}
                    className='w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm'
                  >
                    <option value=''>{t('properties.any')}</option>
                    {filterTypes.map((pt) => <option key={pt._id} value={pt.slug}>{pt.name}</option>)}
                  </select>
                </div>
              </div>

              <div className='grid grid-cols-1 md:grid-cols-4 gap-3'>
                <div>
                  <label htmlFor='pb-filter-min-bedrooms' className='block text-xs font-semibold text-slate-600 mb-1'>{t('properties.minBedrooms')}</label>
                  <input
                    id='pb-filter-min-bedrooms'
                    value={minBedrooms}
                    onChange={(e) => setParam('minBedrooms', e.target.value)}
                    className='w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm'
                    placeholder={t('properties.eG2')}
                  />
                </div>
                <div>
                  <label htmlFor='pb-filter-min-bathrooms' className='block text-xs font-semibold text-slate-600 mb-1'>{t('properties.minBathrooms')}</label>
                  <input
                    id='pb-filter-min-bathrooms'
                    value={minBathrooms}
                    onChange={(e) => setParam('minBathrooms', e.target.value)}
                    className='w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm'
                    placeholder={t('properties.eG2')}
                  />
                </div>
                <div>
                  <label htmlFor='pb-filter-furnished' className='block text-xs font-semibold text-slate-600 mb-1'>{t('properties.furnished')}</label>
                  <select
                    id='pb-filter-furnished'
                    value={furnished}
                    onChange={(e) => setParam('furnished', e.target.value)}
                    className='w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm'
                  >
                    <option value=''>{t('properties.any')}</option>
                    <option value='true'>{t('properties.yes')}</option>
                    <option value='false'>{t('properties.no')}</option>
                  </select>
                </div>
                <div>
                  <label htmlFor='pb-filter-parking' className='block text-xs font-semibold text-slate-600 mb-1'>{t('properties.parking')}</label>
                  <select
                    id='pb-filter-parking'
                    value={parking}
                    onChange={(e) => setParam('parking', e.target.value)}
                    className='w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm'
                  >
                    <option value=''>{t('properties.any')}</option>
                    <option value='true'>{t('properties.yes')}</option>
                    <option value='false'>{t('properties.no')}</option>
                  </select>
                </div>
              </div>

              <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
                <div>
                  <label htmlFor='pb-filter-offer' className='block text-xs font-semibold text-slate-600 mb-1'>{t('properties.offer')}</label>
                  <select
                    id='pb-filter-offer'
                    value={offer}
                    onChange={(e) => setParam('offer', e.target.value)}
                    className='w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm'
                  >
                    <option value=''>{t('properties.any')}</option>
                    <option value='true'>{t('properties.yes')}</option>
                    <option value='false'>{t('properties.no')}</option>
                  </select>
                </div>
                <div>
                  <label htmlFor='pb-filter-listing-type' className='block text-xs font-semibold text-slate-600 mb-1'>{t('properties.listingType')}</label>
                  <select
                    id='pb-filter-listing-type'
                    value={type}
                    onChange={(e) => setParam('type', e.target.value)}
                    className='w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm'
                  >
                    <option value=''>{t('properties.any')}</option>
                    <option value='sale'>{t('properties.sale')}</option>
                    <option value='rent'>{t('properties.rent')}</option>
                    <option value='lease'>{t('properties.lease')}</option>
                  </select>
                </div>
                <div>
                  <label htmlFor='pb-filter-category' className='block text-xs font-semibold text-slate-600 mb-1'>{t('properties.category')}</label>
                  <select
                    id='pb-filter-category'
                    value={category}
                    onChange={(e) => setParam('category', e.target.value)}
                    className='w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm'
                  >
                    <option value=''>{t('properties.any')}</option>
                    {filterCategories.map((c) => <option key={c._id} value={c.slug}>{c.name}</option>)}
                  </select>
                </div>
              </div>
            </div>
      </Modal>

      <Modal
        open={!!quickView}
        onClose={() => setQuickView(null)}
        title={quickView?.name}
        description={quickView ? ([quickView.address, quickView.city, quickView.locality].filter(Boolean).join(', ') || '-') : ''}
        size='2xl'
        className='max-w-5xl'
        footer={
          quickView && (
            <>
              <Button variant='secondary' onClick={() => setQuickView(null)}>{t('properties.close')}</Button>
              <Link
                to={`/listing/${quickView._id}`}
                target='_blank'
                rel='noreferrer'
                className='px-4 py-2 text-sm rounded-lg font-medium bg-slate-900 text-white hover:bg-slate-800 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1'
              >{t('properties.open')}</Link>
            </>
          )
        }
      >
        {quickView && (
            <div className='grid grid-cols-1 lg:grid-cols-3 -mx-6 -my-5'>
              <div className='lg:col-span-2 border-b lg:border-b-0 lg:border-r border-slate-200'>
                <div className='p-5 space-y-4'>
                  <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
                    <div className='rounded-2xl border border-slate-200 p-4'>
                      <div className='text-xs font-semibold text-slate-600'>{t('properties.price')}</div>
                      <div className='text-lg font-bold text-slate-900 mt-1'>{formatCurrency(quickView.regularPrice)}</div>
                    </div>
                    <div className='rounded-2xl border border-slate-200 p-4'>
                      <div className='text-xs font-semibold text-slate-600'>{t('properties.agent')}</div>
                      <div className='text-sm font-bold text-slate-900 mt-1'>
                        {quickView?.assignedAgent?.username || (quickView.assignedAgent ? 'Assigned' : '-')}
                      </div>
                    </div>
                    <div className='rounded-2xl border border-slate-200 p-4'>
                      <div className='text-xs font-semibold text-slate-600'>{t('properties.status')}</div>
                      <div className='mt-2'>
                        <span
                          className={classNames(
                            'inline-flex items-center px-2.5 py-1 rounded-lg border text-xs font-semibold',
                            STATUS_STYLE[quickView.status || 'available']?.pill || 'bg-slate-100 text-slate-700 border-slate-200'
                          )}
                        >
                          {quickView.status || 'available'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className='rounded-2xl border border-slate-200 overflow-hidden'>
                    <div className='px-4 py-3 border-b border-slate-200 flex items-center justify-between'>
                      <div className='font-semibold text-slate-900'>{t('properties.files')}</div>
                      <input
                        value={filesQ}
                        onChange={(e) => setFilesQ(e.target.value)}
                        className='px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:bg-white focus-visible:ring-2 focus-visible:ring-brand-500'
                        aria-label='Search files'
                        placeholder={t('properties.searchFiles')}
                      />
                    </div>
                    <div className='p-4 bg-slate-50'>
                      <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3'>
                        {quickFiles.map((f) => (
                          <a
                            key={f.id}
                            href={f.url}
                            target='_blank'
                            rel='noreferrer'
                            className='rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 overflow-hidden'
                          >
                            <div className='aspect-[16/10] bg-slate-100'>
                              {f.kind === 'image' ? (
                                <img src={f.url} alt={f.name} className='w-full h-full object-cover' loading='lazy' />
                              ) : (
                                <div className='w-full h-full flex items-center justify-center text-slate-500 text-sm font-semibold'>{t('properties.file')}</div>
                              )}
                            </div>
                            <div className='p-3'>
                              <div className='text-sm font-semibold text-slate-900 truncate'>{f.name}</div>
                              <div className='text-xs text-slate-500 mt-1 truncate'>{f.url}</div>
                            </div>
                          </a>
                        ))}
                        {quickFiles.length === 0 && (
                          <div className='col-span-full text-center text-slate-500 py-8'>{t('properties.noFilesFound')}</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {quickView.remarks && (
                    <div className='rounded-2xl border border-slate-200 p-4'>
                      <div className='text-xs font-semibold text-slate-600'>{t('properties.notes')}</div>
                      <div className='text-sm text-slate-800 mt-2 whitespace-pre-wrap'>{quickView.remarks}</div>
                    </div>
                  )}
                </div>
              </div>

              <div className='p-5 space-y-4'>
                <div className='rounded-2xl border border-slate-200 p-4'>
                  <div className='text-xs font-semibold text-slate-600'>{t('properties.owners')}</div>
                  {Array.isArray(quickView?.ownerIds) && quickView.ownerIds.length > 0 ? (
                    <div className='mt-2 space-y-2'>
                      {quickView.ownerIds.map((o) => (
                        <div key={o._id || o.email || o.name} className='rounded-xl border border-slate-200 bg-white p-3'>
                          <div className='font-semibold text-slate-900 text-sm'>{o.name || 'Owner'}</div>
                          <div className='text-xs text-slate-500 mt-1'>
                            {[o.companyName, o.email, o.phone].filter(Boolean).join(' · ') || '-'}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className='text-sm text-slate-500 mt-2'>{t('properties.noOwnersLinked')}</div>
                  )}
                </div>

                <div className='rounded-2xl border border-slate-200 p-4'>
                  <div className='text-xs font-semibold text-slate-600'>{t('properties.quickActions')}</div>
                  <div className='mt-3 space-y-2'>
                    <Link
                      to={`/update-listing/${quickView._id}`}
                      className='block px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-800'
                    >{t('properties.editProperty')}</Link>
                    <Link
                      to={`/listing/${quickView._id}`}
                      target='_blank'
                      rel='noreferrer'
                      className='block px-4 py-2.5 rounded-xl bg-slate-900 text-white hover:bg-slate-800 text-sm font-semibold'
                    >{t('properties.viewPublicPage')}</Link>
                  </div>
                </div>
              </div>
            </div>
        )}
      </Modal>
    </div>
  );
}

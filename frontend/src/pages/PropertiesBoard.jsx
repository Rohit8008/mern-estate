import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { apiClient, normalizeImageUrl } from '../utils/http';
import { useBuyerView } from '../contexts/BuyerViewContext';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import SavedViewsBar from '../components/SavedViewsBar';

const VIEW_TABS = [
  { id: 'table', label: 'Main table' },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'cards', label: 'Cards' },
  { id: 'map', label: 'Map' },
];

const STATUS_ORDER = ['available', 'under_negotiation', 'sold'];
const STATUS_LABEL = {
  available: 'New properties',
  under_negotiation: 'Negotiation',
  sold: 'Sold / Rented',
};

const STATUS_STYLE = {
  available: { stripe: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  under_negotiation: { stripe: 'bg-amber-500', pill: 'bg-amber-50 text-amber-800 border-amber-200' },
  sold: { stripe: 'bg-slate-500', pill: 'bg-slate-100 text-slate-800 border-slate-200' },
};


function classNames(...xs) {
  return xs.filter(Boolean).join(' ');
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

export default function PropertiesBoard() {
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

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [quickView, setQuickView] = useState(null);
  const [agents, setAgents] = useState([]);
  const [owners, setOwners] = useState([]);
  const [filesQ, setFilesQ] = useState('');
  const [dragOverStatus, setDragOverStatus] = useState('');
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

    params.set('limit', '50');
    params.set('startIndex', '0');

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
    parking,
    propertyCategory,
    propertyType,
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
      } catch (e) {
        if (!mounted) return;
        setItems([]);
        setError(e?.message || 'Failed to load properties');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [adminQuery, canAccess, currentUser?.role]);

  async function updateStatus(listingId, toStatus) {
    try {
      await apiClient.post(`/listing/update/${listingId}`, { status: toStatus });
      const isEmployee = currentUser?.role === 'employee';
      const endpoint = isEmployee ? `/listing/my-assigned${adminQuery}` : `/listing/get${adminQuery}`;
      const data = await apiClient.get(endpoint);
      const listings = data?.data?.listings || [];
      setItems(Array.isArray(listings) ? listings : []);
    } catch (e) {
      setError(e?.message || 'Failed to update status');
    }
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
      return {
        id: s,
        label: STATUS_LABEL[s] || s,
        stripe: STATUS_STYLE[s]?.stripe || 'bg-slate-400',
        pill: STATUS_STYLE[s]?.pill || 'bg-slate-100 text-slate-700 border-slate-200',
        count: deals.length,
        total,
        items: deals,
      };
    });
  }, [groups]);

  const mapItems = useMemo(() => (items || []).filter((x) => x?.location?.lat && x?.location?.lng), [items]);
  const mapCenter = useMemo(() => {
    if (mapItems.length) return [Number(mapItems[0].location.lat), Number(mapItems[0].location.lng)];
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

  if (!canAccess) return null;

  return (
    <div className='space-y-4'>
      <div className='flex flex-col md:flex-row md:items-center md:justify-between gap-4'>
        <div className='flex items-center gap-3'>
          <h1 className='text-xl font-bold text-slate-900'>Properties</h1>
          <span className='text-xs font-medium text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full'>
            {items.length}
          </span>
        </div>
        <div className='flex items-center gap-2'>
          <Link
            to='/create-listing'
            className='px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 text-sm font-medium flex items-center gap-2 shadow-sm transition-colors'
          >
            <svg className='w-4 h-4' fill='none' viewBox='0 0 24 24' stroke='currentColor'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 4v16m8-8H4' /></svg>
            New property
          </Link>
        </div>
      </div>

      <div className='bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden'>
        <div className='px-4 py-2.5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center gap-3'>
          <div className='flex items-center gap-1'>
            {VIEW_TABS.map((t) => (
              <button
                key={t.id}
                type='button'
                onClick={() => setParam('view', t.id)}
                className={classNames(
                  'px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors',
                  view === t.id ? 'bg-[#cce5ff] text-[#0073ea]' : 'text-slate-600 hover:bg-slate-100'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          
          <div className='h-6 w-px bg-slate-200 hidden lg:block' />

          <div className='flex flex-col md:flex-row md:items-center gap-2 flex-1'>
            <div className='relative w-full md:w-[280px]'>
              <svg className='w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none' fill='none' viewBox='0 0 24 24' stroke='currentColor'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' /></svg>
              <input
                className='w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-white text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-all placeholder:text-slate-400'
                placeholder='Search properties...'
                value={q}
                onChange={(e) => setParam('q', e.target.value)}
              />
            </div>
            <select
              className='w-full md:w-auto px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 outline-none transition-all'
              value={status}
              onChange={(e) => setParam('status', e.target.value)}
            >
              <option value=''>All statuses</option>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s] || s}
                </option>
              ))}
            </select>

            {currentUser?.role === 'admin' && (
              <select
                className='w-full md:w-auto px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 outline-none transition-all'
                value={assignedAgent}
                onChange={(e) => setParam('assignedAgent', e.target.value)}
              >
                <option value=''>All agents</option>
                <option value='unassigned'>Unassigned</option>
                {agents.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.username || a._id}
                  </option>
                ))}
              </select>
            )}

            <select
              className='w-full md:w-auto px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 outline-none transition-all'
              value={ownerId}
              onChange={(e) => setParam('ownerId', e.target.value)}
              disabled={owners.length === 0}
            >
              <option value=''>All owners</option>
              {owners.map((o) => (
                <option key={o._id} value={o._id}>
                  {o.name || o._id}
                </option>
              ))}
            </select>

            <button
              type='button'
              onClick={() => setFiltersOpen(true)}
              className='px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-sm font-medium flex items-center gap-1.5 transition-colors'
            >
              <svg className='w-4 h-4' fill='none' viewBox='0 0 24 24' stroke='currentColor'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z' /></svg>
              Filters
            </button>
            {(q || status || assignedAgent || ownerId || city || locality || minPrice || maxPrice) && (
              <button
                type='button'
                onClick={clearAllFilters}
                className='px-3 py-2 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 text-sm font-medium transition-colors'
              >
                Clear all
              </button>
            )}
          </div>

          <div className='w-full lg:w-auto'>
            <SavedViewsBar
              namespace='properties'
              getCurrentQueryString={getCurrentQueryString}
              onApplyQueryString={applyQueryString}
            />
          </div>
        </div>

        {error && (
          <div className='px-4 py-2.5 text-sm bg-rose-50 border-b border-rose-200 text-rose-700 flex items-center gap-2'>
            <svg className='w-4 h-4 flex-shrink-0' fill='none' viewBox='0 0 24 24' stroke='currentColor'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' /></svg>
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
                  <th className='text-left pl-4 pr-2 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider w-[280px]'>Property</th>
                  <th className='text-left px-3 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider'>Location</th>
                  <th className='text-left px-3 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider'>Type</th>
                  <th className='text-left px-3 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider'>Price</th>
                  <th className='text-left px-3 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider'>Agent</th>
                  <th className='text-left px-3 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider'>Owner</th>
                  <th className='text-left px-3 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider'>Status</th>
                  <th className='text-right px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider w-[100px]'></th>
                </tr>
              </thead>
              <tbody className='divide-y divide-slate-100'>
                {STATUS_ORDER.map((s) => {
                  const rows = groups.get(s) || [];
                  if (rows.length === 0) return null;
                  const stripe = STATUS_STYLE[s]?.stripe || 'bg-slate-300';
                  const totalPrice = rows.reduce((acc, x) => acc + (Number(x.regularPrice) || 0), 0);

                  return (
                    <>{/* eslint-disable-next-line react/jsx-key */}
                      <tr key={`${s}-header`}>
                        <td colSpan={8} className='px-0 py-0'>
                          <div className='flex items-center gap-3 px-4 py-2.5 bg-slate-50/60 border-y border-slate-200'>
                            <div className={`w-1 h-5 rounded-full ${stripe}`} />
                            <span className='text-[13px] font-bold text-slate-800'>{STATUS_LABEL[s] || s}</span>
                            <span className='text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full'>{rows.length}</span>
                            <span className='text-xs text-slate-400 ml-auto'>{formatCurrency(totalPrice)}</span>
                          </div>
                        </td>
                      </tr>

                      {rows.map((x) => {
                        const thumb = Array.isArray(x.imageUrls) && normalizeImageUrl(x.imageUrls[0]);
                        const ownerName = Array.isArray(x?.ownerIds) && x.ownerIds.length > 0 ? (x.ownerIds[0]?.name || 'Owner') : null;
                        const agentName = x?.assignedAgent?.username;
                        const pill = STATUS_STYLE[x.status || 'available']?.pill || 'bg-slate-100 text-slate-700 border-slate-200';

                        return (
                          <tr
                            key={x._id}
                            className='group hover:bg-blue-50/40 transition-colors cursor-pointer'
                            onClick={() => { setFilesQ(''); setQuickView(x); }}
                          >
                            <td className='pl-4 pr-2 py-2.5'>
                              <div className='flex items-center gap-3'>
                                <div className='w-10 h-10 rounded-lg bg-slate-100 flex-shrink-0 overflow-hidden border border-slate-200'>
                                  {thumb ? (
                                    <img src={thumb} alt='' className='w-full h-full object-cover' loading='lazy' />
                                  ) : (
                                    <div className='w-full h-full flex items-center justify-center text-slate-300'>
                                      <svg className='w-5 h-5' fill='none' viewBox='0 0 24 24' stroke='currentColor'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth={1.5} d='M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 0h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z' /></svg>
                                    </div>
                                  )}
                                </div>
                                <div className='min-w-0'>
                                  <div className='font-semibold text-slate-900 truncate text-[13px] group-hover:text-blue-700 transition-colors'>{x.name}</div>
                                  {(x.bedrooms || x.bathrooms) && (
                                    <div className='text-[11px] text-slate-400 mt-0.5'>
                                      {x.bedrooms ? `${x.bedrooms} bed` : ''}{x.bedrooms && x.bathrooms ? ' · ' : ''}{x.bathrooms ? `${x.bathrooms} bath` : ''}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className='px-3 py-2.5'>
                              <div className='text-slate-700 text-[13px] truncate max-w-[200px]'>{x.city || '-'}</div>
                              {x.locality && <div className='text-[11px] text-slate-400 truncate'>{x.locality}</div>}
                            </td>
                            <td className='px-3 py-2.5'>
                              <span className='text-[12px] font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded-md capitalize'>{x.propertyType || x.type || '-'}</span>
                            </td>
                            <td className='px-3 py-2.5'>
                              <div className='font-semibold text-slate-900 text-[13px]'>{formatCurrency(x.regularPrice)}</div>
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
                                  className='flex items-center gap-2 rounded-lg px-2 py-1 -mx-2 -my-1 hover:bg-slate-100 transition-colors w-full text-left'
                                  title='Click to assign agent'
                                >
                                  {agentName ? (
                                    <>
                                      <div className='w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0'>
                                        {agentName[0]?.toUpperCase()}
                                      </div>
                                      <span className='text-[13px] text-slate-700 truncate'>{agentName}</span>
                                    </>
                                  ) : (
                                    <span className='text-[12px] text-slate-400 italic'>+ Assign</span>
                                  )}
                                </button>
                                {editingCell?.id === x._id && editingCell?.field === 'agent' && (
                                  <div data-inline-dropdown className='absolute top-full left-0 mt-1 w-52 bg-white border border-slate-200 rounded-xl shadow-xl z-30 py-1 max-h-56 overflow-y-auto' onClick={(e) => e.stopPropagation()}>
                                    <button
                                      type='button'
                                      onClick={() => inlineUpdate(x._id, 'agent', null)}
                                      className='w-full text-left px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 italic'
                                    >
                                      Unassigned
                                    </button>
                                    {agents.map((a) => (
                                      <button
                                        key={a._id}
                                        type='button'
                                        onClick={() => inlineUpdate(x._id, 'agent', a._id)}
                                        className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center gap-2 ${x.assignedAgent?._id === a._id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700'}`}
                                      >
                                        <div className='w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0'>
                                          {(a.username?.[0] || '?').toUpperCase()}
                                        </div>
                                        {a.username}
                                        {x.assignedAgent?._id === a._id && <svg className='w-4 h-4 ml-auto text-blue-600' fill='none' viewBox='0 0 24 24' stroke='currentColor'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M5 13l4 4L19 7' /></svg>}
                                      </button>
                                    ))}
                                    {agents.length === 0 && <div className='px-3 py-2 text-xs text-slate-400'>No agents available</div>}
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
                                  title='Click to assign owner'
                                >
                                  {ownerName ? (
                                    <span className='text-[13px] text-slate-700 truncate block max-w-[140px]'>{ownerName}</span>
                                  ) : (
                                    <span className='text-[12px] text-slate-400 italic'>+ Assign</span>
                                  )}
                                </button>
                                {editingCell?.id === x._id && editingCell?.field === 'owner' && (
                                  <div data-inline-dropdown className='absolute top-full left-0 mt-1 w-56 bg-white border border-slate-200 rounded-xl shadow-xl z-30 py-1 max-h-56 overflow-y-auto' onClick={(e) => e.stopPropagation()}>
                                    <button
                                      type='button'
                                      onClick={() => inlineUpdate(x._id, 'owner', null)}
                                      className='w-full text-left px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 italic'
                                    >
                                      No owner
                                    </button>
                                    {owners.map((o) => {
                                      const isActive = Array.isArray(x?.ownerIds) && x.ownerIds.some((ow) => ow?._id === o._id);
                                      return (
                                        <button
                                          key={o._id}
                                          type='button'
                                          onClick={() => inlineUpdate(x._id, 'owner', o._id)}
                                          className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center gap-2 ${isActive ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700'}`}
                                        >
                                          <span className='truncate'>{o.name || o.email || o._id}</span>
                                          {isActive && <svg className='w-4 h-4 ml-auto text-blue-600 flex-shrink-0' fill='none' viewBox='0 0 24 24' stroke='currentColor'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M5 13l4 4L19 7' /></svg>}
                                        </button>
                                      );
                                    })}
                                    {owners.length === 0 && <div className='px-3 py-2 text-xs text-slate-400'>No owners available</div>}
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
                                  title='Click to change status'
                                >
                                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border capitalize ${pill}`}>
                                    {(x.status || 'available').replace('_', ' ')}
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
                                          <span className='capitalize'>{(STATUS_LABEL[st] || st).replace('_', ' ')}</span>
                                          {x.status === st && <svg className='w-4 h-4 ml-auto text-blue-600' fill='none' viewBox='0 0 24 24' stroke='currentColor'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M5 13l4 4L19 7' /></svg>}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className='px-4 py-2.5 text-right'>
                              <div className='flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity'>
                                <button
                                  type='button'
                                  onClick={(e) => { e.stopPropagation(); setFilesQ(''); setQuickView(x); }}
                                  className='p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors'
                                  title='Quick view'
                                >
                                  <svg className='w-4 h-4' fill='none' viewBox='0 0 24 24' stroke='currentColor'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M15 12a3 3 0 11-6 0 3 3 0 016 0z' /><path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z' /></svg>
                                </button>
                                <Link
                                  to={`/listing/${x._id}`}
                                  target='_blank'
                                  rel='noreferrer'
                                  onClick={(e) => e.stopPropagation()}
                                  className='p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors'
                                  title='Open in new tab'
                                >
                                  <svg className='w-4 h-4' fill='none' viewBox='0 0 24 24' stroke='currentColor'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14' /></svg>
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
                    <td className='px-4 py-16 text-center' colSpan={8}>
                      <div className='flex flex-col items-center gap-3'>
                        <div className='w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center'>
                          <svg className='w-6 h-6 text-slate-400' fill='none' viewBox='0 0 24 24' stroke='currentColor'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth={1.5} d='M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 0h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z' /></svg>
                        </div>
                        <p className='text-slate-500 text-sm'>No properties found</p>
                        <Link to='/create-listing' className='text-sm font-medium text-blue-600 hover:text-blue-700'>+ Add your first property</Link>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Footer summary */}
            {items.length > 0 && (
              <div className='px-4 py-2.5 border-t border-slate-200 bg-slate-50/50 flex items-center justify-between'>
                <span className='text-xs text-slate-500'>{items.length} propert{items.length === 1 ? 'y' : 'ies'} total</span>
                <span className='text-xs text-slate-500'>Total value: <span className='font-semibold text-slate-700'>{formatCurrency(items.reduce((a, x) => a + (Number(x.regularPrice) || 0), 0))}</span></span>
              </div>
            )}
          </div>
        )}

        {view === 'pipeline' && (
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
                            {col.count} item(s) · {formatCurrency(col.total)}
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
                                alt={it.title}
                                className='w-full h-full object-cover'
                                loading='lazy'
                              />
                            ) : (
                              <div className='w-full h-full flex items-center justify-center text-slate-400 text-sm'>No image</div>
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
                      {col.items.length === 0 && <div className='text-sm text-slate-500 px-1 py-2'>No items</div>}
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
                        alt={x.name}
                        className='w-full h-full object-cover'
                        loading='lazy'
                      />
                    ) : (
                      <div className='w-full h-full flex items-center justify-center text-slate-400 text-sm'>No image</div>
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
                        {x.status || 'available'}
                      </span>
                    </div>
                  </div>
                </button>
              ))}

              {items.length === 0 && !loading && (
                <div className='col-span-full text-center text-slate-500 py-10'>No properties found</div>
              )}
            </div>
          </div>
        )}

        {view === 'map' && (
          <div className='p-4 bg-slate-50'>
            <div className='rounded-2xl border border-slate-200 bg-white overflow-hidden'>
              <div className='px-4 py-3 border-b border-slate-200 flex items-center justify-between'>
                <div className='font-semibold text-slate-900'>Map</div>
                <div className='text-sm text-slate-600'>{mapItems.length} property(ies) with location</div>
              </div>
              <div className='h-[520px]'>
                <MapContainer center={mapCenter} zoom={11} className='h-full w-full'>
                  <TileLayer
                    attribution='&copy; OpenStreetMap contributors'
                    url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
                  />
                  {mapItems.map((x) => (
                    <Marker key={x._id} position={[Number(x.location.lat), Number(x.location.lng)]}>
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
                          >
                            Quick view
                          </button>
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

      {filtersOpen && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
          <button
            type='button'
            className='absolute inset-0 bg-black/30'
            onClick={() => setFiltersOpen(false)}
            aria-label='Close'
          />
          <div className='relative w-full max-w-3xl bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden'>
            <div className='px-5 py-4 border-b border-slate-200 flex items-center justify-between'>
              <div>
                <div className='text-lg font-bold text-slate-900'>Advanced filters</div>
                <div className='text-sm text-slate-600 mt-0.5'>Where / condition / value</div>
              </div>
              <button
                type='button'
                onClick={() => setFiltersOpen(false)}
                className='px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold'
              >
                Close
              </button>
            </div>

            <div className='p-5 space-y-4'>
              <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
                <div>
                  <label className='block text-xs font-semibold text-slate-600 mb-1'>City</label>
                  <input
                    value={city}
                    onChange={(e) => setParam('city', e.target.value)}
                    className='w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm'
                    placeholder='e.g. Delhi'
                  />
                </div>
                <div>
                  <label className='block text-xs font-semibold text-slate-600 mb-1'>Locality</label>
                  <input
                    value={locality}
                    onChange={(e) => setParam('locality', e.target.value)}
                    className='w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm'
                    placeholder='e.g. Dwarka'
                  />
                </div>
                <div>
                  <label className='block text-xs font-semibold text-slate-600 mb-1'>Category</label>
                  <select
                    value={propertyCategory}
                    onChange={(e) => setParam('propertyCategory', e.target.value)}
                    className='w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm'
                  >
                    <option value=''>Any</option>
                    <option value='residential'>Residential</option>
                    <option value='commercial'>Commercial</option>
                    <option value='land'>Land</option>
                  </select>
                </div>
              </div>

              <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
                <div>
                  <label className='block text-xs font-semibold text-slate-600 mb-1'>Min price</label>
                  <input
                    value={minPrice}
                    onChange={(e) => setParam('minPrice', e.target.value)}
                    className='w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm'
                    placeholder='e.g. 5000000'
                  />
                </div>
                <div>
                  <label className='block text-xs font-semibold text-slate-600 mb-1'>Max price</label>
                  <input
                    value={maxPrice}
                    onChange={(e) => setParam('maxPrice', e.target.value)}
                    className='w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm'
                    placeholder='e.g. 15000000'
                  />
                </div>
                <div>
                  <label className='block text-xs font-semibold text-slate-600 mb-1'>Property type</label>
                  <input
                    value={propertyType}
                    onChange={(e) => setParam('propertyType', e.target.value)}
                    className='w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm'
                    placeholder='e.g. apartment'
                  />
                </div>
              </div>

              <div className='grid grid-cols-1 md:grid-cols-4 gap-3'>
                <div>
                  <label className='block text-xs font-semibold text-slate-600 mb-1'>Min bedrooms</label>
                  <input
                    value={minBedrooms}
                    onChange={(e) => setParam('minBedrooms', e.target.value)}
                    className='w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm'
                    placeholder='e.g. 2'
                  />
                </div>
                <div>
                  <label className='block text-xs font-semibold text-slate-600 mb-1'>Min bathrooms</label>
                  <input
                    value={minBathrooms}
                    onChange={(e) => setParam('minBathrooms', e.target.value)}
                    className='w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm'
                    placeholder='e.g. 2'
                  />
                </div>
                <div>
                  <label className='block text-xs font-semibold text-slate-600 mb-1'>Furnished</label>
                  <select
                    value={furnished}
                    onChange={(e) => setParam('furnished', e.target.value)}
                    className='w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm'
                  >
                    <option value=''>Any</option>
                    <option value='true'>Yes</option>
                    <option value='false'>No</option>
                  </select>
                </div>
                <div>
                  <label className='block text-xs font-semibold text-slate-600 mb-1'>Parking</label>
                  <select
                    value={parking}
                    onChange={(e) => setParam('parking', e.target.value)}
                    className='w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm'
                  >
                    <option value=''>Any</option>
                    <option value='true'>Yes</option>
                    <option value='false'>No</option>
                  </select>
                </div>
              </div>

              <div className='grid grid-cols-1 md:grid-cols-4 gap-3'>
                <div>
                  <label className='block text-xs font-semibold text-slate-600 mb-1'>Offer</label>
                  <select
                    value={offer}
                    onChange={(e) => setParam('offer', e.target.value)}
                    className='w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm'
                  >
                    <option value=''>Any</option>
                    <option value='true'>Yes</option>
                    <option value='false'>No</option>
                  </select>
                </div>
                <div>
                  <label className='block text-xs font-semibold text-slate-600 mb-1'>Listing type</label>
                  <select
                    value={type}
                    onChange={(e) => setParam('type', e.target.value)}
                    className='w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm'
                  >
                    <option value=''>Any</option>
                    <option value='sale'>Sale</option>
                    <option value='rent'>Rent</option>
                  </select>
                </div>
                <div>
                  <label className='block text-xs font-semibold text-slate-600 mb-1'>Category slug</label>
                  <input
                    value={category}
                    onChange={(e) => setParam('category', e.target.value)}
                    className='w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm'
                    placeholder='e.g. apartment'
                  />
                </div>
                <div className='flex items-end justify-end'>
                  <button
                    type='button'
                    onClick={() => setFiltersOpen(false)}
                    className='px-4 py-2.5 rounded-xl bg-slate-900 text-white hover:bg-slate-800 text-sm font-semibold'
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {quickView && (
        <div className='fixed inset-0 z-[9999] flex items-center justify-center p-4'>
          <button
            type='button'
            className='absolute inset-0 bg-black/30'
            onClick={() => setQuickView(null)}
            aria-label='Close'
          />
          <div className='relative w-full max-w-5xl bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden'>
            <div className='px-5 py-4 border-b border-slate-200 flex items-center justify-between'>
              <div className='min-w-0'>
                <div className='text-lg font-bold text-slate-900 truncate'>{quickView.name}</div>
                <div className='text-sm text-slate-600 mt-0.5 truncate'>
                  {[quickView.address, quickView.city, quickView.locality].filter(Boolean).join(', ') || '-'}
                </div>
              </div>
              <div className='flex items-center gap-2'>
                <Link
                  to={`/listing/${quickView._id}`}
                  target='_blank'
                  rel='noreferrer'
                  className='px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold'
                >
                  Open
                </Link>
                <button
                  type='button'
                  onClick={() => setQuickView(null)}
                  className='px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold'
                >
                  Close
                </button>
              </div>
            </div>

            <div className='grid grid-cols-1 lg:grid-cols-3'>
              <div className='lg:col-span-2 border-b lg:border-b-0 lg:border-r border-slate-200'>
                <div className='p-5 space-y-4'>
                  <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
                    <div className='rounded-2xl border border-slate-200 p-4'>
                      <div className='text-xs font-semibold text-slate-600'>Price</div>
                      <div className='text-lg font-bold text-slate-900 mt-1'>{formatCurrency(quickView.regularPrice)}</div>
                    </div>
                    <div className='rounded-2xl border border-slate-200 p-4'>
                      <div className='text-xs font-semibold text-slate-600'>Agent</div>
                      <div className='text-sm font-bold text-slate-900 mt-1'>
                        {quickView?.assignedAgent?.username || (quickView.assignedAgent ? 'Assigned' : '-')}
                      </div>
                    </div>
                    <div className='rounded-2xl border border-slate-200 p-4'>
                      <div className='text-xs font-semibold text-slate-600'>Status</div>
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
                      <div className='font-semibold text-slate-900'>Files</div>
                      <input
                        value={filesQ}
                        onChange={(e) => setFilesQ(e.target.value)}
                        className='px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:bg-white'
                        placeholder='Search files'
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
                                <div className='w-full h-full flex items-center justify-center text-slate-500 text-sm font-semibold'>
                                  File
                                </div>
                              )}
                            </div>
                            <div className='p-3'>
                              <div className='text-sm font-semibold text-slate-900 truncate'>{f.name}</div>
                              <div className='text-xs text-slate-500 mt-1 truncate'>{f.url}</div>
                            </div>
                          </a>
                        ))}
                        {quickFiles.length === 0 && (
                          <div className='col-span-full text-center text-slate-500 py-8'>No files found</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {quickView.remarks && (
                    <div className='rounded-2xl border border-slate-200 p-4'>
                      <div className='text-xs font-semibold text-slate-600'>Notes</div>
                      <div className='text-sm text-slate-800 mt-2 whitespace-pre-wrap'>{quickView.remarks}</div>
                    </div>
                  )}
                </div>
              </div>

              <div className='p-5 space-y-4'>
                <div className='rounded-2xl border border-slate-200 p-4'>
                  <div className='text-xs font-semibold text-slate-600'>Owners</div>
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
                    <div className='text-sm text-slate-500 mt-2'>No owners linked</div>
                  )}
                </div>

                <div className='rounded-2xl border border-slate-200 p-4'>
                  <div className='text-xs font-semibold text-slate-600'>Quick actions</div>
                  <div className='mt-3 space-y-2'>
                    <Link
                      to={`/update-listing/${quickView._id}`}
                      className='block px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-800'
                    >
                      Edit property
                    </Link>
                    <Link
                      to={`/listing/${quickView._id}`}
                      target='_blank'
                      rel='noreferrer'
                      className='block px-4 py-2.5 rounded-xl bg-slate-900 text-white hover:bg-slate-800 text-sm font-semibold'
                    >
                      View public page
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

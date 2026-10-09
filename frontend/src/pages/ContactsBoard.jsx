import { useEffect, useId, useMemo, useRef, useState, useCallback } from 'react';
import ConfirmDialog from '../components/ConfirmDialog';
import EditConflictNotice from '../components/EditConflictNotice';
import { useSearchParams, Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { apiClient } from '../utils/http';
import { useBuyerView } from '../contexts/BuyerViewContext';
import {
  PageHeader, Button, Modal, Input, Select, Textarea,
  Thead, Th, Tbody, Checkbox, ColumnToggle, Pagination, EmptyState,
  Skeleton, SkeletonRows, useRowSelection, SearchBar,
} from '../design-system';
import { useColumnPrefs } from '../hooks/useColumnPrefs';
import {
  HiPlus, HiSearch, HiX, HiChevronDown, HiChevronRight,
  HiMail, HiPhone, HiCheck, HiPencil, HiTrash, HiRefresh,
  HiViewGrid, HiViewList, HiViewBoards, HiUser, HiCalendar, HiChat, HiUsers, HiEye, HiDownload,
} from 'react-icons/hi';
import { currencySymbol, getLocaleConfig, formatDate } from '../utils/currency';
import BulkActionBar, { BulkSelect, BulkButton } from '../components/BulkActionBar';
import { TagChip } from '../components/TagPicker';
import { TemperatureChip } from '../components/TemperatureControl';
import WhatsAppButton from '../components/WhatsAppButton';
import { fetchWithRefresh } from '../utils/http';
import { useNotification } from '../contexts/NotificationContext';
import { useTranslation } from 'react-i18next';
import { localDateString } from '../utils/localDate';

const STATUS_CONFIG = {
  lead: { label: 'Lead', color: 'bg-purple-500', textColor: 'text-purple-700', bgLight: 'bg-purple-50', border: 'border-purple-200' },
  contacted: { label: 'Contacted', color: 'bg-blue-500', textColor: 'text-blue-700', bgLight: 'bg-blue-50', border: 'border-blue-200' },
  qualified: { label: 'Qualified', color: 'bg-cyan-500', textColor: 'text-cyan-700', bgLight: 'bg-cyan-50', border: 'border-cyan-200' },
  proposal: { label: 'Proposal', color: 'bg-amber-500', textColor: 'text-amber-700', bgLight: 'bg-amber-50', border: 'border-amber-200' },
  negotiation: { label: 'Negotiation', color: 'bg-orange-500', textColor: 'text-orange-700', bgLight: 'bg-orange-50', border: 'border-orange-200' },
  won: { label: 'Won', color: 'bg-emerald-500', textColor: 'text-emerald-700', bgLight: 'bg-emerald-50', border: 'border-emerald-200' },
  lost: { label: 'Lost', color: 'bg-slate-400', textColor: 'text-slate-600', bgLight: 'bg-slate-50', border: 'border-slate-200' },
};

const STATUS_ORDER = ['lead', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];

/**
 * How many leads the cards and board views load. They group by status, and a
 * group split across pages would show a count that is only true for one page —
 * so those views load one large slice and say so when there is more, while the
 * table pages through everything.
 */
const GROUPED_VIEW_LIMIT = 200;

/** Parse `?sort=key:dir` into the shape <Th> expects. */
function parseSortParam(raw) {
  const [key, dir] = String(raw || '').split(':');
  return key ? { key, dir: dir === 'desc' ? 'desc' : 'asc' } : null;
}

export default function ContactsBoard() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentUser } = useSelector((state) => state.user);
  const { isBuyerViewMode } = useBuyerView();
  const { showSuccess, showError } = useNotification();
  const isAdmin = currentUser?.role === 'admin';

  // Data state
  const [contacts, setContacts] = useState([]);
  // The size of the whole filtered set, from the server — never the page in hand.
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // UI state
  const [view, setView] = useState('cards'); // 'cards' | 'table'
  const [selectedContact, setSelectedContact] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // `?new=1` — the ⌘K palette's "New …" action — opens the create form once,
  // then drops the flag so a reload or Back does not open it again.
  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    setShowCreateModal(true);
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const [agents, setAgents] = useState([]);
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [editConflict, setEditConflict] = useState(null); // { currentUpdatedAt, payload }
  const [savingEdit, setSavingEdit] = useState(false);
  const [creating, setCreating] = useState(false);
  // Set when the server answers 409 because the person is already on file:
  // the submitted form and the existing lead, so "Create anyway" can resend it.
  const [duplicateHit, setDuplicateHit] = useState(null);
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [showStatusDropdown, setShowStatusDropdown] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  // Filters
  const q = searchParams.get('q') || '';
  const statusFilter = searchParams.get('status') || '';
  const typeFilter = searchParams.get('contactType') || '';
  const temperatureFilter = searchParams.get('temperature') || '';
  const hasFilters = Boolean(q || statusFilter || typeFilter || temperatureFilter);

  // Table paging and order live in the URL with the filters, so a sorted,
  // paged list can be linked to and survives a refresh.
  const sortParam = searchParams.get('sort') || '';
  const sort = parseSortParam(sortParam);
  const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1);
  const isTable = view === 'table';

  /**
   * Rows picked for a bulk action — only rows on screen. A selection that has
   * been paged or filtered out of view is dropped, so a bulk change can never
   * reach a lead nobody can see.
   */
  const contactIds = useMemo(() => contacts.map((c) => c._id), [contacts]);
  const selection = useRowSelection(contactIds);

  const canAccess = useMemo(() => {
    if (!currentUser) return false;
    if (isBuyerViewMode) return false;
    return currentUser.role === 'admin' || currentUser.role === 'employee';
  }, [currentUser, isBuyerViewMode]);

  const fetchContacts = useCallback(async () => {
    if (!canAccess) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter) params.set('contactType', typeFilter);
      if (temperatureFilter) params.set('temperature', temperatureFilter);
      if (isTable) {
        params.set('page', String(page));
        params.set('limit', String(pageSize));
        if (sortParam) params.set('sort', sortParam);
      } else {
        // This used to be the only request, for every view: the first 200 leads
        // and no word about the rest, under a footer calling it the total.
        params.set('limit', String(GROUPED_VIEW_LIMIT));
      }
      const response = await apiClient.get(`/clients?${params.toString()}`);
      const data = response?.data || response || [];
      const rows = Array.isArray(data) ? data : [];
      setContacts(rows);
      setTotal(typeof response?.total === 'number' ? response.total : rows.length);
    } catch (e) {
      setError(e?.message || 'Failed to load contacts');
      setContacts([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [canAccess, q, statusFilter, typeFilter, temperatureFilter, isTable, page, pageSize, sortParam]);

  // Only an admin can reassign, so only an admin needs the list.
  useEffect(() => {
    if (currentUser?.role !== 'admin') return;
    apiClient
      .get('/user/list')
      .then((res) => {
        const users = Array.isArray(res) ? res : res?.data || [];
        // Only people who can own a lead.
        setAgents(users.filter((u) => ['admin', 'employee'].includes(u.role) && u.status === 'active'));
      })
      .catch(() => { /* the assign dropdown simply stays empty */ });
  }, [currentUser?.role]);

  /**
   * Move one lead to another status by dropping it in a column.
   *
   * Optimistic, because a drag that visibly snaps back while a request runs
   * feels broken; the list is refetched on failure to restore the truth.
   */
  const moveContactToStatus = async (id, status) => {
    const contact = contacts.find((c) => c._id === id);
    if (!contact || contact.status === status) return;

    setContacts((prev) => prev.map((c) => (c._id === id ? { ...c, status } : c)));

    try {
      await apiClient.patch(`/clients/${id}`, { status });
    } catch (err) {
      showError(err?.message || 'Could not move that lead');
      fetchContacts();
    }
  };

  /** One request for the whole selection, not one per row. */
  const applyBulk = async (action, value) => {
    const ids = [...selection.selected];
    if (!ids.length) return;

    try {
      const res = await apiClient.post('/clients/bulk', { ids, action, value });
      selection.clear();
      setPendingBulkDelete(false);
      showSuccess(`${res?.data?.modified ?? ids.length} updated`);
      fetchContacts();
    } catch (err) {
      showError(err?.message || 'Could not apply that change');
    }
  };

  /**
   * Export what is filtered, server-side.
   *
   * Via fetch rather than a link so the session cookie and the refresh-on-401
   * path apply; a plain <a href> would skip both.
   */
  const exportCsv = async () => {
    try {
      // The same filters the list is showing, so the file matches the screen.
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter) params.set('contactType', typeFilter);
      if (temperatureFilter) params.set('temperature', temperatureFilter);
      if (sortParam) params.set('sort', sortParam);

      const response = await fetchWithRefresh(`/api/clients/export?${params}`);
      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `leads-${localDateString()}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      showError(err?.message || 'Could not export');
    }
  };

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // Deleting the last rows of the last page leaves a page that no longer
  // exists; step back to the one that does rather than showing "no clients".
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  useEffect(() => {
    if (!loading && isTable && contacts.length === 0 && total > 0 && page > pageCount) {
      const next = new URLSearchParams(searchParams);
      next.set('page', String(pageCount));
      setSearchParams(next, { replace: true });
    }
  }, [loading, isTable, contacts.length, total, page, pageCount, searchParams, setSearchParams]);

  // Group contacts by status
  const groupedContacts = useMemo(() => {
    const groups = new Map();
    STATUS_ORDER.forEach((s) => groups.set(s, []));
    contacts.forEach((c) => {
      const status = c.status || 'lead';
      if (groups.has(status)) {
        groups.get(status).push(c);
      } else {
        groups.get('lead').push(c);
      }
    });
    return groups;
  }, [contacts]);

  // Any change to what is being looked at goes back to its first page —
  // page 4 of the old filter is not a meaningful place in the new one.
  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setSearchParams(next);
  };

  /** Clears the filters but keeps the chosen column order. */
  const clearFilters = () => {
    const next = new URLSearchParams();
    if (sortParam) next.set('sort', sortParam);
    setSearchParams(next);
  };

  /** Ascending, then descending, then back to the default order. */
  const toggleSort = (key) => {
    if (!sort || sort.key !== key) setParam('sort', `${key}:asc`);
    else if (sort.dir === 'asc') setParam('sort', `${key}:desc`);
    else setParam('sort', '');
  };

  const columns = useMemo(() => [
    { key: 'name', label: t('contacts.contact'), sortKey: 'name', locked: true },
    { key: 'email', label: t('contacts.email'), sortKey: 'email' },
    { key: 'phone', label: t('contacts.phone') },
    { key: 'status', label: t('contacts.status'), sortKey: 'status' },
    { key: 'temperature', label: t('contacts.temperature'), sortKey: 'temperature' },
    { key: 'score', label: t('contacts.score'), sortKey: 'score' },
    { key: 'nextFollowUp', label: t('contacts.nextFollowUp'), sortKey: 'nextFollowUp', defaultHidden: true },
    { key: 'notes', label: t('contacts.notes') },
    { key: 'createdAt', label: t('contacts.added'), sortKey: 'createdAt', defaultHidden: true },
  ], [t]);
  const columnPrefs = useColumnPrefs('clients', columns);
  const shownColumns = columnPrefs.visibleColumns;

  const toggleGroup = (status) => {
    setCollapsedGroups((prev) => ({ ...prev, [status]: !prev[status] }));
  };

  const handleCreateContact = async (formData, { force = false } = {}) => {
    setCreating(true);
    setError('');
    try {
      await apiClient.post(force ? '/clients?force=true' : '/clients', formData, { silent: true });
      setDuplicateHit(null);
      setShowCreateModal(false);
      await fetchContacts();
    } catch (e) {
      if (e?.statusCode === 409 && e?.details?.duplicate) {
        setDuplicateHit({ formData, duplicate: e.details.duplicate, message: e.message });
      } else {
        setError(e?.message || 'Failed to create contact');
      }
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateContact = async (id, updates) => {
    try {
      await apiClient.patch(`/clients/${id}`, updates);
      await fetchContacts();
      setShowEditModal(false);
      setEditingContact(null);
      if (selectedContact?._id === id) {
        setSelectedContact((prev) => ({ ...prev, ...updates }));
      }
    } catch (e) {
      setError(e?.message || 'Failed to update contact');
    }
  };

  const handleDeleteContact = async (id) => {
    try {
      await apiClient.delete(`/clients/${id}`);
      await fetchContacts();
      if (selectedContact?._id === id) setSelectedContact(null);
    } catch (e) {
      setError(e?.message || 'Failed to delete contact');
    }
  };

  const handleStatusChange = async (contactId, newStatus) => {
    setShowStatusDropdown(null);
    await handleUpdateContact(contactId, { status: newStatus });
  };

  const openEditModal = (contact) => {
    setEditConflict(null);
    setEditingContact(contact);
    setShowEditModal(true);
  };

  /**
   * Save the edit form, guarded by the version the form opened at. A colleague
   * who saved the same client meanwhile turns this into a choice (see
   * EditConflictNotice) instead of their edit vanishing under this one.
   * `overwrite` resends without the guard, once the person has chosen to.
   */
  const saveContactEdit = async (payload, { overwrite = false } = {}) => {
    const id = editingContact._id;
    setSavingEdit(true);
    try {
      const body = overwrite || !editingContact.updatedAt
        ? payload
        : { ...payload, expectedUpdatedAt: editingContact.updatedAt };
      await apiClient.patch(`/clients/${id}`, body, { silent: true });
      setEditConflict(null);
      await fetchContacts();
      setShowEditModal(false);
      setEditingContact(null);
      if (selectedContact?._id === id) setSelectedContact((prev) => ({ ...prev, ...payload }));
    } catch (e) {
      if (e?.code === 'VERSION_CONFLICT') {
        setEditConflict({ currentUpdatedAt: e.details?.currentUpdatedAt || null, payload });
      } else {
        setError(e?.message || 'Failed to update contact');
      }
    } finally {
      setSavingEdit(false);
    }
  };

  /** Drop this form's edits and reopen it on what the other person saved. */
  const reloadEditingContact = async () => {
    try {
      const res = await apiClient.get(`/clients/${editingContact._id}`, { silent: true });
      setEditingContact(res?.data || res);
      setEditConflict(null);
    } catch (e) {
      setError(e?.message || 'Failed to reload contact');
    }
  };

  if (!canAccess) {
    return (
      <div className='min-h-screen flex items-center justify-center'>
        <p className='text-slate-600'>{t('contacts.accessDenied')}</p>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      <PageHeader
        title={t('contacts.clients')}
        description={t('contacts.manageYourSalesLeadsAndClient')}
        actions={
          <>
            <Button variant='secondary' size='sm' icon={HiRefresh} onClick={fetchContacts} className={loading ? '[&>svg]:animate-spin' : ''}>{t('contacts.refresh')}</Button>
            <Button variant='secondary' size='sm' icon={HiDownload} onClick={exportCsv}>{t('contacts.export')}</Button>
            <Button variant='primary' size='sm' icon={HiPlus} onClick={() => setShowCreateModal(true)}>{t('contacts.newClient2')}</Button>
          </>
        }
      />

      {/* Board container */}
      <div className='bg-card border border-border rounded-xl shadow-sm overflow-hidden'>
        {/* Toolbar */}
        <div className='px-4 py-3 border-b border-border flex flex-col lg:flex-row lg:items-center gap-3'>
          {/* View tabs */}
          <div className='flex items-center gap-1 bg-slate-100 p-1 rounded-lg'>
            <button
              type='button'
              aria-pressed={view === 'cards'}
              onClick={() => setView('cards')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 transition-colors ${
                view === 'cards' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <HiViewGrid className='w-4 h-4' aria-hidden='true' />{t('contacts.cards')}</button>
            <button
              type='button'
              aria-pressed={view === 'board'}
              onClick={() => setView('board')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 transition-colors ${
                view === 'board' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <HiViewBoards className='w-4 h-4' aria-hidden='true' />{t('contacts.board')}</button>
            <button
              type='button'
              aria-pressed={view === 'table'}
              onClick={() => setView('table')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 transition-colors ${
                view === 'table' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <HiViewList className='w-4 h-4' aria-hidden='true' />{t('contacts.table')}</button>
          </div>

          <div className='h-6 w-px bg-slate-200 hidden lg:block' />

          {/* Search and filters */}
          <div className='flex flex-wrap items-center gap-2 flex-1'>
            <SearchBar
              className='flex-1 max-w-xs'
              value={q}
              onChange={(v) => setParam('q', v)}
              placeholder={t('contacts.searchClients')}
              label={t('contacts.searchClients')}
            />

            <select
              value={statusFilter}
              onChange={(e) => setParam('status', e.target.value)}
              aria-label='Filter by status'
              className='px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:ring-2 focus:ring-brand-500 focus:border-indigo-400 outline-none transition-all'
            >
              <option value=''>{t('contacts.allStatuses')}</option>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>{STATUS_CONFIG[s]?.label || s}</option>
              ))}
            </select>

            <select
              value={temperatureFilter}
              onChange={(e) => setParam('temperature', e.target.value)}
              aria-label='Filter by temperature'
              className='px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:ring-2 focus:ring-brand-500 focus:border-indigo-400 outline-none transition-all'
            >
              <option value=''>{t('contacts.anyTemperature')}</option>
              <option value='hot'>{t('contacts.hot')}</option>
              <option value='warm'>{t('contacts.warm')}</option>
              <option value='cold'>{t('contacts.cold')}</option>
            </select>

            <select
              value={typeFilter}
              onChange={(e) => setParam('contactType', e.target.value)}
              aria-label='Filter by contact type'
              className='px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:ring-2 focus:ring-brand-500 focus:border-indigo-400 outline-none transition-all'
            >
              <option value=''>{t('contacts.allTypes')}</option>
              <option value='lead'>{t('contacts.leads')}</option>
              <option value='co_agent'>{t('contacts.coAgents')}</option>
              <option value='referral_partner'>{t('contacts.referralPartners')}</option>
            </select>

            {/* Temperature counts too — it was missing here, so a temperature
                filter on its own left no way to clear it. */}
            {hasFilters && (
              <button
                type='button'
                onClick={clearFilters}
                className='px-3 py-2 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 text-sm font-medium transition-colors'
              >{t('contacts.clearAll')}</button>
            )}

            {isTable && (
              <div className='ml-auto'>
                <ColumnToggle
                  columns={columns}
                  isVisible={columnPrefs.isVisible}
                  onToggle={columnPrefs.toggle}
                  onReset={columnPrefs.reset}
                />
              </div>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className='px-4 py-2.5 text-sm bg-rose-50 border-b border-rose-200 text-rose-700 flex items-center gap-2'>
            <svg className='w-4 h-4 flex-shrink-0' aria-hidden='true' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' />
            </svg>
            {error}
            <button type='button' onClick={() => setError('')} aria-label='Dismiss error' className='ml-auto text-rose-600 hover:text-rose-700'>
              <HiX className='w-4 h-4' aria-hidden='true' />
            </button>
          </div>
        )}

        {/* Loading skeleton — the table draws its own, inside its header. */}
        {loading && !isTable && (
          <div className='p-6' aria-busy='true'>
            <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div key={i} className='bg-card border border-border rounded-xl p-4'>
                  <div className='flex items-center gap-3 mb-3'>
                    <Skeleton className='w-10 h-10 rounded-full' />
                    <div className='flex-1 space-y-1.5'>
                      <Skeleton className='h-4 w-2/3' />
                      <Skeleton className='h-3 w-1/2' />
                    </div>
                  </div>
                  <Skeleton className='h-3 w-full mb-2' />
                  <Skeleton className='h-3 w-3/4' />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* The grouped views hold one slice of the list. Say so, rather than
            letting a count of 200 read as the whole book. */}
        {!loading && !isTable && total > contacts.length && (
          <div className='px-4 py-2.5 text-sm bg-amber-50 border-b border-amber-200 text-amber-800 flex flex-wrap items-center gap-x-3 gap-y-1'>
            <span>{t('contacts.showingFirstOf', { shown: contacts.length, total })}</span>
            <button
              type='button'
              onClick={() => setView('table')}
              className='font-medium underline underline-offset-2 hover:text-amber-900 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500'
            >
              {t('contacts.seeAllInTable')}
            </button>
          </div>
        )}

        {/* Board View — drag a lead between statuses */}
        {!loading && view === 'board' && (
          <div className='p-4 overflow-x-auto'>
            <div className='flex gap-3 min-w-max'>
              {STATUS_ORDER.map((status) => {
                const items = groupedContacts.get(status) || [];
                const config = STATUS_CONFIG[status] || STATUS_CONFIG.lead;

                return (
                  <div
                    key={status}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const id = e.dataTransfer.getData('text/plain');
                      if (id) moveContactToStatus(id, status);
                    }}
                    className='w-72 flex-shrink-0 bg-slate-50 rounded-xl border border-slate-200'
                  >
                    <div className={`flex items-center gap-2 px-3 py-2.5 rounded-t-xl ${config.bgLight} border-b ${config.border}`}>
                      <span className={`w-2 h-2 rounded-full ${config.color}`} />
                      <span className={`text-sm font-semibold ${config.textColor}`}>{config.label}</span>
                      <span className='ml-auto text-xs font-medium text-slate-500 bg-white px-2 py-0.5 rounded-full'>
                        {items.length}
                      </span>
                    </div>

                    <div className='p-2 space-y-2 min-h-[8rem] max-h-[34rem] overflow-y-auto'>
                      {items.map((contact) => (
                        <div
                          key={contact._id}
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData('text/plain', contact._id)}
                          onClick={() => setSelectedContact(contact)}
                          role='button'
                          tabIndex={0}
                          aria-label={contact.name}
                          onKeyDown={(e) => {
                            if (e.target !== e.currentTarget) return;
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedContact(contact);
                            }
                          }}
                          className='bg-white border border-slate-200 rounded-lg p-3 cursor-pointer hover:border-indigo-300 hover:shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'
                        >
                          <div className='flex items-start justify-between gap-2'>
                            <span className='text-sm font-medium text-slate-900 truncate'>{contact.name}</span>
                            {contact.temperature && <TemperatureChip value={contact.temperature} />}
                          </div>

                          {contact.phone && (
                            <p className='text-xs text-slate-500 mt-1'>{contact.phone}</p>
                          )}

                          {contact.tagIds?.length > 0 && (
                            <div className='flex items-center gap-1 flex-wrap mt-2'>
                              {contact.tagIds.slice(0, 3).map((tag) => (
                                <TagChip key={tag._id || tag} tag={tag} />
                              ))}
                            </div>
                          )}

                          {contact.score > 0 && (
                            <div className='flex items-center gap-1.5 mt-2'>
                              <div className='flex-1 h-1 bg-slate-100 rounded-full overflow-hidden'>
                                <div className='h-full bg-indigo-400' style={{ width: `${contact.score}%` }} />
                              </div>
                              <span className='text-[10px] text-slate-500 tabular-nums'>{contact.score}</span>
                            </div>
                          )}
                        </div>
                      ))}

                      {!items.length && (
                        <p className='text-xs text-slate-500 text-center py-6'>{t('contacts.dropALeadHere')}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Cards View */}
        {!loading && view === 'cards' && (
          <div className='p-4'>
            {contacts.length === 0 && !loading ? null : STATUS_ORDER.map((status) => {
              const items = groupedContacts.get(status) || [];
              if (items.length === 0 && statusFilter && statusFilter !== status) return null;
              if (items.length === 0 && contacts.length === 0) return null;
              const config = STATUS_CONFIG[status] || STATUS_CONFIG.lead;
              const isCollapsed = collapsedGroups[status];

              return (
                <div key={status} className='mb-6 last:mb-0'>
                  {/* Group header */}
                  <button
                    type='button'
                    aria-expanded={!isCollapsed}
                    onClick={() => toggleGroup(status)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg mb-3 transition-colors ${config.bgLight} hover:opacity-90`}
                  >
                    <div className={`w-1 h-6 rounded-full ${config.color}`} />
                    {isCollapsed ? (
                      <HiChevronRight className={`w-4 h-4 ${config.textColor}`} aria-hidden='true' />
                    ) : (
                      <HiChevronDown className={`w-4 h-4 ${config.textColor}`} aria-hidden='true' />
                    )}
                    <span className={`font-semibold ${config.textColor}`}>{config.label}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${config.color} text-white`}>
                      {items.length}
                    </span>
                  </button>

                  {/* Cards grid */}
                  {!isCollapsed && (
                    <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'>
                      {items.map((contact) => (
                        <ContactCard
                          key={contact._id}
                          contact={contact}
                          onSelect={() => setSelectedContact(contact)}
                          onEdit={() => openEditModal(contact)}
                          onDelete={() => setPendingDelete(contact._id)}
                          onStatusChange={(newStatus) => handleStatusChange(contact._id, newStatus)}
                          showStatusDropdown={showStatusDropdown === contact._id}
                          setShowStatusDropdown={setShowStatusDropdown}
                        />
                      ))}
                      {/* Add client card */}
                      <button type="button"
                        onClick={() => setShowCreateModal(true)}
                        className='border-2 border-dashed border-slate-200 rounded-xl p-4 min-h-[140px] flex flex-col items-center justify-center text-slate-500 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/30 transition-colors'
                      >
                        <HiPlus className='w-6 h-6 mb-2' aria-hidden='true' />
                        <span className='text-sm font-medium'>{t('contacts.addClient')}</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {contacts.length === 0 && !loading && hasFilters && (
              <EmptyState
                icon={HiSearch}
                title={t('contacts.noMatchingClients')}
                body={t('contacts.tryDifferentFilters')}
                action={<Button variant='secondary' size='sm' onClick={clearFilters}>{t('contacts.clearFilters')}</Button>}
              />
            )}
            {contacts.length === 0 && !loading && !hasFilters && (
              <div className='flex flex-col items-center justify-center py-20 text-center'>
                <div className='w-16 h-16 rounded-2xl bg-indigo-50 ring-1 ring-indigo-100 flex items-center justify-center mx-auto mb-5'>
                  <HiUsers className='w-8 h-8 text-indigo-500' aria-hidden='true' />
                </div>
                <h3 className='text-lg font-semibold text-slate-900 mb-1.5'>{t('contacts.noClientsYet')}</h3>
                <p className='text-slate-500 text-sm mb-6 max-w-xs'>{t('contacts.addYourFirstClientToStart')}</p>
                <Button variant='primary' size='md' icon={HiPlus} onClick={() => setShowCreateModal(true)}>{t('contacts.addYourFirstClient')}</Button>
              </div>
            )}
          </div>
        )}

        {/* Table View — one flat list, sorted and paged by the server. It used
            to group rows by status, but a group split across pages shows a
            count that is only true for the page; sort by Status for that order. */}
        {isTable && (
          <>
            <div className='overflow-auto max-h-[70vh]'>
              <table className='min-w-full text-sm text-left'>
                <Thead sticky>
                  <tr>
                    <th className='w-10 pl-4 pr-1 py-3'>
                      <Checkbox
                        aria-label={t('contacts.selectAll')}
                        checked={selection.headerCheckbox.checked}
                        indeterminate={selection.headerCheckbox.indeterminate}
                        disabled={selection.headerCheckbox.disabled || loading}
                        onChange={selection.toggleAll}
                      />
                    </th>
                    {shownColumns.map((col) => (
                      <Th
                        key={col.key}
                        sortKey={col.sortKey}
                        sort={sort}
                        onSort={col.sortKey ? toggleSort : undefined}
                        className={col.key === 'name' ? 'pl-1 w-[250px]' : undefined}
                      >
                        {col.label}
                      </Th>
                    ))}
                    <th className='w-[100px] px-4 py-3'><span className='sr-only'>{t('contacts.edit')}</span></th>
                  </tr>
                </Thead>
                <Tbody>
                  {loading ? (
                    <SkeletonRows rows={Math.min(pageSize, 10)} columns={shownColumns.length + 2} />
                  ) : contacts.map((contact) => (
                    <ContactRow
                      key={contact._id}
                      contact={contact}
                      columns={shownColumns}
                      selected={selection.isSelected(contact._id)}
                      onToggleSelected={() => selection.toggle(contact._id)}
                      onOpen={() => setSelectedContact(contact)}
                      onEdit={() => openEditModal(contact)}
                      onDelete={() => setPendingDelete(contact._id)}
                    />
                  ))}
                </Tbody>
              </table>

              {!loading && contacts.length === 0 && (
                hasFilters ? (
                  <EmptyState
                    icon={HiSearch}
                    title={t('contacts.noMatchingClients')}
                    body={t('contacts.tryDifferentFilters')}
                    action={<Button variant='secondary' size='sm' onClick={clearFilters}>{t('contacts.clearFilters')}</Button>}
                  />
                ) : (
                  <EmptyState
                    icon={HiUser}
                    title={t('contacts.noClientsFound')}
                    action={<Button variant='primary' size='sm' icon={HiPlus} onClick={() => setShowCreateModal(true)}>{t('contacts.addYourFirstClient2')}</Button>}
                  />
                )
              )}
            </div>

            {total > 0 && (
              <div className='px-4 border-t border-border'>
                <Pagination
                  page={page}
                  pageSize={pageSize}
                  total={total}
                  onPageChange={(n) => setParam('page', n > 1 ? String(n) : '')}
                  onPageSizeChange={(n) => { setPageSize(n); setParam('page', ''); }}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Contact Detail Panel */}
      {selectedContact && (
        <ContactDetailPanel
          contact={selectedContact}
          onClose={() => setSelectedContact(null)}
          onEdit={() => openEditModal(selectedContact)}
          onDelete={() => setPendingDelete(selectedContact._id)}
          onStatusChange={(newStatus) => handleStatusChange(selectedContact._id, newStatus)}
        />
      )}

      {/* Create Contact Modal */}
      {showCreateModal && (
        <ContactFormModal
          onClose={() => { setShowCreateModal(false); setDuplicateHit(null); }}
          onSubmit={(data) => handleCreateContact(data)}
          loading={creating}
          title={t('contacts.newClient')}
          notice={duplicateHit && (
            <div role='alert' className='rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900'>
              <p className='font-medium'>{duplicateHit.message}</p>
              <p className='text-xs mt-0.5'>
                {[duplicateHit.duplicate.name, duplicateHit.duplicate.phone, duplicateHit.duplicate.email, duplicateHit.duplicate.status]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <div className='flex gap-2 mt-2'>
                <Button
                  type='button'
                  size='sm'
                  variant='secondary'
                  disabled={creating}
                  onClick={() => handleCreateContact(duplicateHit.formData, { force: true })}
                >
                  Create anyway
                </Button>
                <Button type='button' size='sm' variant='ghost' onClick={() => setDuplicateHit(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        />
      )}

      {/* Edit Contact Modal */}
      {showEditModal && editingContact && (
        <ContactFormModal
          // Keyed on the version, so reloading their copy resets the form.
          key={`${editingContact._id}-${editingContact.updatedAt || ''}`}
          contact={editingContact}
          onClose={() => { setShowEditModal(false); setEditingContact(null); setEditConflict(null); }}
          onSubmit={(data) => saveContactEdit(data)}
          loading={savingEdit}
          title={t('contacts.editClient')}
          notice={editConflict && (
            <EditConflictNotice
              currentUpdatedAt={editConflict.currentUpdatedAt}
              onReload={reloadEditingContact}
              onOverwrite={() => saveContactEdit(editConflict.payload, { overwrite: true })}
              busy={savingEdit}
            />
          )}
        />
      )}
      <ConfirmDialog
        open={!!pendingDelete}
        title={t('contacts.deleteThisClient')}
        description={t('contacts.thisActionCannotBeUndone')}
        confirmLabel={t('contacts.delete')}
        onConfirm={() => { handleDeleteContact(pendingDelete); setPendingDelete(null); }}
        onCancel={() => setPendingDelete(null)}
      />

      <ConfirmDialog
        open={pendingBulkDelete}
        title={`Delete ${selection.count} client${selection.count === 1 ? '' : 's'}?`}
        description={t('contacts.thisActionCannotBeUndone')}
        confirmLabel={t('contacts.delete')}
        onConfirm={() => applyBulk('delete')}
        onCancel={() => setPendingBulkDelete(false)}
      />

      {/* Appears only once rows are ticked. */}
      <BulkActionBar count={selection.count} onClear={selection.clear}>
        {isAdmin && (
          <BulkSelect
            value=''
            aria-label='Assign selected clients to'
            onChange={(e) => { if (e.target.value) applyBulk('assign', e.target.value); }}
          >
            <option value=''>{t('contacts.assignTo')}</option>
            {agents.map((agent) => (
              <option key={agent._id} value={agent._id}>{agent.username}</option>
            ))}
          </BulkSelect>
        )}

        <BulkSelect
          value=''
          aria-label='Change status of selected clients'
          onChange={(e) => { if (e.target.value) applyBulk('status', e.target.value); }}
        >
          <option value=''>{t('contacts.changeStatus')}</option>
          {STATUS_ORDER.map((status) => (
            <option key={status} value={status}>{STATUS_CONFIG[status].label}</option>
          ))}
        </BulkSelect>

        <BulkButton danger onClick={() => setPendingBulkDelete(true)}>{t('contacts.delete')}</BulkButton>
      </BulkActionBar>
    </div>
  );
}

/**
 * One row of the table. Cells follow `columns`, so a column hidden in the
 * column picker is simply not rendered.
 *
 * The row opens the lead on a mouse click; keyboard users reach the same
 * through the name, which is a real button — a focusable row as well would be
 * a second tab stop for one action.
 */
function ContactRow({ contact, columns, selected, onToggleSelected, onOpen, onEdit, onDelete }) {
  const { t } = useTranslation();
  const config = STATUS_CONFIG[contact.status] || STATUS_CONFIG.lead;
  const dash = <span className='text-slate-500 text-[13px]'>—</span>;

  const cell = (key) => {
    switch (key) {
      case 'name':
        return (
          <td key={key} className='pl-1 pr-2 py-3'>
            <div className='flex items-center gap-3'>
              <div className={`w-9 h-9 rounded-full ${config.color} flex items-center justify-center text-white text-sm font-semibold flex-shrink-0`}>
                {(contact.name?.[0] || '?').toUpperCase()}
              </div>
              <div className='min-w-0'>
                <button
                  type='button'
                  onClick={(e) => { e.stopPropagation(); onOpen(); }}
                  className='block max-w-full text-left font-semibold text-slate-900 text-[13px] truncate group-hover:text-brand-700 transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'
                >
                  {contact.name}
                </button>
                {contact.organization && (
                  <div className='text-[11px] text-slate-500 truncate'>{contact.organization}</div>
                )}
                {contact.tagIds?.length > 0 && (
                  <div className='flex items-center gap-1 flex-wrap mt-1'>
                    {contact.tagIds.map((tag) => (
                      <TagChip key={tag._id || tag} tag={tag} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </td>
        );
      case 'email':
        return (
          <td key={key} className='px-4 py-3'>
            {contact.email ? (
              <a
                href={`mailto:${contact.email}`}
                onClick={(e) => e.stopPropagation()}
                className='text-brand-600 hover:underline text-[13px] truncate block max-w-[200px]'
              >
                {contact.email}
              </a>
            ) : dash}
          </td>
        );
      case 'phone':
        return (
          <td key={key} className='px-4 py-3' onClick={(e) => e.stopPropagation()}>
            {contact.phone ? (
              <span className='flex items-center gap-1.5'>
                <a href={`tel:${contact.phone}`} className='text-slate-700 hover:text-brand-600 text-[13px]'>
                  {contact.phone}
                </a>
                {/* Compact: the row is dense, and an agent
                    scanning the list wants one tap to chat. */}
                <WhatsAppButton compact phone={contact.phone} />
              </span>
            ) : dash}
          </td>
        );
      case 'status':
        return (
          <td key={key} className='px-4 py-3'>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${config.color} text-white`}>
              {config.label}
            </span>
          </td>
        );
      case 'temperature':
        return (
          <td key={key} className='px-4 py-3'>
            {contact.temperature ? <TemperatureChip value={contact.temperature} /> : dash}
          </td>
        );
      case 'score':
        return (
          <td key={key} className='px-4 py-3'>
            <div className='flex items-center gap-2 w-24'>
              <div className='flex-1 h-1.5 bg-secondary rounded-full overflow-hidden' aria-hidden='true'>
                <div className='h-full bg-brand-500' style={{ width: `${Math.max(0, Math.min(100, contact.score || 0))}%` }} />
              </div>
              <span className='text-xs text-slate-600 tabular-nums'>{contact.score || 0}</span>
            </div>
          </td>
        );
      case 'nextFollowUp':
        return (
          <td key={key} className='px-4 py-3 whitespace-nowrap text-[13px] text-slate-700'>
            {contact.nextFollowUp ? formatDate(contact.nextFollowUp) : dash}
          </td>
        );
      case 'createdAt':
        return (
          <td key={key} className='px-4 py-3 whitespace-nowrap text-[13px] text-slate-600'>
            {contact.createdAt ? formatDate(contact.createdAt) : dash}
          </td>
        );
      case 'notes':
        return (
          <td key={key} className='px-4 py-3'>
            <span className='text-slate-600 text-[13px] truncate block max-w-[200px]'>{contact.notes || '—'}</span>
          </td>
        );
      default:
        return <td key={key} />;
    }
  };

  return (
    <tr
      className={`group transition-colors cursor-pointer ${selected ? 'bg-brand-50/60 dark:bg-brand-950/40' : 'hover:bg-brand-50/40'}`}
      onClick={onOpen}
    >
      {/* stopPropagation: ticking a row must not also open it */}
      <td className='w-10 pl-4 pr-1 py-3' onClick={(e) => e.stopPropagation()}>
        <Checkbox
          aria-label={`Select ${contact.name || 'contact'}`}
          checked={selected}
          onChange={onToggleSelected}
        />
      </td>
      {columns.map((col) => cell(col.key))}
      <td className='px-4 py-3 text-right'>
        <div className='flex items-center justify-end gap-1 hover-reveal transition-opacity'>
          <button
            type='button'
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className='p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors'
            title={t('contacts.edit')}
            aria-label={`Edit ${contact.name || 'contact'}`}
          >
            <HiPencil className='w-4 h-4' aria-hidden='true' />
          </button>
          <button
            type='button'
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className='p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors'
            title={t('contacts.delete')}
            aria-label={`Delete ${contact.name || 'contact'}`}
          >
            <HiTrash className='w-4 h-4' aria-hidden='true' />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ContactCard component
function ContactCard({ contact, onSelect, onEdit, onDelete, onStatusChange, showStatusDropdown, setShowStatusDropdown }) {
  const { t } = useTranslation();
  const config = STATUS_CONFIG[contact.status] || STATUS_CONFIG.lead;

  return (
    <div
      className='bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md hover:border-slate-300 transition-all cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'
      onClick={onSelect}
      role='button'
      tabIndex={0}
      aria-label={contact.name}
      onKeyDown={(e) => {
        // Only the card itself: Enter/Space on a nested button or link is its own.
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      {/* Header */}
      <div className='flex items-start justify-between mb-3'>
        <div className='flex items-center gap-3 min-w-0'>
          <div className={`w-10 h-10 rounded-full ${config.color} flex items-center justify-center text-white text-sm font-bold flex-shrink-0`}>
            {(contact.name?.[0] || '?').toUpperCase()}
          </div>
          <div className='min-w-0'>
            <div className='flex items-center gap-1.5 flex-wrap'>
              <h3 className='font-semibold text-slate-900 text-sm truncate group-hover:text-indigo-700 transition-colors'>
                {contact.name}
              </h3>
              {contact.contactType === 'co_agent' && (
                <span className='text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200 whitespace-nowrap'>{t('contacts.coAgent')}</span>
              )}
              {contact.contactType === 'referral_partner' && (
                <span className='text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 whitespace-nowrap'>{t('contacts.referral')}</span>
              )}
            </div>
            {contact.organization && (
              <p className='text-xs text-slate-500 truncate'>{contact.organization}</p>
            )}
          </div>
        </div>
        <div className='flex items-center gap-1 hover-reveal transition-opacity'>
          <button
            type='button'
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className='p-2.5 sm:p-1 rounded-lg sm:rounded text-slate-500 hover:text-slate-700 hover:bg-slate-100'
            title={t('contacts.edit')}
            aria-label={`Edit ${contact.name || 'contact'}`}
          >
            <HiPencil className='w-3.5 h-3.5' aria-hidden='true' />
          </button>
          <button
            type='button'
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className='p-2.5 sm:p-1 rounded-lg sm:rounded text-slate-500 hover:text-rose-600 hover:bg-rose-50'
            title={t('contacts.delete')}
            aria-label={`Delete ${contact.name || 'contact'}`}
          >
            <HiTrash className='w-3.5 h-3.5' aria-hidden='true' />
          </button>
        </div>
      </div>

      {/* Contact info */}
      <div className='space-y-1.5 mb-3'>
        {contact.email && (
          <a
            href={`mailto:${contact.email}`}
            onClick={(e) => e.stopPropagation()}
            className='flex items-center gap-2 text-xs text-slate-600 hover:text-indigo-600 truncate'
          >
            <HiMail className='w-3.5 h-3.5 text-slate-400 flex-shrink-0' aria-hidden='true' />
            <span className='truncate'>{contact.email}</span>
          </a>
        )}
        {contact.phone && (
          <a
            href={`tel:${contact.phone}`}
            onClick={(e) => e.stopPropagation()}
            className='flex items-center gap-2 text-xs text-slate-600 hover:text-indigo-600'
          >
            <HiPhone className='w-3.5 h-3.5 text-slate-400 flex-shrink-0' aria-hidden='true' />
            {contact.phone}
          </a>
        )}
      </div>

      {/* Notes */}
      {contact.notes && (
        <p className='text-xs text-slate-500 line-clamp-2 mb-3'>{contact.notes}</p>
      )}

      {/* Status badge with dropdown */}
      <div className='relative'>
        <button
          type='button'
          onClick={(e) => {
            e.stopPropagation();
            setShowStatusDropdown(showStatusDropdown ? null : contact._id);
          }}
          aria-haspopup='true'
          aria-expanded={!!showStatusDropdown}
          aria-label={`Status: ${config.label}. Change status`}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${config.color} text-white hover:opacity-90 transition-opacity`}
        >
          {config.label}
          <HiChevronDown className='w-3 h-3' aria-hidden='true' />
        </button>
        {showStatusDropdown && (
          <div
            className='absolute bottom-full left-0 mb-1 w-40 bg-white border border-slate-200 rounded-lg shadow-xl z-30 py-1'
            onClick={(e) => e.stopPropagation()}
          >
            {STATUS_ORDER.map((s) => {
              const sConfig = STATUS_CONFIG[s];
              return (
                <button
                  key={s}
                  type='button'
                  aria-current={contact.status === s ? 'true' : undefined}
                  onClick={() => onStatusChange(s)}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 flex items-center gap-2 ${
                    contact.status === s ? 'bg-slate-50 font-medium' : ''
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full ${sConfig.color}`} />
                  {sConfig.label}
                  {contact.status === s && <HiCheck className='w-4 h-4 ml-auto text-indigo-600' aria-hidden='true' />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ContactFormModal component (for create and edit)
function ContactFormModal({ contact, onClose, onSubmit, loading, title, notice = null }) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    name: contact?.name || '',
    email: contact?.email || '',
    phone: contact?.phone || '',
    alternatePhone: contact?.alternatePhone || '',
    notes: contact?.notes || '',
    requirements: contact?.requirements || '',
    status: contact?.status || 'lead',
    priority: contact?.priority || 'medium',
    organization: contact?.organization || '',
    source: contact?.source || '',
    contactType: contact?.contactType || 'lead',
    propertyType: contact?.propertyType || '',
    preferredLocations: contact?.preferredLocations?.join(', ') || '',
    budgetMin: contact?.budget?.min || '',
    budgetMax: contact?.budget?.max || '',
  });

  const set = (field) => (e) => setFormData((p) => ({ ...p, [field]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const { budgetMin, budgetMax, preferredLocations, ...rest } = formData;
    const payload = {
      ...rest,
      preferredLocations: preferredLocations
        ? preferredLocations.split(',').map((s) => s.trim()).filter(Boolean)
        : [],
      budget: {
        min: Number(budgetMin) || 0,
        max: Number(budgetMax) || 0,
        currency: getLocaleConfig().currency,
      },
    };
    onSubmit(payload);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      size='lg'
      footer={
        <>
          <Button variant='secondary' type='button' onClick={onClose}>{t('contacts.cancel')}</Button>
          <Button type='submit' form='contact-form' disabled={loading || !formData.name}>
            {loading ? 'Saving...' : contact ? 'Save Changes' : 'Create Contact'}
          </Button>
        </>
      }
    >
      <form id='contact-form' onSubmit={handleSubmit} className='space-y-4'>
        {notice}
        <Input
          label={t('contacts.name')}
          required
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder={t('contacts.enterContactName')}
        />
        <div className='grid grid-cols-2 gap-4'>
          <Input
            label={t('contacts.email')}
            type='email'
            inputMode='email'
            autoComplete='email'
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder={t('contacts.emailExampleCom')}
          />
          <Input
            label={t('contacts.phone')}
            type='tel'
            inputMode='tel'
            autoComplete='tel'
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            placeholder='+1 234 567 8900'
          />
        </div>
        <Input
          label={t('contacts.alternatePhone')}
          type='tel'
          inputMode='tel'
          value={formData.alternatePhone}
          onChange={set('alternatePhone')}
          placeholder={t('contacts.optionalSecondNumber')}
        />
        <Select label={t('contacts.contactType')} value={formData.contactType} onChange={set('contactType')}>
          <option value='lead'>Lead (Buyer / Renter)</option>
          <option value='co_agent'>{t('contacts.coAgentBroker')}</option>
          <option value='referral_partner'>{t('contacts.referralPartner')}</option>
        </Select>
        <div className='grid grid-cols-2 gap-4'>
          <Input
            label={t('contacts.organization')}
            value={formData.organization}
            onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
            placeholder={t('contacts.companyName')}
          />
          <Input
            label={t('contacts.source')}
            value={formData.source}
            onChange={(e) => setFormData({ ...formData, source: e.target.value })}
            placeholder={t('contacts.eGWebsiteReferral')}
          />
        </div>
        <div className='grid grid-cols-2 gap-4'>
          <Select label={t('contacts.status')} value={formData.status} onChange={set('status')}>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>{STATUS_CONFIG[s]?.label || s}</option>
            ))}
          </Select>
          <Select label={t('contacts.priority')} value={formData.priority} onChange={set('priority')}>
            <option value='low'>{t('contacts.low')}</option>
            <option value='medium'>{t('contacts.medium')}</option>
            <option value='high'>{t('contacts.high')}</option>
            <option value='urgent'>{t('contacts.urgent')}</option>
          </Select>
        </div>

        {/* Requirements section */}
        <div className='border-t border-slate-100 pt-4'>
          <p className='text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3'>{t('contacts.requirements')}</p>
          <div className='space-y-3'>
            <Select label={t('contacts.propertyType')} value={formData.propertyType} onChange={set('propertyType')}>
              <option value=''>{t('contacts.any')}</option>
              <option value='residential'>{t('contacts.residential')}</option>
              <option value='commercial'>{t('contacts.commercial')}</option>
              <option value='plot'>{t('contacts.plotLand')}</option>
              <option value='villa'>{t('contacts.villa')}</option>
              <option value='apartment'>{t('contacts.apartment')}</option>
              <option value='office'>{t('contacts.office')}</option>
              <option value='shop'>{t('contacts.shop')}</option>
              <option value='warehouse'>{t('contacts.warehouse')}</option>
            </Select>
            <div className='grid grid-cols-2 gap-4'>
              <Input
                label={`Budget Min (${currencySymbol()})`}
                type='number'
                inputMode='numeric'
                value={formData.budgetMin}
                onChange={set('budgetMin')}
                placeholder={t('contacts.eG2000000')}
                min={0}
              />
              <Input
                label={`Budget Max (${currencySymbol()})`}
                type='number'
                inputMode='numeric'
                value={formData.budgetMax}
                onChange={set('budgetMax')}
                placeholder={t('contacts.eG5000000')}
                min={0}
                // Quiet until a real max sits below a real min (mirrors the
                // listing price/discount inline rule).
                error={
                  Number(formData.budgetMax) > 0 &&
                  Number(formData.budgetMin) > 0 &&
                  Number(formData.budgetMax) < Number(formData.budgetMin)
                    ? 'Must be above the minimum'
                    : undefined
                }
              />
            </div>
            <Input
              label={t('contacts.preferredLocations')}
              value={formData.preferredLocations}
              onChange={set('preferredLocations')}
              placeholder='Bandra, Andheri, Juhu (comma-separated)'
            />
            <Textarea
              label={t('contacts.detailedRequirements')}
              value={formData.requirements}
              onChange={set('requirements')}
              rows={3}
              placeholder={t('contacts.3bhkSouthFacingNearSchoolParking')}
            />
          </div>
        </div>

        <Textarea
          label={t('contacts.notes')}
          value={formData.notes}
          onChange={set('notes')}
          rows={2}
          placeholder={t('contacts.addNotesAboutThisContact')}
        />
      </form>
    </Modal>
  );
}

// ContactDetailPanel component
function ContactDetailPanel({ contact, onClose, onEdit, onDelete, onStatusChange }) {
  const { t } = useTranslation();
  const c = contact;
  const config = STATUS_CONFIG[c.status] || STATUS_CONFIG.lead;
  const [activeTab, setActiveTab] = useState('overview');
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const closeRef = useRef(null);
  const titleId = useId();

  // A modal side panel: focus starts inside it (once, on open) and Escape closes it.
  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className='fixed inset-0 !mt-0 bg-black/30 backdrop-blur-[2px] flex items-start justify-end z-50'>
      <div
        className='w-full max-w-2xl h-full bg-white shadow-2xl overflow-hidden flex flex-col animate-slide-in-right'
        style={{ animation: 'slideInRight 0.2s ease-out' }}
        role='dialog'
        aria-modal='true'
        aria-labelledby={titleId}
      >
        {/* Header */}
        <div className='bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0'>
          {/* Wraps on a phone: the name, three actions and close shared one row
              and squeezed the name to a word per line. */}
          <div className='flex flex-wrap items-start justify-between gap-3'>
            <div className='flex items-center gap-4 min-w-0 flex-1'>
              <div className={`w-14 h-14 flex-shrink-0 rounded-full ${config.color} flex items-center justify-center text-white text-xl font-bold`}>
                {(c.name?.[0] || '?').toUpperCase()}
              </div>
              <div className='min-w-0'>
                <h2 id={titleId} className='text-xl font-bold text-slate-900 break-words'>{c.name}</h2>
                {c.organization && <p className='text-sm text-slate-500'>{c.organization}</p>}
              </div>
            </div>
            <div className='flex items-center gap-2 flex-shrink-0'>
              <Link
                to={`/clients/${c._id}`}
                className='px-3 py-1.5 rounded-lg bg-slate-900 text-sm text-white hover:bg-slate-800 flex items-center gap-1.5 whitespace-nowrap transition-colors'
              >
                <HiEye className='w-4 h-4' aria-hidden='true' />{t('contacts.viewDeals')}</Link>
              <button
                type='button'
                onClick={onEdit}
                className='px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 whitespace-nowrap transition-colors'
              >
                <HiPencil className='w-4 h-4' aria-hidden='true' />{t('contacts.edit')}</button>
              <button
                type='button'
                onClick={onDelete}
                aria-label={t('contacts.delete')}
                className='px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-rose-600 hover:bg-rose-50 hover:border-rose-200 flex items-center gap-1.5 transition-colors'
              >
                <HiTrash className='w-4 h-4' aria-hidden='true' />
              </button>
              <button ref={closeRef} type='button' onClick={onClose} aria-label='Close' className='p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors'>
                <HiX className='w-5 h-5' aria-hidden='true' />
              </button>
            </div>
          </div>

          {/* Status badge */}
          <div className='mt-4 relative inline-block'>
            <button
              type='button'
              onClick={() => setShowStatusDropdown(!showStatusDropdown)}
              aria-haspopup='true'
              aria-expanded={showStatusDropdown}
              aria-label={`Status: ${config.label}. Change status`}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold ${config.color} text-white hover:opacity-90 transition-opacity`}
            >
              {config.label}
              <HiChevronDown className='w-4 h-4' aria-hidden='true' />
            </button>
            {showStatusDropdown && (
              <div className='absolute top-full left-0 mt-1 w-44 bg-white border border-slate-200 rounded-lg shadow-xl z-30 py-1'>
                {STATUS_ORDER.map((s) => {
                  const sConfig = STATUS_CONFIG[s];
                  return (
                    <button
                      key={s}
                      type='button'
                      aria-current={c.status === s ? 'true' : undefined}
                      onClick={() => { onStatusChange(s); setShowStatusDropdown(false); }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2 ${
                        c.status === s ? 'bg-slate-50 font-medium' : ''
                      }`}
                    >
                      <div className={`w-2.5 h-2.5 rounded-full ${sConfig.color}`} />
                      {sConfig.label}
                      {c.status === s && <HiCheck className='w-4 h-4 ml-auto text-indigo-600' aria-hidden='true' />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className='border-b border-slate-200 px-6 flex-shrink-0'>
          <div className='flex gap-1'>
            {[
              { id: 'overview', label: 'Overview', icon: HiUser },
              { id: 'activity', label: 'Activity', icon: HiCalendar },
            ].map((tab) => (
              <button
                key={tab.id}
                type='button'
                aria-pressed={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'text-slate-900 border-slate-900'
                    : 'text-slate-500 border-transparent hover:text-slate-700'
                }`}
              >
                <tab.icon className='w-4 h-4' aria-hidden='true' />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className='flex-1 overflow-y-auto p-6'>
          {activeTab === 'overview' && (
            <div className='space-y-6'>
              {/* Contact Details */}
              <div className='bg-slate-50 rounded-xl p-5'>
                <h3 className='font-semibold text-slate-900 mb-4 flex items-center gap-2'>
                  <HiUser className='w-5 h-5 text-slate-400' aria-hidden='true' />{t('contacts.contactDetails')}</h3>
                <div className='grid grid-cols-2 gap-4'>
                  <div>
                    <span className='text-xs font-medium text-slate-500 uppercase tracking-wider'>{t('contacts.email')}</span>
                    {c.email ? (
                      <a href={`mailto:${c.email}`} className='block text-sm text-indigo-600 hover:underline mt-1 truncate'>
                        {c.email}
                      </a>
                    ) : (
                      <p className='text-sm text-slate-500 mt-1'>—</p>
                    )}
                  </div>
                  <div>
                    <span className='text-xs font-medium text-slate-500 uppercase tracking-wider'>{t('contacts.phone')}</span>
                    {c.phone ? (
                      <a href={`tel:${c.phone}`} className='block text-sm text-slate-900 hover:text-indigo-600 mt-1'>
                        {c.phone}
                      </a>
                    ) : (
                      <p className='text-sm text-slate-500 mt-1'>—</p>
                    )}
                  </div>
                  <div>
                    <span className='text-xs font-medium text-slate-500 uppercase tracking-wider'>{t('contacts.organization')}</span>
                    <p className='text-sm text-slate-900 mt-1'>{c.organization || '—'}</p>
                  </div>
                  <div>
                    <span className='text-xs font-medium text-slate-500 uppercase tracking-wider'>{t('contacts.source')}</span>
                    <p className='text-sm text-slate-900 mt-1'>{c.source || '—'}</p>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className='bg-slate-50 rounded-xl p-5'>
                <h3 className='font-semibold text-slate-900 mb-3 flex items-center gap-2'>
                  <HiChat className='w-5 h-5 text-slate-400' aria-hidden='true' />{t('contacts.notes')}</h3>
                <p className='text-sm text-slate-700 whitespace-pre-wrap'>{c.notes || 'No notes added yet.'}</p>
              </div>

              {/* Timestamps */}
              <div className='bg-slate-50 rounded-xl p-5'>
                <h3 className='font-semibold text-slate-900 mb-3 flex items-center gap-2'>
                  <HiCalendar className='w-5 h-5 text-slate-400' aria-hidden='true' />{t('contacts.timeline')}</h3>
                <div className='grid grid-cols-2 gap-4'>
                  <div>
                    <span className='text-xs font-medium text-slate-500 uppercase tracking-wider'>{t('contacts.created')}</span>
                    <p className='text-sm text-slate-900 mt-1'>{formatDate(c.createdAt)}</p>
                  </div>
                  <div>
                    <span className='text-xs font-medium text-slate-500 uppercase tracking-wider'>{t('contacts.lastUpdated')}</span>
                    <p className='text-sm text-slate-900 mt-1'>{formatDate(c.updatedAt)}</p>
                  </div>
                  <div>
                    <span className='text-xs font-medium text-slate-500 uppercase tracking-wider'>{t('contacts.lastContact')}</span>
                    <p className='text-sm text-slate-900 mt-1'>{formatDate(c.lastContactAt)}</p>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className='flex flex-wrap gap-2'>
                {c.email && (
                  <a
                    href={`mailto:${c.email}`}
                    className='px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 transition-colors flex items-center gap-2'
                  >
                    <HiMail className='w-4 h-4' aria-hidden='true' />{t('contacts.sendEmail')}</a>
                )}
                {c.phone && (
                  <a
                    href={`tel:${c.phone}`}
                    className='px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2'
                  >
                    <HiPhone className='w-4 h-4' aria-hidden='true' />{t('contacts.call')}</a>
                )}
              </div>
            </div>
          )}

          {activeTab === 'activity' && (
            <div className='text-center py-12'>
              <div className='w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4'>
                <HiCalendar className='w-8 h-8 text-slate-400' aria-hidden='true' />
              </div>
              <h3 className='text-lg font-semibold text-slate-900 mb-2'>{t('contacts.noActivityYet')}</h3>
              <p className='text-slate-500 text-sm'>{t('contacts.activityHistoryWillAppearHere')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Click outside to close. order-first: it sat after the panel, so as
          a flex-1 it took the left of the row and pushed the panel off the
          right edge where justify-end meant to put it. */}
      <div className='order-first flex-1 h-full' onClick={onClose} aria-hidden='true' />
    </div>
  );
}

import React, { useEffect, useId, useMemo, useRef, useState, useCallback } from 'react';
import ConfirmDialog from '../components/ConfirmDialog';
import { useSearchParams, Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { apiClient } from '../utils/http';
import { useBuyerView } from '../contexts/BuyerViewContext';
import { PageHeader, Button, Modal, Input, Select, Textarea } from '../design-system';
import {
  HiPlus, HiSearch, HiX, HiChevronDown, HiChevronRight,
  HiMail, HiPhone, HiCheck, HiPencil, HiTrash, HiRefresh,
  HiViewGrid, HiViewList, HiViewBoards, HiUser, HiCalendar, HiChat, HiUsers, HiEye, HiDownload,
} from 'react-icons/hi';
import { currencySymbol, getLocaleConfig } from '../utils/currency';
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

export default function ContactsBoard() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentUser } = useSelector((state) => state.user);
  const { isBuyerViewMode } = useBuyerView();
  const { showSuccess, showError } = useNotification();
  const isAdmin = currentUser?.role === 'admin';

  // Data state
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // UI state
  const [view, setView] = useState('cards'); // 'cards' | 'table'
  const [selectedContact, setSelectedContact] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  /**
   * Rows picked for a bulk action.
   *
   * Held as a Set of ids rather than a flag on each contact, so re-fetching the
   * list does not silently clear or resurrect a selection.
   */
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [agents, setAgents] = useState([]);
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [creating, setCreating] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [showStatusDropdown, setShowStatusDropdown] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  // Filters
  const q = searchParams.get('q') || '';
  const statusFilter = searchParams.get('status') || '';
  const typeFilter = searchParams.get('contactType') || '';
  const temperatureFilter = searchParams.get('temperature') || '';

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
      params.set('limit', '200');
      const response = await apiClient.get(`/clients?${params.toString()}`);
      const data = response?.data || response || [];
      setContacts(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e?.message || 'Failed to load contacts');
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, [canAccess, q, statusFilter, typeFilter, temperatureFilter]);

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

  const toggleSelected = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (ids) => {
    setSelectedIds((prev) => {
      const allSelected = ids.every((id) => prev.has(id));
      if (allSelected) {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      }
      return new Set([...prev, ...ids]);
    });
  };

  /** One request for the whole selection, not one per row. */
  const applyBulk = async (action, value) => {
    const ids = [...selectedIds];
    if (!ids.length) return;

    try {
      const res = await apiClient.post('/clients/bulk', { ids, action, value });
      setSelectedIds(new Set());
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

  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  };

  const toggleGroup = (status) => {
    setCollapsedGroups((prev) => ({ ...prev, [status]: !prev[status] }));
  };

  const handleCreateContact = async (formData) => {
    setCreating(true);
    setError('');
    try {
      await apiClient.post('/clients', formData);
      setShowCreateModal(false);
      await fetchContacts();
    } catch (e) {
      setError(e?.message || 'Failed to create contact');
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
    setEditingContact(contact);
    setShowEditModal(true);
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
      <div className='bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden'>
        {/* Toolbar */}
        <div className='px-4 py-3 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center gap-3'>
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
            <div className='relative flex-1 max-w-xs'>
              <HiSearch className='w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2' aria-hidden='true' />
              <input
                className='w-full pl-9 pr-8 py-2 rounded-lg border border-slate-200 bg-white text-sm outline-none focus:ring-2 focus:ring-brand-500 focus:border-indigo-400 transition-all placeholder:text-slate-500'
                placeholder={t('contacts.searchClients')}
                aria-label={t('contacts.searchClients')}
                value={q}
                onChange={(e) => setParam('q', e.target.value)}
              />
              {q && (
                <button type='button' onClick={() => setParam('q', '')} aria-label='Clear search' className='absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700'>
                  <HiX className='w-4 h-4' aria-hidden='true' />
                </button>
              )}
            </div>

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

            {(q || statusFilter || typeFilter) && (
              <button
                onClick={() => setSearchParams(new URLSearchParams())}
                className='px-3 py-2 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 text-sm font-medium transition-colors'
              >{t('contacts.clearAll')}</button>
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

        {/* Loading skeleton */}
        {loading && (
          <div className='p-6'>
            <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div key={i} className='bg-white border border-slate-200 rounded-xl p-4 animate-pulse'>
                  <div className='flex items-center gap-3 mb-3'>
                    <div className='w-10 h-10 rounded-full bg-slate-200' />
                    <div className='flex-1'>
                      <div className='h-4 bg-slate-200 rounded w-2/3 mb-1' />
                      <div className='h-3 bg-slate-100 rounded w-1/2' />
                    </div>
                  </div>
                  <div className='h-3 bg-slate-100 rounded w-full mb-2' />
                  <div className='h-3 bg-slate-100 rounded w-3/4' />
                </div>
              ))}
            </div>
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
                      <button
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

            {contacts.length === 0 && !loading && (
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

        {/* Table View */}
        {!loading && view === 'table' && (
          <div className='overflow-x-auto'>
            <table className='min-w-full text-sm'>
              <thead className='bg-slate-50/80 sticky top-0 z-10'>
                <tr className='border-b border-slate-200'>
                  <th className='w-10 pl-4 pr-1 py-3'>
                    <input
                      type='checkbox'
                      aria-label={t('contacts.selectAll')}
                      checked={contacts.length > 0 && contacts.every((c) => selectedIds.has(c._id))}
                      onChange={() => toggleSelectAll(contacts.map((c) => c._id))}
                      className='w-4 h-4 rounded border-slate-300 text-indigo-600 cursor-pointer'
                    />
                  </th>
                  <th className='text-left pl-1 pr-2 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider w-[250px]'>{t('contacts.contact')}</th>
                  <th className='text-left px-3 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider'>{t('contacts.email')}</th>
                  <th className='text-left px-3 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider'>{t('contacts.phone')}</th>
                  <th className='text-left px-3 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider'>{t('contacts.status')}</th>
                  <th className='text-left px-3 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider'>{t('contacts.notes')}</th>
                  <th className='text-right px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider w-[100px]'></th>
                </tr>
              </thead>
              <tbody className='divide-y divide-slate-100'>
                {STATUS_ORDER.map((status) => {
                  const items = groupedContacts.get(status) || [];
                  if (items.length === 0) return null;
                  const config = STATUS_CONFIG[status] || STATUS_CONFIG.lead;
                  const isCollapsed = collapsedGroups[status];

                  return (
                    <React.Fragment key={status}>
                      {/* Group header row */}
                      <tr>
                        <td colSpan={7} className='px-0 py-0'>
                          <button
                            type='button'
                            aria-expanded={!isCollapsed}
                            onClick={() => toggleGroup(status)}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 ${config.bgLight} border-l-4 ${config.border.replace('border-', 'border-l-')} hover:opacity-90 transition-colors`}
                          >
                            {isCollapsed ? (
                              <HiChevronRight className={`w-4 h-4 ${config.textColor}`} aria-hidden='true' />
                            ) : (
                              <HiChevronDown className={`w-4 h-4 ${config.textColor}`} aria-hidden='true' />
                            )}
                            <span className={`font-semibold text-sm ${config.textColor}`}>{config.label}</span>
                            <span className='text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full'>
                              {items.length}
                            </span>
                          </button>
                        </td>
                      </tr>
                      {/* Contact rows */}
                      {!isCollapsed && items.map((contact) => (
                        <tr
                          key={contact._id}
                          className='group hover:bg-indigo-50/40 transition-colors cursor-pointer'
                          onClick={() => setSelectedContact(contact)}
                        >
                          {/* stopPropagation: ticking a row must not also open it */}
                          <td className='w-10 pl-4 pr-1 py-3' onClick={(e) => e.stopPropagation()}>
                            <input
                              type='checkbox'
                              aria-label={`Select ${contact.name || 'contact'}`}
                              checked={selectedIds.has(contact._id)}
                              onChange={() => toggleSelected(contact._id)}
                              className='w-4 h-4 rounded border-slate-300 text-indigo-600 cursor-pointer'
                            />
                          </td>
                          <td className='pl-1 pr-2 py-3'>
                            <div className='flex items-center gap-3'>
                              <div className={`w-9 h-9 rounded-full ${config.color} flex items-center justify-center text-white text-sm font-semibold flex-shrink-0`}>
                                {(contact.name?.[0] || '?').toUpperCase()}
                              </div>
                              <div className='min-w-0'>
                                {/* A real button: the row's onClick is mouse-only. */}
                                <button
                                  type='button'
                                  onClick={(e) => { e.stopPropagation(); setSelectedContact(contact); }}
                                  className='block max-w-full text-left font-semibold text-slate-900 text-[13px] truncate group-hover:text-indigo-700 transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'
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
                          <td className='px-3 py-3'>
                            {contact.email ? (
                              <a
                                href={`mailto:${contact.email}`}
                                onClick={(e) => e.stopPropagation()}
                                className='text-indigo-600 hover:underline text-[13px] truncate block max-w-[200px]'
                              >
                                {contact.email}
                              </a>
                            ) : (
                              <span className='text-slate-500 text-[13px]'>—</span>
                            )}
                          </td>
                          <td className='px-3 py-3' onClick={(e) => e.stopPropagation()}>
                            {contact.phone ? (
                              <span className='flex items-center gap-1.5'>
                                <a
                                  href={`tel:${contact.phone}`}
                                  className='text-slate-700 hover:text-indigo-600 text-[13px]'
                                >
                                  {contact.phone}
                                </a>
                                {/* Compact: the row is dense, and an agent
                                    scanning the list wants one tap to chat. */}
                                <WhatsAppButton compact phone={contact.phone} />
                              </span>
                            ) : (
                              <span className='text-slate-500 text-[13px]'>—</span>
                            )}
                          </td>
                          <td className='px-3 py-3'>
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${config.color} text-white`}>
                              {config.label}
                            </span>
                          </td>
                          <td className='px-3 py-3'>
                            <span className='text-slate-600 text-[13px] truncate block max-w-[200px]'>
                              {contact.notes || '—'}
                            </span>
                          </td>
                          <td className='px-4 py-3 text-right'>
                            <div className='flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity'>
                              <button
                                type='button'
                                onClick={(e) => { e.stopPropagation(); openEditModal(contact); }}
                                className='p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors'
                                title={t('contacts.edit')}
                                aria-label={`Edit ${contact.name || 'contact'}`}
                              >
                                <HiPencil className='w-4 h-4' aria-hidden='true' />
                              </button>
                              <button
                                type='button'
                                onClick={(e) => { e.stopPropagation(); setPendingDelete(contact._id); }}
                                className='p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors'
                                title={t('contacts.delete')}
                                aria-label={`Delete ${contact.name || 'contact'}`}
                              >
                                <HiTrash className='w-4 h-4' aria-hidden='true' />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
                {contacts.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} className='px-4 py-16 text-center'>
                      <div className='flex flex-col items-center gap-3'>
                        <div className='w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center'>
                          <HiUser className='w-6 h-6 text-slate-400' aria-hidden='true' />
                        </div>
                        <p className='text-slate-500 text-sm'>{t('contacts.noClientsFound')}</p>
                        <button
                          onClick={() => setShowCreateModal(true)}
                          className='text-sm font-medium text-indigo-600 hover:text-indigo-700'
                        >{t('contacts.addYourFirstClient2')}</button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Footer summary */}
            {contacts.length > 0 && (
              <div className='px-4 py-2.5 border-t border-slate-200 bg-slate-50/50 flex items-center justify-between'>
                <span className='text-xs text-slate-500'>{contacts.length} contact{contacts.length === 1 ? '' : 's'} total</span>
              </div>
            )}
          </div>
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
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateContact}
          loading={creating}
          title={t('contacts.newClient')}
        />
      )}

      {/* Edit Contact Modal */}
      {showEditModal && editingContact && (
        <ContactFormModal
          contact={editingContact}
          onClose={() => { setShowEditModal(false); setEditingContact(null); }}
          onSubmit={(data) => handleUpdateContact(editingContact._id, data)}
          loading={false}
          title={t('contacts.editClient')}
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
        title={`Delete ${selectedIds.size} client${selectedIds.size === 1 ? '' : 's'}?`}
        description={t('contacts.thisActionCannotBeUndone')}
        confirmLabel={t('contacts.delete')}
        onConfirm={() => applyBulk('delete')}
        onCancel={() => setPendingBulkDelete(false)}
      />

      {/* Appears only once rows are ticked. */}
      <BulkActionBar count={selectedIds.size} onClear={() => setSelectedIds(new Set())}>
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
        <div className='flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity'>
          <button
            type='button'
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className='p-1 rounded text-slate-500 hover:text-slate-700 hover:bg-slate-100'
            title={t('contacts.edit')}
            aria-label={`Edit ${contact.name || 'contact'}`}
          >
            <HiPencil className='w-3.5 h-3.5' aria-hidden='true' />
          </button>
          <button
            type='button'
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className='p-1 rounded text-slate-500 hover:text-rose-600 hover:bg-rose-50'
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
function ContactFormModal({ contact, onClose, onSubmit, loading, title }) {
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
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder={t('contacts.emailExampleCom')}
          />
          <Input
            label={t('contacts.phone')}
            type='tel'
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            placeholder='+1 234 567 8900'
          />
        </div>
        <Input
          label={t('contacts.alternatePhone')}
          type='tel'
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
                value={formData.budgetMin}
                onChange={set('budgetMin')}
                placeholder={t('contacts.eG2000000')}
                min={0}
              />
              <Input
                label={`Budget Max (${currencySymbol()})`}
                type='number'
                value={formData.budgetMax}
                onChange={set('budgetMax')}
                placeholder={t('contacts.eG5000000')}
                min={0}
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

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { apiClient } from '../utils/http';
import { useBuyerView } from '../contexts/BuyerViewContext';
import {
  HiPlus, HiSearch, HiX, HiChevronDown, HiChevronRight,
  HiMail, HiPhone, HiCheck, HiPencil, HiTrash, HiRefresh,
  HiViewGrid, HiViewList, HiUser, HiCalendar, HiChat,
} from 'react-icons/hi';

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
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentUser } = useSelector((state) => state.user);
  const { isBuyerViewMode } = useBuyerView();

  // Data state
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // UI state
  const [view, setView] = useState('cards'); // 'cards' | 'table'
  const [selectedContact, setSelectedContact] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [creating, setCreating] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [showStatusDropdown, setShowStatusDropdown] = useState(null);

  // Filters
  const q = searchParams.get('q') || '';
  const statusFilter = searchParams.get('status') || '';

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
      params.set('limit', '200');
      const response = await apiClient.get(`/clients?${params.toString()}`);
      const data = response?.data || response || [];
      setContacts(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to load contacts:', e);
      setError(e?.message || 'Failed to load contacts');
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, [canAccess, q, statusFilter]);

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
    if (!window.confirm('Are you sure you want to delete this contact?')) return;
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
        <p className='text-slate-600'>Access denied</p>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div className='flex flex-col md:flex-row md:items-center md:justify-between gap-4'>
        <div className='flex items-center gap-3'>
          <h1 className='text-xl font-bold text-slate-900'>Contacts</h1>
          <span className='text-xs font-medium text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full'>
            {contacts.length}
          </span>
        </div>
        <div className='flex items-center gap-2'>
          <button
            onClick={fetchContacts}
            className='px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-sm font-medium flex items-center gap-1.5 transition-colors'
          >
            <HiRefresh className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className='px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 text-sm font-medium flex items-center gap-2 shadow-sm transition-colors'
          >
            <HiPlus className='w-4 h-4' />
            New contact
          </button>
        </div>
      </div>

      {/* Board container */}
      <div className='bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden'>
        {/* Toolbar */}
        <div className='px-4 py-3 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center gap-3'>
          {/* View tabs */}
          <div className='flex items-center gap-1 bg-slate-100 p-1 rounded-lg'>
            <button
              onClick={() => setView('cards')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 transition-colors ${
                view === 'cards' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <HiViewGrid className='w-4 h-4' />
              Cards
            </button>
            <button
              onClick={() => setView('table')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 transition-colors ${
                view === 'table' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <HiViewList className='w-4 h-4' />
              Table
            </button>
          </div>

          <div className='h-6 w-px bg-slate-200 hidden lg:block' />

          {/* Search and filters */}
          <div className='flex flex-wrap items-center gap-2 flex-1'>
            <div className='relative flex-1 max-w-xs'>
              <HiSearch className='w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2' />
              <input
                className='w-full pl-9 pr-8 py-2 rounded-lg border border-slate-200 bg-white text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition-all placeholder:text-slate-400'
                placeholder='Search contacts...'
                value={q}
                onChange={(e) => setParam('q', e.target.value)}
              />
              {q && (
                <button onClick={() => setParam('q', '')} className='absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600'>
                  <HiX className='w-4 h-4' />
                </button>
              )}
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setParam('status', e.target.value)}
              className='px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 outline-none transition-all'
            >
              <option value=''>All statuses</option>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>{STATUS_CONFIG[s]?.label || s}</option>
              ))}
            </select>

            {(q || statusFilter) && (
              <button
                onClick={() => setSearchParams(new URLSearchParams())}
                className='px-3 py-2 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 text-sm font-medium transition-colors'
              >
                Clear all
              </button>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className='px-4 py-2.5 text-sm bg-rose-50 border-b border-rose-200 text-rose-700 flex items-center gap-2'>
            <svg className='w-4 h-4 flex-shrink-0' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' />
            </svg>
            {error}
            <button onClick={() => setError('')} className='ml-auto text-rose-500 hover:text-rose-700'>
              <HiX className='w-4 h-4' />
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

        {/* Cards View */}
        {!loading && view === 'cards' && (
          <div className='p-4'>
            {STATUS_ORDER.map((status) => {
              const items = groupedContacts.get(status) || [];
              if (items.length === 0 && statusFilter && statusFilter !== status) return null;
              const config = STATUS_CONFIG[status] || STATUS_CONFIG.lead;
              const isCollapsed = collapsedGroups[status];

              return (
                <div key={status} className='mb-6 last:mb-0'>
                  {/* Group header */}
                  <button
                    onClick={() => toggleGroup(status)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg mb-3 transition-colors ${config.bgLight} hover:opacity-90`}
                  >
                    <div className={`w-1 h-6 rounded-full ${config.color}`} />
                    {isCollapsed ? (
                      <HiChevronRight className={`w-4 h-4 ${config.textColor}`} />
                    ) : (
                      <HiChevronDown className={`w-4 h-4 ${config.textColor}`} />
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
                          onDelete={() => handleDeleteContact(contact._id)}
                          onStatusChange={(newStatus) => handleStatusChange(contact._id, newStatus)}
                          showStatusDropdown={showStatusDropdown === contact._id}
                          setShowStatusDropdown={setShowStatusDropdown}
                        />
                      ))}
                      {/* Add contact card */}
                      <button
                        onClick={() => setShowCreateModal(true)}
                        className='border-2 border-dashed border-slate-200 rounded-xl p-4 min-h-[140px] flex flex-col items-center justify-center text-slate-400 hover:border-slate-400 hover:text-slate-600 transition-colors'
                      >
                        <HiPlus className='w-6 h-6 mb-2' />
                        <span className='text-sm font-medium'>Add contact</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {contacts.length === 0 && !loading && (
              <div className='text-center py-16'>
                <div className='w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4'>
                  <HiUser className='w-8 h-8 text-slate-400' />
                </div>
                <h3 className='text-lg font-semibold text-slate-900 mb-2'>No contacts yet</h3>
                <p className='text-slate-500 mb-4'>Get started by adding your first contact</p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className='px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 text-sm font-medium inline-flex items-center gap-2'
                >
                  <HiPlus className='w-4 h-4' />
                  Add contact
                </button>
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
                  <th className='text-left pl-4 pr-2 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider w-[250px]'>Contact</th>
                  <th className='text-left px-3 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider'>Email</th>
                  <th className='text-left px-3 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider'>Phone</th>
                  <th className='text-left px-3 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider'>Status</th>
                  <th className='text-left px-3 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider'>Notes</th>
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
                        <td colSpan={6} className='px-0 py-0'>
                          <button
                            onClick={() => toggleGroup(status)}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 ${config.bgLight} border-l-4 ${config.border.replace('border-', 'border-l-')} hover:opacity-90 transition-colors`}
                          >
                            {isCollapsed ? (
                              <HiChevronRight className={`w-4 h-4 ${config.textColor}`} />
                            ) : (
                              <HiChevronDown className={`w-4 h-4 ${config.textColor}`} />
                            )}
                            <span className={`font-semibold text-sm ${config.textColor}`}>{config.label}</span>
                            <span className='text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full'>
                              {items.length}
                            </span>
                          </button>
                        </td>
                      </tr>
                      {/* Contact rows */}
                      {!isCollapsed && items.map((contact) => (
                        <tr
                          key={contact._id}
                          className='group hover:bg-blue-50/40 transition-colors cursor-pointer'
                          onClick={() => setSelectedContact(contact)}
                        >
                          <td className='pl-4 pr-2 py-3'>
                            <div className='flex items-center gap-3'>
                              <div className={`w-9 h-9 rounded-full ${config.color} flex items-center justify-center text-white text-sm font-semibold flex-shrink-0`}>
                                {(contact.name?.[0] || '?').toUpperCase()}
                              </div>
                              <div className='min-w-0'>
                                <div className='font-semibold text-slate-900 text-[13px] truncate group-hover:text-blue-700 transition-colors'>
                                  {contact.name}
                                </div>
                                {contact.organization && (
                                  <div className='text-[11px] text-slate-400 truncate'>{contact.organization}</div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className='px-3 py-3'>
                            {contact.email ? (
                              <a
                                href={`mailto:${contact.email}`}
                                onClick={(e) => e.stopPropagation()}
                                className='text-blue-600 hover:underline text-[13px] truncate block max-w-[200px]'
                              >
                                {contact.email}
                              </a>
                            ) : (
                              <span className='text-slate-400 text-[13px]'>—</span>
                            )}
                          </td>
                          <td className='px-3 py-3'>
                            {contact.phone ? (
                              <a
                                href={`tel:${contact.phone}`}
                                onClick={(e) => e.stopPropagation()}
                                className='text-slate-700 hover:text-blue-600 text-[13px]'
                              >
                                {contact.phone}
                              </a>
                            ) : (
                              <span className='text-slate-400 text-[13px]'>—</span>
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
                            <div className='flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity'>
                              <button
                                onClick={(e) => { e.stopPropagation(); openEditModal(contact); }}
                                className='p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors'
                                title='Edit'
                              >
                                <HiPencil className='w-4 h-4' />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteContact(contact._id); }}
                                className='p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors'
                                title='Delete'
                              >
                                <HiTrash className='w-4 h-4' />
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
                          <HiUser className='w-6 h-6 text-slate-400' />
                        </div>
                        <p className='text-slate-500 text-sm'>No contacts found</p>
                        <button
                          onClick={() => setShowCreateModal(true)}
                          className='text-sm font-medium text-blue-600 hover:text-blue-700'
                        >
                          + Add your first contact
                        </button>
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
          onDelete={() => handleDeleteContact(selectedContact._id)}
          onStatusChange={(newStatus) => handleStatusChange(selectedContact._id, newStatus)}
        />
      )}

      {/* Create Contact Modal */}
      {showCreateModal && (
        <ContactFormModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateContact}
          loading={creating}
          title='Create New Contact'
        />
      )}

      {/* Edit Contact Modal */}
      {showEditModal && editingContact && (
        <ContactFormModal
          contact={editingContact}
          onClose={() => { setShowEditModal(false); setEditingContact(null); }}
          onSubmit={(data) => handleUpdateContact(editingContact._id, data)}
          loading={false}
          title='Edit Contact'
        />
      )}
    </div>
  );
}

// ContactCard component
function ContactCard({ contact, onSelect, onEdit, onDelete, onStatusChange, showStatusDropdown, setShowStatusDropdown }) {
  const config = STATUS_CONFIG[contact.status] || STATUS_CONFIG.lead;

  return (
    <div
      className='bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md hover:border-slate-300 transition-all cursor-pointer group'
      onClick={onSelect}
    >
      {/* Header */}
      <div className='flex items-start justify-between mb-3'>
        <div className='flex items-center gap-3 min-w-0'>
          <div className={`w-10 h-10 rounded-full ${config.color} flex items-center justify-center text-white text-sm font-bold flex-shrink-0`}>
            {(contact.name?.[0] || '?').toUpperCase()}
          </div>
          <div className='min-w-0'>
            <h3 className='font-semibold text-slate-900 text-sm truncate group-hover:text-blue-700 transition-colors'>
              {contact.name}
            </h3>
            {contact.organization && (
              <p className='text-xs text-slate-400 truncate'>{contact.organization}</p>
            )}
          </div>
        </div>
        <div className='flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity'>
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className='p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100'
            title='Edit'
          >
            <HiPencil className='w-3.5 h-3.5' />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className='p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50'
            title='Delete'
          >
            <HiTrash className='w-3.5 h-3.5' />
          </button>
        </div>
      </div>

      {/* Contact info */}
      <div className='space-y-1.5 mb-3'>
        {contact.email && (
          <a
            href={`mailto:${contact.email}`}
            onClick={(e) => e.stopPropagation()}
            className='flex items-center gap-2 text-xs text-slate-600 hover:text-blue-600 truncate'
          >
            <HiMail className='w-3.5 h-3.5 text-slate-400 flex-shrink-0' />
            <span className='truncate'>{contact.email}</span>
          </a>
        )}
        {contact.phone && (
          <a
            href={`tel:${contact.phone}`}
            onClick={(e) => e.stopPropagation()}
            className='flex items-center gap-2 text-xs text-slate-600 hover:text-blue-600'
          >
            <HiPhone className='w-3.5 h-3.5 text-slate-400 flex-shrink-0' />
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
          onClick={(e) => {
            e.stopPropagation();
            setShowStatusDropdown(showStatusDropdown ? null : contact._id);
          }}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${config.color} text-white hover:opacity-90 transition-opacity`}
        >
          {config.label}
          <HiChevronDown className='w-3 h-3' />
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
                  onClick={() => onStatusChange(s)}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 flex items-center gap-2 ${
                    contact.status === s ? 'bg-slate-50 font-medium' : ''
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full ${sConfig.color}`} />
                  {sConfig.label}
                  {contact.status === s && <HiCheck className='w-4 h-4 ml-auto text-blue-600' />}
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
  const [formData, setFormData] = useState({
    name: contact?.name || '',
    email: contact?.email || '',
    phone: contact?.phone || '',
    notes: contact?.notes || '',
    status: contact?.status || 'lead',
    organization: contact?.organization || '',
    source: contact?.source || '',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className='fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4'>
      <div className='bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col'>
        <div className='px-6 py-4 border-b border-slate-200 flex items-center justify-between flex-shrink-0'>
          <h2 className='text-lg font-semibold text-slate-900'>{title}</h2>
          <button onClick={onClose} className='p-1 rounded hover:bg-slate-100 text-slate-500'>
            <HiX className='w-5 h-5' />
          </button>
        </div>
        <form onSubmit={handleSubmit} className='p-6 space-y-4 overflow-y-auto flex-1'>
          <div>
            <label className='block text-sm font-medium text-slate-700 mb-1'>Name *</label>
            <input
              type='text'
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className='w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400 outline-none transition-all'
              placeholder='Enter contact name'
            />
          </div>
          <div className='grid grid-cols-2 gap-4'>
            <div>
              <label className='block text-sm font-medium text-slate-700 mb-1'>Email</label>
              <input
                type='email'
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className='w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400 outline-none transition-all'
                placeholder='email@example.com'
              />
            </div>
            <div>
              <label className='block text-sm font-medium text-slate-700 mb-1'>Phone</label>
              <input
                type='tel'
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className='w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400 outline-none transition-all'
                placeholder='+1 234 567 8900'
              />
            </div>
          </div>
          <div className='grid grid-cols-2 gap-4'>
            <div>
              <label className='block text-sm font-medium text-slate-700 mb-1'>Organization</label>
              <input
                type='text'
                value={formData.organization}
                onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
                className='w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400 outline-none transition-all'
                placeholder='Company name'
              />
            </div>
            <div>
              <label className='block text-sm font-medium text-slate-700 mb-1'>Source</label>
              <input
                type='text'
                value={formData.source}
                onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                className='w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400 outline-none transition-all'
                placeholder='e.g., Website, Referral'
              />
            </div>
          </div>
          <div>
            <label className='block text-sm font-medium text-slate-700 mb-1'>Status</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className='w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400 outline-none transition-all bg-white'
            >
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>{STATUS_CONFIG[s]?.label || s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className='block text-sm font-medium text-slate-700 mb-1'>Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className='w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400 outline-none transition-all resize-none'
              placeholder='Add notes about this contact...'
            />
          </div>
          <div className='flex items-center justify-end gap-3 pt-2'>
            <button
              type='button'
              onClick={onClose}
              className='px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors'
            >
              Cancel
            </button>
            <button
              type='submit'
              disabled={loading || !formData.name}
              className='px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
            >
              {loading ? 'Saving...' : contact ? 'Save Changes' : 'Create Contact'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ContactDetailPanel component
function ContactDetailPanel({ contact, onClose, onEdit, onDelete, onStatusChange }) {
  const c = contact;
  const config = STATUS_CONFIG[c.status] || STATUS_CONFIG.lead;
  const [activeTab, setActiveTab] = useState('overview');
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className='fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-start justify-end z-50'>
      <div
        className='w-full max-w-2xl h-full bg-white shadow-2xl overflow-hidden flex flex-col animate-slide-in-right'
        style={{ animation: 'slideInRight 0.2s ease-out' }}
      >
        {/* Header */}
        <div className='bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0'>
          <div className='flex items-start justify-between'>
            <div className='flex items-center gap-4'>
              <div className={`w-14 h-14 rounded-full ${config.color} flex items-center justify-center text-white text-xl font-bold`}>
                {(c.name?.[0] || '?').toUpperCase()}
              </div>
              <div>
                <h2 className='text-xl font-bold text-slate-900'>{c.name}</h2>
                {c.organization && <p className='text-sm text-slate-500'>{c.organization}</p>}
              </div>
            </div>
            <div className='flex items-center gap-2'>
              <button
                onClick={onEdit}
                className='px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 transition-colors'
              >
                <HiPencil className='w-4 h-4' />
                Edit
              </button>
              <button
                onClick={onDelete}
                className='px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-rose-600 hover:bg-rose-50 hover:border-rose-200 flex items-center gap-1.5 transition-colors'
              >
                <HiTrash className='w-4 h-4' />
              </button>
              <button onClick={onClose} className='p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors'>
                <HiX className='w-5 h-5' />
              </button>
            </div>
          </div>

          {/* Status badge */}
          <div className='mt-4 relative inline-block'>
            <button
              onClick={() => setShowStatusDropdown(!showStatusDropdown)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold ${config.color} text-white hover:opacity-90 transition-opacity`}
            >
              {config.label}
              <HiChevronDown className='w-4 h-4' />
            </button>
            {showStatusDropdown && (
              <div className='absolute top-full left-0 mt-1 w-44 bg-white border border-slate-200 rounded-lg shadow-xl z-30 py-1'>
                {STATUS_ORDER.map((s) => {
                  const sConfig = STATUS_CONFIG[s];
                  return (
                    <button
                      key={s}
                      onClick={() => { onStatusChange(s); setShowStatusDropdown(false); }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2 ${
                        c.status === s ? 'bg-slate-50 font-medium' : ''
                      }`}
                    >
                      <div className={`w-2.5 h-2.5 rounded-full ${sConfig.color}`} />
                      {sConfig.label}
                      {c.status === s && <HiCheck className='w-4 h-4 ml-auto text-blue-600' />}
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
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'text-slate-900 border-slate-900'
                    : 'text-slate-500 border-transparent hover:text-slate-700'
                }`}
              >
                <tab.icon className='w-4 h-4' />
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
                  <HiUser className='w-5 h-5 text-slate-400' />
                  Contact Details
                </h3>
                <div className='grid grid-cols-2 gap-4'>
                  <div>
                    <label className='text-xs font-medium text-slate-500 uppercase tracking-wider'>Email</label>
                    {c.email ? (
                      <a href={`mailto:${c.email}`} className='block text-sm text-blue-600 hover:underline mt-1 truncate'>
                        {c.email}
                      </a>
                    ) : (
                      <p className='text-sm text-slate-400 mt-1'>—</p>
                    )}
                  </div>
                  <div>
                    <label className='text-xs font-medium text-slate-500 uppercase tracking-wider'>Phone</label>
                    {c.phone ? (
                      <a href={`tel:${c.phone}`} className='block text-sm text-slate-900 hover:text-blue-600 mt-1'>
                        {c.phone}
                      </a>
                    ) : (
                      <p className='text-sm text-slate-400 mt-1'>—</p>
                    )}
                  </div>
                  <div>
                    <label className='text-xs font-medium text-slate-500 uppercase tracking-wider'>Organization</label>
                    <p className='text-sm text-slate-900 mt-1'>{c.organization || '—'}</p>
                  </div>
                  <div>
                    <label className='text-xs font-medium text-slate-500 uppercase tracking-wider'>Source</label>
                    <p className='text-sm text-slate-900 mt-1'>{c.source || '—'}</p>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className='bg-slate-50 rounded-xl p-5'>
                <h3 className='font-semibold text-slate-900 mb-3 flex items-center gap-2'>
                  <HiChat className='w-5 h-5 text-slate-400' />
                  Notes
                </h3>
                <p className='text-sm text-slate-700 whitespace-pre-wrap'>{c.notes || 'No notes added yet.'}</p>
              </div>

              {/* Timestamps */}
              <div className='bg-slate-50 rounded-xl p-5'>
                <h3 className='font-semibold text-slate-900 mb-3 flex items-center gap-2'>
                  <HiCalendar className='w-5 h-5 text-slate-400' />
                  Timeline
                </h3>
                <div className='grid grid-cols-2 gap-4'>
                  <div>
                    <label className='text-xs font-medium text-slate-500 uppercase tracking-wider'>Created</label>
                    <p className='text-sm text-slate-900 mt-1'>{formatDate(c.createdAt)}</p>
                  </div>
                  <div>
                    <label className='text-xs font-medium text-slate-500 uppercase tracking-wider'>Last Updated</label>
                    <p className='text-sm text-slate-900 mt-1'>{formatDate(c.updatedAt)}</p>
                  </div>
                  <div>
                    <label className='text-xs font-medium text-slate-500 uppercase tracking-wider'>Last Contact</label>
                    <p className='text-sm text-slate-900 mt-1'>{formatDate(c.lastContactAt)}</p>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className='flex flex-wrap gap-2'>
                {c.email && (
                  <a
                    href={`mailto:${c.email}`}
                    className='px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2'
                  >
                    <HiMail className='w-4 h-4' />
                    Send Email
                  </a>
                )}
                {c.phone && (
                  <a
                    href={`tel:${c.phone}`}
                    className='px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2'
                  >
                    <HiPhone className='w-4 h-4' />
                    Call
                  </a>
                )}
              </div>
            </div>
          )}

          {activeTab === 'activity' && (
            <div className='text-center py-12'>
              <div className='w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4'>
                <HiCalendar className='w-8 h-8 text-slate-400' />
              </div>
              <h3 className='text-lg font-semibold text-slate-900 mb-2'>No activity yet</h3>
              <p className='text-slate-500 text-sm'>Activity history will appear here</p>
            </div>
          )}
        </div>
      </div>

      {/* Click outside to close */}
      <div className='flex-1 h-full' onClick={onClose} />
    </div>
  );
}

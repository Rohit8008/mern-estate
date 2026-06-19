import { useEffect, useState, useRef, useCallback } from 'react';
import { useCrmAccess } from '../hooks/useCrmAccess';
import { apiClient } from '../utils/http';
import ConfirmDialog from '../components/ConfirmDialog';
import { Button, Badge, Input, Select, Textarea, KpiCard, EmptyState, Spinner } from '../design-system';
import {
  HiPlus, HiSearch, HiX, HiCurrencyDollar, HiCheck, HiClock,
  HiDownload, HiPencil, HiTrash, HiHome, HiChevronDown,
} from 'react-icons/hi';

// ─── constants ─────────────────────────────────────────────────────────────────
const TYPE_OPTS   = ['All', 'Sale', 'Rent', 'Lease'];
const STATUS_OPTS = ['All', 'Pending', 'In Progress', 'Completed', 'Cancelled'];

const STATUS_META = {
  pending:     { label: 'Pending',     variant: 'warning' },
  in_progress: { label: 'In Progress', variant: 'info'    },
  completed:   { label: 'Completed',   variant: 'success' },
  cancelled:   { label: 'Cancelled',   variant: 'error'   },
};

const fmtINR = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

// ─── EntityPicker ──────────────────────────────────────────────────────────────
// Searchable async-dropdown linked to real DB records
function EntityPicker({ label, placeholder, value, onSelect, fetchFn, renderItem }) {
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const ref   = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    setQuery(value?.name ?? '');
  }, [value?.name]);

  const search = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try { setResults(await fetchFn(q)); }
    catch (_) { setResults([]); }
    finally { setLoading(false); }
  }, [fetchFn]);

  const handleInput = (e) => {
    const q = e.target.value;
    setQuery(q);
    setOpen(true);
    if (q !== value?.name) onSelect(null, q);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => search(q), 300);
  };

  const handlePick = (item) => {
    onSelect(item);
    setQuery(item.name);
    setOpen(false);
    setResults([]);
  };

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div className='flex flex-col gap-1' ref={ref}>
      {label && <label className='text-sm font-medium text-slate-700'>{label}</label>}
      <div className='relative'>
        <span className='absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none'>
          <HiSearch className='w-4 h-4' />
        </span>
        <input
          type='text'
          value={query}
          onChange={handleInput}
          onFocus={() => { if (query) { setOpen(true); search(query); } }}
          placeholder={placeholder}
          className='w-full border border-slate-300 rounded-lg text-sm text-slate-900 pl-9 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400'
        />
        {value && (
          <button
            type='button'
            onClick={() => { onSelect(null); setQuery(''); setResults([]); }}
            className='absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600'
          >
            <HiX className='w-3.5 h-3.5' />
          </button>
        )}
        {open && (results.length > 0 || loading) && (
          <div className='absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-lg shadow-lg max-h-52 overflow-y-auto'>
            {loading && (
              <div className='px-3 py-2 text-sm text-slate-400 flex items-center gap-2'>
                <Spinner size='sm' /> Searching…
              </div>
            )}
            {!loading && results.map((item) => (
              <button
                key={item._id}
                type='button'
                onClick={() => handlePick(item)}
                className='w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b border-slate-50 last:border-0'
              >
                {renderItem(item)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TransactionDrawer ─────────────────────────────────────────────────────────
function TransactionDrawer({ open, onClose, transaction, onSaved }) {
  const EMPTY = {
    property: null,
    manualPropertyName: '',
    client: null,
    manualClientName: '',
    type: 'sale',
    amount: '',
    commissionPercent: '',
    commission: '',
    status: 'pending',
    date: new Date().toISOString().split('T')[0],
    notes: '',
    coAgent: null,
    coAgentCommissionPercent: '',
    coAgentCommission: '',
  };

  const [form, setForm]   = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  useEffect(() => {
    if (!open) return;
    if (transaction) {
      setForm({
        property: transaction.property ? { _id: transaction.property, name: transaction.propertyName } : null,
        manualPropertyName: transaction.property ? '' : (transaction.propertyName || ''),
        client: transaction.client ? { _id: transaction.client, name: transaction.clientName } : null,
        manualClientName: transaction.client ? '' : (transaction.clientName || ''),
        type: transaction.type || 'sale',
        amount: transaction.amount ?? '',
        commissionPercent: transaction.commissionPercent ?? '',
        commission: transaction.commission ?? '',
        status: transaction.status || 'pending',
        date: transaction.date
          ? new Date(transaction.date).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0],
        notes: transaction.notes || '',
        coAgent: transaction.coAgent ? { _id: transaction.coAgent, name: transaction.coAgentName } : null,
        coAgentCommissionPercent: transaction.coAgentCommissionPercent ?? '',
        coAgentCommission: transaction.coAgentCommission ?? '',
      });
    } else {
      setForm(EMPTY);
    }
    setError('');
  }, [open, transaction]);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleAmountChange = (val) => {
    setForm((f) => {
      const amt = parseFloat(val) || 0;
      const pct = parseFloat(f.commissionPercent) || 0;
      return {
        ...f,
        amount: val,
        commission: pct > 0 ? String((amt * pct / 100).toFixed(0)) : f.commission,
      };
    });
  };

  const handlePercentChange = (val) => {
    setForm((f) => {
      const pct = parseFloat(val) || 0;
      const amt = parseFloat(f.amount) || 0;
      return {
        ...f,
        commissionPercent: val,
        commission: amt > 0 ? String((amt * pct / 100).toFixed(0)) : f.commission,
      };
    });
  };

  const fetchListings = useCallback(async (q) => {
    const res = await apiClient.get(`/listing/get?searchTerm=${encodeURIComponent(q)}&limit=8`);
    return (res.data?.listings || []).map((l) => ({
      _id: l._id,
      name: l.name,
      address: l.address,
    }));
  }, []);

  const fetchClients = useCallback(async (q) => {
    const res = await apiClient.get(`/clients?contactType=lead&q=${encodeURIComponent(q)}&limit=8`);
    return (res.data || []).map((c) => ({ _id: c._id, name: c.name, phone: c.phone }));
  }, []);

  const fetchCoAgents = useCallback(async (q) => {
    const res = await apiClient.get(`/clients?contactType=co_agent&q=${encodeURIComponent(q)}&limit=8`);
    return (res.data || []).map((c) => ({ _id: c._id, name: c.name, phone: c.phone, organization: c.organization }));
  }, []);

  const handleCoAgentPercentChange = (val) => {
    setForm((f) => {
      const pct = parseFloat(val) || 0;
      const amt = parseFloat(f.amount) || 0;
      return {
        ...f,
        coAgentCommissionPercent: val,
        coAgentCommission: amt > 0 ? String((amt * pct / 100).toFixed(0)) : f.coAgentCommission,
      };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const propertyName = form.property?.name || form.manualPropertyName?.trim() || '';
      const clientName   = form.client?.name   || form.manualClientName?.trim()   || '';
      if (!propertyName) {
        setError('Please select or enter a property name.');
        setSaving(false);
        return;
      }
      if (!clientName) {
        setError('Please select or enter a client name.');
        setSaving(false);
        return;
      }
      const payload = {
        property: form.property?._id || null,
        propertyName,
        client: form.client?._id || null,
        clientName,
        type: form.type,
        amount: Number(form.amount),
        commissionPercent: Number(form.commissionPercent) || 0,
        commission: Number(form.commission) || 0,
        status: form.status,
        date: form.date,
        notes: form.notes,
        coAgent: form.coAgent?._id || null,
        coAgentName: form.coAgent?.name || '',
        coAgentCommissionPercent: Number(form.coAgentCommissionPercent) || 0,
        coAgentCommission: Number(form.coAgentCommission) || 0,
      };
      if (transaction) {
        await apiClient.patch(`/transactions/${transaction._id}`, payload);
      } else {
        await apiClient.post('/transactions', payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err?.message || 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/40 z-40 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      {/* Slide-in panel */}
      <div
        className={`fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-out ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className='flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0'>
          <div>
            <h2 className='text-base font-semibold text-slate-900'>
              {transaction ? 'Edit Transaction' : 'New Transaction'}
            </h2>
            <p className='text-xs text-slate-400 mt-0.5'>
              {transaction ? 'Update transaction details' : 'Record a property transaction'}
            </p>
          </div>
          <button
            onClick={onClose}
            className='p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600'
          >
            <HiX className='w-5 h-5' />
          </button>
        </div>

        <form onSubmit={handleSubmit} className='flex-1 flex flex-col min-h-0'>
          <div className='flex-1 overflow-y-auto px-6 py-5 space-y-5'>

            {/* Property */}
            <EntityPicker
              label='Property'
              placeholder='Search listings…'
              value={form.property}
              onSelect={(item, query) => {
                set('property', item);
                if (!item && query) set('manualPropertyName', query);
              }}
              fetchFn={fetchListings}
              renderItem={(item) => (
                <span className='flex flex-col'>
                  <span className='font-medium text-slate-800'>{item.name}</span>
                  {item.address && <span className='text-xs text-slate-400'>{item.address}</span>}
                </span>
              )}
            />
            {!form.property && (
              <Input
                label='Or enter property name'
                placeholder='e.g. Green Valley Villa'
                value={form.manualPropertyName}
                onChange={(e) => set('manualPropertyName', e.target.value)}
              />
            )}

            {/* Client */}
            <EntityPicker
              label='Client'
              placeholder='Search clients…'
              value={form.client}
              onSelect={(item, query) => {
                set('client', item);
                if (!item && query) set('manualClientName', query);
              }}
              fetchFn={fetchClients}
              renderItem={(item) => (
                <span className='flex flex-col'>
                  <span className='font-medium text-slate-800'>{item.name}</span>
                  {item.phone && <span className='text-xs text-slate-400'>{item.phone}</span>}
                </span>
              )}
            />
            {!form.client && (
              <Input
                label='Or enter client name'
                placeholder='e.g. Rahul Sharma'
                value={form.manualClientName}
                onChange={(e) => set('manualClientName', e.target.value)}
              />
            )}

            <div className='grid grid-cols-2 gap-4'>
              <Select label='Type' value={form.type} onChange={(e) => set('type', e.target.value)}>
                <option value='sale'>Sale</option>
                <option value='rent'>Rent</option>
                <option value='lease'>Lease</option>
              </Select>
              <Select label='Status' value={form.status} onChange={(e) => set('status', e.target.value)}>
                <option value='pending'>Pending</option>
                <option value='in_progress'>In Progress</option>
                <option value='completed'>Completed</option>
                <option value='cancelled'>Cancelled</option>
              </Select>
            </div>

            <Input
              label='Transaction Amount (₹)'
              type='number'
              min='0'
              placeholder='0'
              value={form.amount}
              onChange={(e) => handleAmountChange(e.target.value)}
              required
            />

            <div className='grid grid-cols-2 gap-4'>
              <Input
                label='Commission %'
                type='number'
                min='0'
                max='100'
                step='0.1'
                placeholder='e.g. 2'
                value={form.commissionPercent}
                onChange={(e) => handlePercentChange(e.target.value)}
                hint='Auto-calculates amount →'
              />
              <Input
                label='Commission (₹)'
                type='number'
                min='0'
                placeholder='0'
                value={form.commission}
                onChange={(e) => set('commission', e.target.value)}
              />
            </div>

            <Input
              label='Date'
              type='date'
              value={form.date}
              onChange={(e) => set('date', e.target.value)}
            />

            <Textarea
              label='Notes'
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={3}
              placeholder='Add any notes about this transaction…'
            />

            {/* Co-Agent */}
            <div className='border-t border-slate-100 pt-4 space-y-3'>
              <p className='text-xs font-semibold text-slate-400 uppercase tracking-wide'>Co-Agent (optional)</p>
              <EntityPicker
                label='Co-Agent / Broker'
                placeholder='Search co-agents…'
                value={form.coAgent}
                onSelect={(item) => set('coAgent', item)}
                fetchFn={fetchCoAgents}
                renderItem={(item) => (
                  <span className='flex flex-col'>
                    <span className='font-medium text-slate-800'>{item.name}</span>
                    {item.organization && <span className='text-xs text-slate-400'>{item.organization}</span>}
                    {item.phone && !item.organization && <span className='text-xs text-slate-400'>{item.phone}</span>}
                  </span>
                )}
              />
              {form.coAgent && (
                <div className='grid grid-cols-2 gap-3'>
                  <div className='flex flex-col gap-1'>
                    <label className='text-sm font-medium text-slate-700'>Their Commission %</label>
                    <input
                      type='number'
                      min='0'
                      max='100'
                      step='0.1'
                      value={form.coAgentCommissionPercent}
                      onChange={(e) => handleCoAgentPercentChange(e.target.value)}
                      placeholder='e.g. 1.5'
                      className='px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10'
                    />
                  </div>
                  <div className='flex flex-col gap-1'>
                    <label className='text-sm font-medium text-slate-700'>Their Commission (₹)</label>
                    <input
                      type='number'
                      min='0'
                      value={form.coAgentCommission}
                      onChange={(e) => set('coAgentCommission', e.target.value)}
                      placeholder='Auto-calculated'
                      className='px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10'
                    />
                  </div>
                </div>
              )}
            </div>

            {error && <p className='text-sm text-rose-600 bg-rose-50 px-3 py-2 rounded-lg'>{error}</p>}
          </div>

          {/* Footer */}
          <div className='flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 flex-shrink-0'>
            <Button variant='secondary' type='button' onClick={onClose}>Cancel</Button>
            <Button variant='primary' type='submit' loading={saving}>
              {transaction ? 'Update' : 'Create'} Transaction
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}

// ─── FilterDropdown ────────────────────────────────────────────────────────────
function FilterDropdown({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const active = value !== 'All';

  return (
    <div className='relative' ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`px-3 py-2 rounded-lg border text-sm font-medium flex items-center gap-2 transition-colors ${
          active
            ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
        }`}
      >
        {label}: {value}
        <HiChevronDown className='w-4 h-4' />
      </button>
      {open && (
        <div className='absolute top-full left-0 mt-1 w-40 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1'>
          {options.map((opt) => (
            <button
              key={opt}
              onClick={() => { onChange(opt); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${
                value === opt ? 'bg-slate-100 font-medium text-slate-900' : 'text-slate-700'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function Transactions() {
  const { canAccess } = useCrmAccess();

  const [transactions, setTransactions] = useState([]);
  const [total, setTotal]               = useState(0);
  const [loading, setLoading]           = useState(true);
  const [searchQuery, setSearchQuery]   = useState('');
  const [typeFilter, setTypeFilter]     = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [drawerOpen, setDrawerOpen]     = useState(false);
  const [editing, setEditing]           = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting]         = useState(false);
  const [deleteError, setDeleteError]   = useState('');
  const [stats, setStats]               = useState({ totalPipeline: 0, totalCommission: 0, completed: 0, pending: 0 });

  const buildParams = useCallback(() => {
    const p = new URLSearchParams();
    if (searchQuery)          p.set('q', searchQuery);
    if (typeFilter !== 'All') p.set('type', typeFilter.toLowerCase());
    if (statusFilter !== 'All') {
      p.set('status', statusFilter.toLowerCase().replaceAll(' ', '_'));
    }
    p.set('limit', '50');
    return p.toString();
  }, [searchQuery, typeFilter, statusFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(`/transactions?${buildParams()}`);
      setTransactions(res.data || []);
      setTotal(res.total || 0);
    } catch (_) {
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => {
    if (!canAccess) return;
    const t = setTimeout(load, searchQuery ? 350 : 0);
    return () => clearTimeout(t);
  }, [canAccess, load, searchQuery]);

  const loadStats = useCallback(() => {
    apiClient.get('/transactions/stats')
      .then((res) => setStats(res.data || {}))
      .catch(() => {});
  }, []);

  // Stats are fetched independently — not affected by filters or page size
  useEffect(() => {
    if (!canAccess) return;
    loadStats();
  }, [canAccess, loadStats]);

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await apiClient.delete(`/transactions/${pendingDelete}`);
      setPendingDelete(null);
      load();
      loadStats();
    } catch (err) {
      setDeleteError(err?.message || 'Failed to delete. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const openNew  = () => { setEditing(null); setDrawerOpen(true); };
  const openEdit = (t) => { setEditing(t); setDrawerOpen(true); };

  if (!canAccess) {
    return (
      <div className='min-h-screen flex items-center justify-center'>
        <p className='text-slate-600'>Access denied</p>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      {/* Page header */}
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
        <div>
          <h1 className='text-xl font-bold text-slate-900'>Transactions</h1>
          <p className='text-slate-500 text-sm mt-0.5'>Track and manage all property transactions</p>
        </div>
        <div className='flex items-center gap-2'>
          <Button variant='secondary' icon={HiDownload}>Export</Button>
          <Button variant='primary' icon={HiPlus} onClick={openNew}>New Transaction</Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className='grid grid-cols-2 lg:grid-cols-4 gap-4'>
        <KpiCard title='Total Pipeline' value={fmtINR(stats.totalPipeline)}    sub='All active deals'  color='emerald' icon={HiCurrencyDollar} />
        <KpiCard title='Commission'    value={fmtINR(stats.totalCommission)}  sub='From completed'    color='blue'    icon={HiCurrencyDollar} />
        <KpiCard title='Completed'     value={stats.completed ?? 0}           sub='Successful deals'  color='purple'  icon={HiCheck} />
        <KpiCard title='Pending'       value={stats.pending   ?? 0}           sub='In progress'       color='amber'   icon={HiClock} />
      </div>

      {/* Filters */}
      <div className='bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-3'>
        <div className='flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 flex-1 min-w-0 max-w-xs'>
          <HiSearch className='w-4 h-4 text-slate-400 flex-shrink-0' />
          <input
            type='text'
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder='Search by property or client…'
            className='bg-transparent outline-none flex-1 text-sm text-slate-700 placeholder:text-slate-400 min-w-0'
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className='text-slate-400 hover:text-slate-600 flex-shrink-0'>
              <HiX className='w-4 h-4' />
            </button>
          )}
        </div>

        <FilterDropdown label='Type'   value={typeFilter}   options={TYPE_OPTS}   onChange={setTypeFilter} />
        <FilterDropdown label='Status' value={statusFilter} options={STATUS_OPTS} onChange={setStatusFilter} />

        {(typeFilter !== 'All' || statusFilter !== 'All' || searchQuery) && (
          <button
            onClick={() => { setTypeFilter('All'); setStatusFilter('All'); setSearchQuery(''); }}
            className='px-3 py-2 rounded-lg text-sm font-medium text-rose-600 hover:bg-rose-50 flex items-center gap-1'
          >
            <HiX className='w-4 h-4' /> Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className='bg-white border border-slate-200 rounded-xl overflow-hidden'>
        {loading ? (
          <div className='flex items-center justify-center py-16'><Spinner /></div>
        ) : transactions.length === 0 ? (
          <EmptyState
            icon={HiCurrencyDollar}
            title='No transactions yet'
            body='Create your first transaction to start tracking deals.'
            action={<Button variant='primary' icon={HiPlus} onClick={openNew}>New Transaction</Button>}
          />
        ) : (
          <div className='overflow-x-auto'>
            <table className='w-full'>
              <thead className='bg-slate-50 border-b border-slate-200'>
                <tr>
                  {['Property', 'Client', 'Type', 'Amount', 'Commission', 'Status', 'Date', ''].map((h) => (
                    <th key={h} className='text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap'>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className='divide-y divide-slate-100'>
                {transactions.map((t) => {
                  const sm = STATUS_META[t.status] || STATUS_META.pending;
                  return (
                    <tr key={t._id} className='hover:bg-slate-50 transition-colors'>
                      <td className='px-4 py-3'>
                        <div className='flex items-center gap-2'>
                          <div className='w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0'>
                            <HiHome className='w-4 h-4 text-slate-500' />
                          </div>
                          <span className='text-sm font-medium text-slate-900 truncate max-w-[160px]'>
                            {t.propertyName}
                          </span>
                        </div>
                      </td>
                      <td className='px-4 py-3'>
                        <div className='flex flex-col gap-0.5'>
                          <div className='flex items-center gap-2'>
                            <div className='w-7 h-7 rounded-full bg-indigo-50 flex items-center justify-center flex-shrink-0'>
                              <span className='text-xs font-semibold text-indigo-600'>
                                {t.clientName?.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <span className='text-sm text-slate-700'>{t.clientName}</span>
                          </div>
                          {t.coAgentName && (
                            <span className='text-xs text-slate-400 pl-9'>↗ {t.coAgentName}</span>
                          )}
                        </div>
                      </td>
                      <td className='px-4 py-3'>
                        <span className='text-sm text-slate-600 capitalize'>{t.type}</span>
                      </td>
                      <td className='px-4 py-3'>
                        <span className='text-sm font-semibold text-slate-900'>{fmtINR(t.amount)}</span>
                      </td>
                      <td className='px-4 py-3'>
                        <div className='flex items-center gap-1'>
                          <span className='text-sm font-medium text-emerald-600'>{fmtINR(t.commission)}</span>
                          {t.commissionPercent > 0 && (
                            <span className='text-xs text-slate-400'>({t.commissionPercent}%)</span>
                          )}
                        </div>
                      </td>
                      <td className='px-4 py-3'>
                        <Badge variant={sm.variant}>{sm.label}</Badge>
                      </td>
                      <td className='px-4 py-3 whitespace-nowrap'>
                        <span className='text-sm text-slate-500'>{fmtDate(t.date)}</span>
                      </td>
                      <td className='px-4 py-3'>
                        <div className='flex items-center justify-end gap-1'>
                          <button
                            onClick={() => openEdit(t)}
                            className='p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors'
                            title='Edit'
                          >
                            <HiPencil className='w-4 h-4' />
                          </button>
                          <button
                            onClick={() => setPendingDelete(t._id)}
                            className='p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-500 transition-colors'
                            title='Delete'
                          >
                            <HiTrash className='w-4 h-4' />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {total > transactions.length && (
              <div className='px-4 py-3 border-t border-slate-100 text-xs text-slate-500 text-center'>
                Showing {transactions.length} of {total} — adjust filters to narrow results
              </div>
            )}
          </div>
        )}
      </div>

      <TransactionDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        transaction={editing}
        onSaved={() => { load(); loadStats(); }}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        title='Delete transaction?'
        description={deleteError || 'This action cannot be undone.'}
        confirmLabel='Delete'
        onConfirm={handleDelete}
        onCancel={() => { setPendingDelete(null); setDeleteError(''); }}
      />
    </div>
  );
}

import { useEffect, useState, useMemo } from 'react';
import ConfirmDialog from '../components/ConfirmDialog';
import { useSelector } from 'react-redux';
import { useBuyerView } from '../contexts/BuyerViewContext';
import {
  HiPlus, HiSearch, HiChevronDown, HiX,
  HiCurrencyDollar, HiHome, HiCheck,
  HiClock, HiDownload, HiDotsVertical,
  HiPencil, HiTrash,
} from 'react-icons/hi';

const TRANSACTION_TYPES = ['All', 'Sale', 'Rent', 'Lease'];
const TRANSACTION_STATUS = ['All', 'Pending', 'Completed', 'Cancelled'];

const STATUS_COLORS = {
  pending: { bg: 'bg-amber-100', text: 'text-amber-700', icon: HiClock },
  completed: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: HiCheck },
  cancelled: { bg: 'bg-rose-100', text: 'text-rose-700', icon: HiX },
  in_progress: { bg: 'bg-blue-100', text: 'text-blue-700', icon: HiClock },
};


function TransactionModal({ isOpen, onClose, transaction, onSave }) {
  const [formData, setFormData] = useState({
    propertyName: '',
    clientName: '',
    type: 'sale',
    amount: '',
    commission: '',
    status: 'pending',
    date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  useEffect(() => {
    if (transaction) {
      setFormData({
        propertyName: transaction.propertyName || '',
        clientName: transaction.clientName || '',
        type: transaction.type || 'sale',
        amount: transaction.amount || '',
        commission: transaction.commission || '',
        status: transaction.status || 'pending',
        date: transaction.date || new Date().toISOString().split('T')[0],
        notes: transaction.notes || '',
      });
    } else {
      setFormData({
        propertyName: '',
        clientName: '',
        type: 'sale',
        amount: '',
        commission: '',
        status: 'pending',
        date: new Date().toISOString().split('T')[0],
        notes: '',
      });
    }
  }, [transaction, isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className='fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4'>
      <div className='bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto'>
        <div className='p-4 border-b border-slate-200 flex items-center justify-between'>
          <h2 className='text-lg font-semibold text-slate-900'>
            {transaction ? 'Edit Transaction' : 'New Transaction'}
          </h2>
          <button onClick={onClose} className='text-slate-400 hover:text-slate-600'>
            <HiX className='w-5 h-5' />
          </button>
        </div>
        <form onSubmit={handleSubmit} className='p-4 space-y-4'>
          <div>
            <label className='block text-sm font-medium text-slate-700 mb-1'>Property Name *</label>
            <input
              type='text'
              value={formData.propertyName}
              onChange={(e) => setFormData({ ...formData, propertyName: e.target.value })}
              className='w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm'
              placeholder='Enter property name'
              required
            />
          </div>
          <div>
            <label className='block text-sm font-medium text-slate-700 mb-1'>Client Name *</label>
            <input
              type='text'
              value={formData.clientName}
              onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
              className='w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm'
              placeholder='Enter client name'
              required
            />
          </div>
          <div className='grid grid-cols-2 gap-4'>
            <div>
              <label className='block text-sm font-medium text-slate-700 mb-1'>Type</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                className='w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm'
              >
                <option value='sale'>Sale</option>
                <option value='rent'>Rent</option>
                <option value='lease'>Lease</option>
              </select>
            </div>
            <div>
              <label className='block text-sm font-medium text-slate-700 mb-1'>Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className='w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm'
              >
                <option value='pending'>Pending</option>
                <option value='in_progress'>In Progress</option>
                <option value='completed'>Completed</option>
                <option value='cancelled'>Cancelled</option>
              </select>
            </div>
          </div>
          <div className='grid grid-cols-2 gap-4'>
            <div>
              <label className='block text-sm font-medium text-slate-700 mb-1'>Amount (₹) *</label>
              <input
                type='number'
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className='w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm'
                placeholder='0'
                required
              />
            </div>
            <div>
              <label className='block text-sm font-medium text-slate-700 mb-1'>Commission (₹)</label>
              <input
                type='number'
                value={formData.commission}
                onChange={(e) => setFormData({ ...formData, commission: e.target.value })}
                className='w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm'
                placeholder='0'
              />
            </div>
          </div>
          <div>
            <label className='block text-sm font-medium text-slate-700 mb-1'>Date</label>
            <input
              type='date'
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className='w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm'
            />
          </div>
          <div>
            <label className='block text-sm font-medium text-slate-700 mb-1'>Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className='w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm'
              rows={3}
              placeholder='Additional notes...'
            />
          </div>
          <div className='flex justify-end gap-2 pt-2'>
            <button
              type='button'
              onClick={onClose}
              className='px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium'
            >
              Cancel
            </button>
            <button
              type='submit'
              className='px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 text-sm font-medium'
            >
              {transaction ? 'Update' : 'Create'} Transaction
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Transactions() {
  const { currentUser } = useSelector((state) => state.user);
  const { isBuyerViewMode } = useBuyerView();

  const [transactions, setTransactions] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [showActionsMenu, setShowActionsMenu] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  const canAccess = useMemo(() => {
    if (!currentUser) return false;
    if (isBuyerViewMode) return false;
    return currentUser.role === 'admin' || currentUser.role === 'employee';
  }, [currentUser, isBuyerViewMode]);

  const fmtCurrency = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

  // Calculate summary metrics
  const metrics = useMemo(() => {
    const completed = transactions.filter(t => t.status === 'completed');
    const totalValue = completed.reduce((sum, t) => sum + (t.amount || 0), 0);
    const totalCommission = completed.reduce((sum, t) => sum + (t.commission || 0), 0);
    const pending = transactions.filter(t => t.status === 'pending' || t.status === 'in_progress').length;
    return { totalValue, totalCommission, completed: completed.length, pending };
  }, [transactions]);

  // Filter transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const matchesSearch = !searchQuery || 
        t.propertyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.clientName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = typeFilter === 'All' || t.type.toLowerCase() === typeFilter.toLowerCase();
      const matchesStatus = statusFilter === 'All' || t.status.toLowerCase() === statusFilter.toLowerCase();
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [transactions, searchQuery, typeFilter, statusFilter]);

  const handleSaveTransaction = (formData) => {
    if (editingTransaction) {
      setTransactions(prev => prev.map(t => 
        t._id === editingTransaction._id ? { ...t, ...formData } : t
      ));
    } else {
      const newTransaction = {
        _id: `t-${Date.now()}`,
        ...formData,
        agent: currentUser?.username || 'Unknown',
      };
      setTransactions(prev => [newTransaction, ...prev]);
    }
    setEditingTransaction(null);
  };

  const handleDeleteTransaction = (id) => {
    setPendingDelete(id);
    setShowActionsMenu(null);
  };

  const openEditModal = (transaction) => {
    setEditingTransaction(transaction);
    setShowModal(true);
    setShowActionsMenu(null);
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
        <div>
          <h1 className='text-xl font-bold text-slate-900'>Transactions</h1>
          <p className='text-slate-500 text-sm mt-0.5'>Track and manage all property transactions</p>
        </div>
        <div className='flex items-center gap-2'>
          <button className='px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-sm font-medium flex items-center gap-1.5 transition-colors'>
            <HiDownload className='w-4 h-4' />
            Export
          </button>
          <button
            onClick={() => { setEditingTransaction(null); setShowModal(true); }}
            className='px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 text-sm font-medium flex items-center gap-1.5 transition-colors'
          >
            <HiPlus className='w-4 h-4' />
            New Transaction
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'>
        <div className='bg-white border border-slate-200 border-t-2 border-t-emerald-500 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow'>
          <div className='flex items-center justify-between mb-3'>
            <span className='text-xs font-semibold text-slate-500 uppercase tracking-wider'>Total Value</span>
            <div className='w-9 h-9 rounded-xl bg-emerald-50 ring-1 ring-emerald-100 flex items-center justify-center'>
              <HiCurrencyDollar className='w-5 h-5 text-emerald-600' />
            </div>
          </div>
          <div className='text-2xl font-bold text-slate-900'>{fmtCurrency(metrics.totalValue)}</div>
          <div className='text-xs text-slate-500 mt-1'>Completed transactions</div>
        </div>

        <div className='bg-white border border-slate-200 border-t-2 border-t-blue-500 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow'>
          <div className='flex items-center justify-between mb-3'>
            <span className='text-xs font-semibold text-slate-500 uppercase tracking-wider'>Commission</span>
            <div className='w-9 h-9 rounded-xl bg-blue-50 ring-1 ring-blue-100 flex items-center justify-center'>
              <HiCurrencyDollar className='w-5 h-5 text-blue-600' />
            </div>
          </div>
          <div className='text-2xl font-bold text-slate-900'>{fmtCurrency(metrics.totalCommission)}</div>
          <div className='text-xs text-slate-500 mt-1'>From completed deals</div>
        </div>

        <div className='bg-white border border-slate-200 border-t-2 border-t-purple-500 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow'>
          <div className='flex items-center justify-between mb-3'>
            <span className='text-xs font-semibold text-slate-500 uppercase tracking-wider'>Completed</span>
            <div className='w-9 h-9 rounded-xl bg-purple-50 ring-1 ring-purple-100 flex items-center justify-center'>
              <HiCheck className='w-5 h-5 text-purple-600' />
            </div>
          </div>
          <div className='text-2xl font-bold text-slate-900'>{metrics.completed}</div>
          <div className='text-xs text-slate-500 mt-1'>Successful transactions</div>
        </div>

        <div className='bg-white border border-slate-200 border-t-2 border-t-amber-500 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow'>
          <div className='flex items-center justify-between mb-3'>
            <span className='text-xs font-semibold text-slate-500 uppercase tracking-wider'>Pending</span>
            <div className='w-9 h-9 rounded-xl bg-amber-50 ring-1 ring-amber-100 flex items-center justify-center'>
              <HiClock className='w-5 h-5 text-amber-600' />
            </div>
          </div>
          <div className='text-2xl font-bold text-slate-900'>{metrics.pending}</div>
          <div className='text-xs text-slate-500 mt-1'>In progress</div>
        </div>
      </div>

      {/* Filters */}
      <div className='bg-white border border-slate-200 rounded-xl p-4'>
        <div className='flex flex-wrap items-center gap-3'>
          <div className='flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white flex-1 max-w-xs'>
            <HiSearch className='w-4 h-4 text-slate-400' />
            <input
              type='text'
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder='Search transactions...'
              className='bg-transparent outline-none flex-1 text-sm text-slate-700 placeholder:text-slate-400'
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className='text-slate-400 hover:text-slate-600'>
                <HiX className='w-4 h-4' />
              </button>
            )}
          </div>

          <div className='relative'>
            <button
              onClick={() => { setShowTypeDropdown(!showTypeDropdown); setShowStatusDropdown(false); }}
              className='px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 flex items-center gap-2 hover:bg-slate-50'
            >
              Type: {typeFilter}
              <HiChevronDown className='w-4 h-4' />
            </button>
            {showTypeDropdown && (
              <div className='absolute top-full left-0 mt-1 w-32 bg-white border border-slate-200 rounded-lg shadow-lg z-10'>
                {TRANSACTION_TYPES.map((type) => (
                  <button
                    key={type}
                    onClick={() => { setTypeFilter(type); setShowTypeDropdown(false); }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${typeFilter === type ? 'bg-slate-100 font-medium' : ''}`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className='relative'>
            <button
              onClick={() => { setShowStatusDropdown(!showStatusDropdown); setShowTypeDropdown(false); }}
              className='px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 flex items-center gap-2 hover:bg-slate-50'
            >
              Status: {statusFilter}
              <HiChevronDown className='w-4 h-4' />
            </button>
            {showStatusDropdown && (
              <div className='absolute top-full left-0 mt-1 w-36 bg-white border border-slate-200 rounded-lg shadow-lg z-10'>
                {TRANSACTION_STATUS.map((status) => (
                  <button
                    key={status}
                    onClick={() => { setStatusFilter(status); setShowStatusDropdown(false); }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${statusFilter === status ? 'bg-slate-100 font-medium' : ''}`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            )}
          </div>

          {(typeFilter !== 'All' || statusFilter !== 'All' || searchQuery) && (
            <button
              onClick={() => { setTypeFilter('All'); setStatusFilter('All'); setSearchQuery(''); }}
              className='px-3 py-2 rounded-lg text-sm font-medium text-rose-600 hover:bg-rose-50 flex items-center gap-1'
            >
              <HiX className='w-4 h-4' />
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Transactions Table */}
      <div className='bg-white border border-slate-200 rounded-xl overflow-hidden'>
        <div className='overflow-x-auto'>
          <table className='w-full'>
            <thead className='bg-slate-50'>
              <tr>
                <th className='text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase'>Property</th>
                <th className='text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase'>Client</th>
                <th className='text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase'>Type</th>
                <th className='text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase'>Amount</th>
                <th className='text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase'>Commission</th>
                <th className='text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase'>Status</th>
                <th className='text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase'>Date</th>
                <th className='text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase'>Actions</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-slate-100'>
              {filteredTransactions.map((transaction) => {
                const statusColors = STATUS_COLORS[transaction.status] || STATUS_COLORS.pending;
                const StatusIcon = statusColors.icon;
                return (
                  <tr key={transaction._id} className='hover:bg-slate-50'>
                    <td className='px-4 py-3'>
                      <div className='flex items-center gap-2'>
                        <div className='w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center'>
                          <HiHome className='w-4 h-4 text-slate-500' />
                        </div>
                        <span className='text-sm font-medium text-slate-900 truncate max-w-[180px]'>
                          {transaction.propertyName}
                        </span>
                      </div>
                    </td>
                    <td className='px-4 py-3'>
                      <div className='flex items-center gap-2'>
                        <div className='w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center'>
                          <span className='text-xs font-medium text-slate-600'>
                            {transaction.clientName.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <span className='text-sm text-slate-700'>{transaction.clientName}</span>
                      </div>
                    </td>
                    <td className='px-4 py-3'>
                      <span className='text-sm text-slate-600 capitalize'>{transaction.type}</span>
                    </td>
                    <td className='px-4 py-3'>
                      <span className='text-sm font-semibold text-slate-900'>{fmtCurrency(transaction.amount)}</span>
                    </td>
                    <td className='px-4 py-3'>
                      <span className='text-sm text-emerald-600 font-medium'>{fmtCurrency(transaction.commission)}</span>
                    </td>
                    <td className='px-4 py-3'>
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusColors.bg} ${statusColors.text}`}>
                        <StatusIcon className='w-3 h-3' />
                        {transaction.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className='px-4 py-3'>
                      <span className='text-sm text-slate-500'>
                        {new Date(transaction.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </td>
                    <td className='px-4 py-3'>
                      <div className='relative'>
                        <button
                          onClick={() => setShowActionsMenu(showActionsMenu === transaction._id ? null : transaction._id)}
                          className='p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600'
                        >
                          <HiDotsVertical className='w-5 h-5' />
                        </button>
                        {showActionsMenu === transaction._id && (
                          <div className='absolute right-0 top-full mt-1 w-36 bg-white border border-slate-200 rounded-lg shadow-lg z-10'>
                            <button
                              onClick={() => openEditModal(transaction)}
                              className='w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2'
                            >
                              <HiPencil className='w-4 h-4' />
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteTransaction(transaction._id)}
                              className='w-full text-left px-3 py-2 text-sm hover:bg-rose-50 text-rose-600 flex items-center gap-2'
                            >
                              <HiTrash className='w-4 h-4' />
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredTransactions.length === 0 && (
                <tr>
                  <td colSpan={8} className='px-4 py-12 text-center'>
                    <div className='flex flex-col items-center'>
                      <HiCurrencyDollar className='w-12 h-12 text-slate-300 mb-3' />
                      <p className='text-sm text-slate-500'>No transactions found</p>
                      <button
                        onClick={() => { setEditingTransaction(null); setShowModal(true); }}
                        className='mt-3 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800'
                      >
                        Create your first transaction
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      <TransactionModal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditingTransaction(null); }}
        transaction={editingTransaction}
        onSave={handleSaveTransaction}
      />
      <ConfirmDialog
        open={!!pendingDelete}
        title='Delete transaction?'
        description='This cannot be undone.'
        confirmLabel='Delete'
        onConfirm={() => { setTransactions(prev => prev.filter(t => t._id !== pendingDelete)); setPendingDelete(null); }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

import { useEffect, useId, useMemo, useRef, useState, useCallback } from 'react';
import ConfirmDialog from '../components/ConfirmDialog';
import { useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { apiClient } from '../utils/http';
import { useBuyerView } from '../contexts/BuyerViewContext';
import {
  PageHeader, Button, Modal, EmptyState, Checkbox, ColumnToggle, Pagination,
  Table, Thead, Th, Tbody, Tr, Td, SkeletonRows, useRowSelection,
} from '../design-system';
import { useColumnPrefs } from '../hooks/useColumnPrefs';
import BulkActionBar, { BulkSelect, BulkButton } from '../components/BulkActionBar';
import {
  HiPlus, HiSearch, HiX, HiChevronDown, HiChevronRight,
  HiCheck, HiPencil, HiTrash, HiRefresh, HiClock,
  HiViewGrid, HiViewList, HiCalendar, HiFlag,
  HiClipboardList, HiExclamation, HiFilter,
} from 'react-icons/hi';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../utils/currency';

const STATUS_CONFIG = {
  todo: { label: 'To Do', color: 'bg-slate-400', textColor: 'text-slate-600', bgLight: 'bg-slate-50', border: 'border-slate-200' },
  in_progress: { label: 'In Progress', color: 'bg-amber-500', textColor: 'text-amber-700', bgLight: 'bg-amber-50', border: 'border-amber-200' },
  review: { label: 'Review', color: 'bg-indigo-500', textColor: 'text-indigo-700', bgLight: 'bg-indigo-50', border: 'border-indigo-200' },
  done: { label: 'Done', color: 'bg-emerald-500', textColor: 'text-emerald-700', bgLight: 'bg-emerald-50', border: 'border-emerald-200' },
  blocked: { label: 'Blocked', color: 'bg-rose-500', textColor: 'text-rose-700', bgLight: 'bg-rose-50', border: 'border-rose-200' },
};

const PRIORITY_CONFIG = {
  low: { label: 'Low', color: 'bg-slate-400', icon: HiFlag },
  medium: { label: 'Medium', color: 'bg-amber-500', icon: HiFlag },
  high: { label: 'High', color: 'bg-orange-500', icon: HiFlag },
  urgent: { label: 'Urgent', color: 'bg-rose-500', icon: HiExclamation },
};

const STATUS_ORDER = ['todo', 'in_progress', 'review', 'done', 'blocked'];
const PRIORITY_ORDER = ['urgent', 'high', 'medium', 'low'];

const DEFAULT_SORT = { key: 'dueAt', dir: 'asc' };

// The cards view groups by status, so it needs the whole set in hand rather
// than a page of it; this is the most it asks for.
const CARDS_LIMIT = 200;

export default function TasksBoard() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentUser } = useSelector((state) => state.user);
  const { isBuyerViewMode } = useBuyerView();

  // Data state
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // UI state
  const [view, setView] = useState('cards');
  const [selectedTask, setSelectedTask] = useState(null);
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
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [creating, setCreating] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [showStatusDropdown, setShowStatusDropdown] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [agents, setAgents] = useState([]);

  // Table view: paged and sorted on the server.
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sort, setSort] = useState(DEFAULT_SORT);

  // Filters
  const q = searchParams.get('q') || '';
  const statusFilter = searchParams.get('status') || '';
  const priorityFilter = searchParams.get('priority') || '';

  const canAccess = useMemo(() => {
    if (!currentUser) return false;
    if (isBuyerViewMode) return false;
    return currentUser.role === 'admin' || currentUser.role === 'employee';
  }, [currentUser, isBuyerViewMode]);

  const isAdmin = currentUser?.role === 'admin';
  const hasFilters = !!(q || statusFilter || priorityFilter);

  const fetchTasks = useCallback(async () => {
    if (!canAccess) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (statusFilter) params.set('status', statusFilter);
      if (priorityFilter) params.set('priority', priorityFilter);
      if (view === 'table') {
        params.set('page', String(page));
        params.set('limit', String(pageSize));
        params.set('sort', `${sort.key}:${sort.dir}`);
      } else {
        params.set('limit', String(CARDS_LIMIT));
      }
      const response = await apiClient.get(`/tasks?${params.toString()}`);
      const data = response?.data || response || [];
      setTasks(Array.isArray(data) ? data : []);
      setTotal(Number(response?.total) || (Array.isArray(data) ? data.length : 0));
    } catch (e) {
      console.error('Failed to load tasks:', e);
      setError(e?.message || 'Failed to load tasks');
      setTasks([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [canAccess, q, statusFilter, priorityFilter, view, page, pageSize, sort]);

  // Only an admin can reassign, so only an admin needs the list.
  useEffect(() => {
    if (!isAdmin || !canAccess) return;
    apiClient
      .get('/user/list')
      .then((res) => {
        const users = Array.isArray(res) ? res : res?.data || [];
        setAgents(users.filter((u) => ['admin', 'employee'].includes(u.role) && u.status === 'active'));
      })
      .catch(() => { /* the assign dropdown simply stays empty */ });
  }, [isAdmin, canAccess]);

  const selection = useRowSelection(useMemo(() => (view === 'table' ? tasks.map((x) => x._id) : []), [tasks, view]));

  const TABLE_COLUMNS = [
    { key: 'task', label: t('tasks.task'), locked: true },
    { key: 'status', label: t('tasks.status') },
    { key: 'priority', label: t('tasks.priority') },
    { key: 'dueAt', label: t('tasks.dueDate') },
    { key: 'description', label: t('tasks.description') },
  ];
  const { isVisible, toggle: toggleColumn, reset: resetColumns, visibleColumns } = useColumnPrefs('tasks', TABLE_COLUMNS);

  const onSort = (key) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
    setPage(1);
  };

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Group tasks by status
  const groupedTasks = useMemo(() => {
    const groups = new Map();
    STATUS_ORDER.forEach((s) => groups.set(s, []));
    tasks.forEach((t) => {
      const status = t.status || 'todo';
      if (groups.has(status)) {
        groups.get(status).push(t);
      } else {
        groups.get('todo').push(t);
      }
    });
    return groups;
  }, [tasks]);

  // A different question starts again on its first page.
  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
    setPage(1);
  };

  const clearFilters = () => { setSearchParams(new URLSearchParams()); setPage(1); };

  /**
   * One request per task, the same PATCH/DELETE the row actions make — there
   * is no bulk endpoint. allSettled so one forbidden task does not stop the
   * rest, and the count of failures is said out loud rather than swallowed.
   */
  const applyBulk = async (run, { removes = false } = {}) => {
    const ids = [...selection.selected];
    if (!ids.length) return;
    setBulkBusy(true);
    setError('');
    const results = await Promise.allSettled(ids.map(run));
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed) setError(t('tasksBoard.bulkFailed', { count: failed }));
    selection.clear();
    setBulkBusy(false);
    // Deleting a whole last page would leave an empty one behind.
    if (removes && page > 1 && failed === 0 && ids.length === tasks.length) {
      setPage((p) => p - 1);
    } else {
      await fetchTasks();
    }
  };
  const bulkComplete = (id) => apiClient.patch(`/tasks/${id}`, { status: 'done' });
  const bulkDelete = (id) => apiClient.delete(`/tasks/${id}`);
  const bulkAssign = (userId) => (id) => apiClient.patch(`/tasks/${id}`, { assignedTo: userId });

  const toggleGroup = (status) => {
    setCollapsedGroups((prev) => ({ ...prev, [status]: !prev[status] }));
  };

  const handleCreateTask = async (formData) => {
    setCreating(true);
    setError('');
    try {
      await apiClient.post('/tasks', formData);
      setShowCreateModal(false);
      await fetchTasks();
    } catch (e) {
      setError(e?.message || 'Failed to create task');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateTask = async (id, updates) => {
    try {
      await apiClient.patch(`/tasks/${id}`, updates);
      await fetchTasks();
      setShowEditModal(false);
      setEditingTask(null);
      if (selectedTask?._id === id) {
        setSelectedTask((prev) => ({ ...prev, ...updates }));
      }
    } catch (e) {
      setError(e?.message || 'Failed to update task');
    }
  };

  const handleDeleteTask = async (id) => {
    try {
      await apiClient.delete(`/tasks/${id}`);
      await fetchTasks();
      if (selectedTask?._id === id) setSelectedTask(null);
    } catch (e) {
      setError(e?.message || 'Failed to delete task');
    }
  };

  const handleStatusChange = async (taskId, newStatus) => {
    setShowStatusDropdown(null);
    await handleUpdateTask(taskId, { status: newStatus });
  };

  const openEditModal = (task) => {
    setEditingTask(task);
    setShowEditModal(true);
  };

  // A finished task is not "Overdue", whatever its due date was.
  const formatDueDate = (dateStr, status) => {
    if (status === 'done') return { text: 'Done', class: 'text-emerald-700 bg-emerald-50' };
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const now = new Date();
    const diff = date - now;
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    
    if (days < 0) return { text: 'Overdue', class: 'text-rose-600 bg-rose-50' };
    if (days === 0) return { text: 'Today', class: 'text-amber-600 bg-amber-50' };
    if (days === 1) return { text: 'Tomorrow', class: 'text-amber-600 bg-amber-50' };
    if (days <= 7) return { text: `${days} days`, class: 'text-indigo-600 bg-indigo-50' };
    return { text: formatDate(date, { year: undefined }), class: 'text-slate-600 bg-slate-50' };
  };

  if (!canAccess) {
    return (
      <div className='min-h-screen flex items-center justify-center'>
        <p className='text-slate-600'>{t('tasks.accessDenied')}</p>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      <PageHeader
        title={t('tasks.tasks')}
        description={t('tasks.manageYourTeamTasksTrackProgress')}
        actions={
          <>
            <Button variant='secondary' size='sm' icon={HiRefresh} onClick={fetchTasks} className={loading ? '[&>svg]:animate-spin' : ''}>{t('tasks.refresh')}</Button>
            <Button variant='primary' size='sm' icon={HiPlus} onClick={() => setShowCreateModal(true)}>{t('tasks.newTask')}</Button>
          </>
        }
      />

      {/* Board container */}
      <div className='bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden'>
        {/* Toolbar */}
        <div className='px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex flex-col lg:flex-row lg:items-center gap-3'>
          {/* View tabs */}
          <div className='flex items-center gap-1 bg-slate-100 p-1 rounded-lg'>
            <button
              type='button'
              aria-pressed={view === 'cards'}
              onClick={() => { setView('cards'); setPage(1); }}
              className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 transition-colors ${
                view === 'cards' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <HiViewGrid className='w-4 h-4' aria-hidden='true' />{t('tasks.cards')}</button>
            <button
              type='button'
              aria-pressed={view === 'table'}
              onClick={() => { setView('table'); setPage(1); }}
              className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 transition-colors ${
                view === 'table' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <HiViewList className='w-4 h-4' aria-hidden='true' />{t('tasks.table')}</button>
          </div>

          <div className='h-6 w-px bg-slate-200 hidden lg:block' />

          {/* Search and filters */}
          <div className='flex flex-wrap items-center gap-2 flex-1'>
            <div className='relative flex-1 max-w-xs'>
              <HiSearch className='w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2' aria-hidden='true' />
              <input
                className='w-full pl-9 pr-8 py-2 rounded-lg border border-slate-200 bg-white text-sm outline-none focus:ring-2 focus:ring-brand-500 focus:border-slate-300 transition-all placeholder:text-slate-500'
                placeholder={t('tasks.searchTasks')}
                aria-label={t('tasks.searchTasks')}
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
              className='px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:ring-2 focus:ring-brand-500 focus:border-slate-300 outline-none transition-all'
            >
              <option value=''>{t('tasks.allStatuses')}</option>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>{STATUS_CONFIG[s]?.label || s}</option>
              ))}
            </select>

            <select
              value={priorityFilter}
              onChange={(e) => setParam('priority', e.target.value)}
              aria-label='Filter by priority'
              className='px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:ring-2 focus:ring-brand-500 focus:border-slate-300 outline-none transition-all'
            >
              <option value=''>{t('tasks.allPriorities')}</option>
              {PRIORITY_ORDER.map((p) => (
                <option key={p} value={p}>{PRIORITY_CONFIG[p]?.label || p}</option>
              ))}
            </select>

            {hasFilters && (
              <button
                onClick={clearFilters}
                className='px-3 py-2 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 text-sm font-medium transition-colors'
              >{t('tasks.clearAll')}</button>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className='px-4 py-2.5 text-sm bg-rose-50 border-b border-rose-200 text-rose-700 flex items-center gap-2'>
            <HiExclamation className='w-4 h-4 flex-shrink-0' aria-hidden='true' />
            {error}
            <button type='button' onClick={() => setError('')} aria-label='Dismiss error' className='ml-auto text-rose-600 hover:text-rose-700'>
              <HiX className='w-4 h-4' aria-hidden='true' />
            </button>
          </div>
        )}

        {/* Loading skeleton — the table view draws its own rows under its header. */}
        {loading && view === 'cards' && (
          <div className='p-6'>
            <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div key={i} className='bg-white border border-slate-200 rounded-xl p-4 animate-pulse'>
                  <div className='h-4 bg-slate-200 rounded w-3/4 mb-3' />
                  <div className='h-3 bg-slate-100 rounded w-full mb-2' />
                  <div className='h-3 bg-slate-100 rounded w-2/3 mb-4' />
                  <div className='flex gap-2'>
                    <div className='h-6 bg-slate-100 rounded-full w-16' />
                    <div className='h-6 bg-slate-100 rounded-full w-20' />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cards View */}
        {!loading && view === 'cards' && (
          <div className='p-4'>
            {tasks.length === 0 && !loading ? null : STATUS_ORDER.map((status) => {
              const items = groupedTasks.get(status) || [];
              if (items.length === 0 && statusFilter && statusFilter !== status) return null;
              if (items.length === 0 && tasks.length === 0) return null;
              const config = STATUS_CONFIG[status] || STATUS_CONFIG.todo;
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
                      {items.map((task) => (
                        <TaskCard
                          key={task._id}
                          task={task}
                          onSelect={() => setSelectedTask(task)}
                          onEdit={() => openEditModal(task)}
                          onDelete={() => setPendingDelete(task._id)}
                          onStatusChange={(newStatus) => handleStatusChange(task._id, newStatus)}
                          showStatusDropdown={showStatusDropdown === task._id}
                          setShowStatusDropdown={setShowStatusDropdown}
                          formatDueDate={formatDueDate}
                        />
                      ))}
                      {/* Add task card */}
                      <button
                        onClick={() => setShowCreateModal(true)}
                        className='border-2 border-dashed border-slate-200 rounded-xl p-4 min-h-[140px] flex flex-col items-center justify-center text-slate-500 hover:border-amber-300 hover:text-amber-600 hover:bg-amber-50/30 transition-colors'
                      >
                        <HiPlus className='w-6 h-6 mb-2' aria-hidden='true' />
                        <span className='text-sm font-medium'>{t('tasks.addTask')}</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {tasks.length === 0 && !loading && hasFilters && (
              <EmptyState
                icon={HiFilter}
                title={t('tasksBoard.noMatches')}
                body={t('tasksBoard.noMatchesBody')}
                action={<Button variant='secondary' icon={HiX} onClick={clearFilters}>{t('tasksBoard.clearFilters')}</Button>}
              />
            )}
            {tasks.length === 0 && !loading && !hasFilters && (
              <div className='flex flex-col items-center justify-center py-20 text-center'>
                <div className='w-16 h-16 rounded-2xl bg-amber-50 ring-1 ring-amber-100 flex items-center justify-center mx-auto mb-5'>
                  <HiClipboardList className='w-8 h-8 text-amber-500' aria-hidden='true' />
                </div>
                <h3 className='text-lg font-semibold text-slate-900 mb-1.5'>{t('tasks.noTasksYet')}</h3>
                <p className='text-slate-500 text-sm mb-6 max-w-xs'>{t('tasks.createYourFirstTaskToStart')}</p>
                <Button variant='primary' size='md' icon={HiPlus} onClick={() => setShowCreateModal(true)}>{t('tasks.createYourFirstTask')}</Button>
              </div>
            )}
          </div>
        )}

        {/* Table View. Flat rather than grouped by status: it is paged and
            sorted on the server, and a group header on page 3 would only be
            telling you about the 20 rows beside it. Status is a sortable
            column instead. */}
        {view === 'table' && (!loading && tasks.length === 0 ? (
          hasFilters ? (
            <EmptyState
              icon={HiFilter}
              title={t('tasksBoard.noMatches')}
              body={t('tasksBoard.noMatchesBody')}
              action={<Button variant='secondary' icon={HiX} onClick={clearFilters}>{t('tasksBoard.clearFilters')}</Button>}
            />
          ) : (
            <EmptyState
              icon={HiClipboardList}
              title={t('tasks.noTasksYet')}
              body={t('tasks.createYourFirstTaskToStart')}
              action={<Button variant='primary' icon={HiPlus} onClick={() => setShowCreateModal(true)}>{t('tasks.createYourFirstTask')}</Button>}
            />
          )
        ) : (
          <div className='p-4 space-y-1'>
            <div className='flex items-center justify-end pb-2'>
              <ColumnToggle columns={TABLE_COLUMNS} isVisible={isVisible} onToggle={toggleColumn} onReset={resetColumns} />
            </div>
            <Table maxHeight='max-h-[70vh]' className='bg-card'>
              <Thead sticky>
                <tr>
                  <Th className='w-10 pr-0'>
                    <Checkbox
                      aria-label={t('tasksBoard.selectAllOnPage')}
                      checked={selection.headerCheckbox.checked}
                      indeterminate={selection.headerCheckbox.indeterminate}
                      onChange={selection.headerCheckbox.onChange}
                      disabled={selection.headerCheckbox.disabled || loading}
                    />
                  </Th>
                  {isVisible('task') && <Th sortKey='title' sort={sort} onSort={onSort} className='w-[300px]'>{t('tasks.task')}</Th>}
                  {isVisible('status') && <Th sortKey='status' sort={sort} onSort={onSort}>{t('tasks.status')}</Th>}
                  {isVisible('priority') && <Th sortKey='priority' sort={sort} onSort={onSort}>{t('tasks.priority')}</Th>}
                  {isVisible('dueAt') && <Th sortKey='dueAt' sort={sort} onSort={onSort}>{t('tasks.dueDate')}</Th>}
                  {isVisible('description') && <Th>{t('tasks.description')}</Th>}
                  <Th className='w-[100px]'><span className='sr-only'>{t('tasksBoard.actions')}</span></Th>
                </tr>
              </Thead>
              <Tbody>
                {loading ? (
                  <SkeletonRows rows={Math.min(pageSize, 10)} columns={visibleColumns.length + 2} />
                ) : tasks.map((task) => {
                  const config = STATUS_CONFIG[task.status] || STATUS_CONFIG.todo;
                  const due = formatDueDate(task.dueAt, task.status);
                  const priorityConfig = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
                  const checked = selection.isSelected(task._id);
                  return (
                    <Tr
                      key={task._id}
                      selected={checked}
                      className='group'
                      onClick={() => setSelectedTask(task)}
                    >
                      <Td className='w-10 pr-0'>
                        {/* Its own click: ticking a row must not also open it. */}
                        <Checkbox
                          aria-label={t('tasksBoard.selectTask', { title: task.title })}
                          checked={checked}
                          onChange={() => selection.toggle(task._id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </Td>
                      {isVisible('task') && (
                        <Td className='pl-4 pr-2'>
                          <div className='flex items-center gap-3'>
                            <div className={`w-1 h-8 rounded-full ${config.color} flex-shrink-0`} />
                            <div className='min-w-0'>
                              {/* A real button: the row's onClick is mouse-only. */}
                              <button
                                type='button'
                                onClick={(e) => { e.stopPropagation(); setSelectedTask(task); }}
                                className='block max-w-full text-left font-semibold text-foreground text-[13px] truncate group-hover:text-brand-700 dark:group-hover:text-brand-300 transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'
                              >
                                {task.title}
                              </button>
                            </div>
                          </div>
                        </Td>
                      )}
                      {isVisible('status') && (
                        <Td>
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${config.color} text-white`}>
                            {config.label}
                          </span>
                        </Td>
                      )}
                      {isVisible('priority') && (
                        <Td>
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium ${priorityConfig.color} text-white`}>
                            <priorityConfig.icon className='w-3 h-3' aria-hidden='true' />
                            {priorityConfig.label}
                          </span>
                        </Td>
                      )}
                      {isVisible('dueAt') && (
                        <Td>
                          {due ? (
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium ${due.class}`}>
                              <HiClock className='w-3 h-3' aria-hidden='true' />
                              {due.text}
                            </span>
                          ) : (
                            <span className='text-muted-foreground text-[13px]'>—</span>
                          )}
                        </Td>
                      )}
                      {isVisible('description') && (
                        <Td>
                          <span className='text-muted-foreground text-[13px] truncate block max-w-[200px]'>
                            {task.description || '—'}
                          </span>
                        </Td>
                      )}
                      <Td right>
                        <div className='flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity'>
                          <button
                            type='button'
                            onClick={(e) => { e.stopPropagation(); openEditModal(task); }}
                            className='p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors'
                            title={t('tasks.edit')}
                            aria-label={`Edit ${task.title}`}
                          >
                            <HiPencil className='w-4 h-4' aria-hidden='true' />
                          </button>
                          <button
                            type='button'
                            onClick={(e) => { e.stopPropagation(); setPendingDelete(task._id); }}
                            className='p-1.5 rounded-lg text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors'
                            title={t('tasks.delete')}
                            aria-label={`Delete ${task.title}`}
                          >
                            <HiTrash className='w-4 h-4' aria-hidden='true' />
                          </button>
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
            {total > 0 && (
              <Pagination
                page={page}
                pageSize={pageSize}
                total={total}
                onPageChange={(p) => { setPage(p); selection.clear(); }}
                onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
              />
            )}
          </div>
        ))}
      </div>

      {/* Task Detail Panel */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onEdit={() => openEditModal(selectedTask)}
          onDelete={() => setPendingDelete(selectedTask._id)}
          onStatusChange={(newStatus) => handleStatusChange(selectedTask._id, newStatus)}
          formatDueDate={formatDueDate}
        />
      )}

      {/* Create Task Modal */}
      {showCreateModal && (
        <TaskFormModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateTask}
          loading={creating}
          title={t('tasks.createNewTask')}
        />
      )}

      {/* Edit Task Modal */}
      {showEditModal && editingTask && (
        <TaskFormModal
          task={editingTask}
          onClose={() => { setShowEditModal(false); setEditingTask(null); }}
          onSubmit={(data) => handleUpdateTask(editingTask._id, data)}
          loading={false}
          title={t('tasks.editTask')}
        />
      )}
      <ConfirmDialog
        open={!!pendingDelete}
        title={t('tasks.deleteTask')}
        description={t('tasks.thisCannotBeUndone')}
        confirmLabel={t('tasks.delete')}
        onConfirm={() => { handleDeleteTask(pendingDelete); setPendingDelete(null); }}
        onCancel={() => setPendingDelete(null)}
      />
      <ConfirmDialog
        open={pendingBulkDelete}
        title={t('tasksBoard.deleteSelectedTitle', { count: selection.count })}
        description={t('tasks.thisCannotBeUndone')}
        confirmLabel={t('tasks.delete')}
        onConfirm={() => { setPendingBulkDelete(false); applyBulk(bulkDelete, { removes: true }); }}
        onCancel={() => setPendingBulkDelete(false)}
      />

      {/* Appears only once rows are ticked, in the table view. */}
      <BulkActionBar count={selection.count} onClear={selection.clear}>
        <BulkButton onClick={() => applyBulk(bulkComplete)} disabled={bulkBusy}>
          <span className='inline-flex items-center gap-1.5'><HiCheck className='w-4 h-4' aria-hidden='true' />{t('tasksBoard.markComplete')}</span>
        </BulkButton>
        {isAdmin && (
          <BulkSelect
            value=''
            aria-label={t('tasksBoard.assignSelectedTo')}
            disabled={bulkBusy}
            onChange={(e) => { if (e.target.value) applyBulk(bulkAssign(e.target.value)); }}
          >
            <option value=''>{t('tasksBoard.assignTo')}</option>
            {agents.map((agent) => (
              <option key={agent._id} value={agent._id}>{agent.username}</option>
            ))}
          </BulkSelect>
        )}
        <BulkButton danger onClick={() => setPendingBulkDelete(true)} disabled={bulkBusy}>{t('tasks.delete')}</BulkButton>
      </BulkActionBar>
    </div>
  );
}

// TaskCard component
function TaskCard({ task, onSelect, onEdit, onDelete, onStatusChange, showStatusDropdown, setShowStatusDropdown, formatDueDate }) {
  const { t } = useTranslation();
  const config = STATUS_CONFIG[task.status] || STATUS_CONFIG.todo;
  const priorityConfig = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
  const due = formatDueDate(task.dueAt, task.status);

  return (
    <div
      className='bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md hover:border-slate-300 transition-all cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'
      onClick={onSelect}
      role='button'
      tabIndex={0}
      aria-label={task.title}
      onKeyDown={(e) => {
        // Only the card itself: Enter/Space on a nested button is that button's.
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      {/* Header */}
      <div className='flex items-start justify-between mb-3'>
        <div className='flex items-center gap-2 min-w-0'>
          <div className={`w-1 h-8 rounded-full ${config.color} flex-shrink-0`} />
          <h3 className='font-semibold text-slate-900 text-sm truncate group-hover:text-indigo-700 transition-colors'>
            {task.title}
          </h3>
        </div>
        <div className='flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity'>
          <button
            type='button'
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className='p-1 rounded text-slate-500 hover:text-slate-700 hover:bg-slate-100'
            title={t('tasks.edit')}
            aria-label={`Edit ${task.title}`}
          >
            <HiPencil className='w-3.5 h-3.5' aria-hidden='true' />
          </button>
          <button
            type='button'
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className='p-1 rounded text-slate-500 hover:text-rose-600 hover:bg-rose-50'
            title={t('tasks.delete')}
            aria-label={`Delete ${task.title}`}
          >
            <HiTrash className='w-3.5 h-3.5' aria-hidden='true' />
          </button>
        </div>
      </div>

      {/* Description */}
      {task.description && (
        <p className='text-xs text-slate-500 line-clamp-2 mb-3'>{task.description}</p>
      )}

      {/* Meta info */}
      <div className='flex flex-wrap items-center gap-2 mb-3'>
        {/* Priority */}
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${priorityConfig.color} text-white`}>
          <priorityConfig.icon className='w-3 h-3' aria-hidden='true' />
          {priorityConfig.label}
        </span>
        {/* Due date */}
        {due && (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${due.class}`}>
            <HiClock className='w-3 h-3' aria-hidden='true' />
            {due.text}
          </span>
        )}
      </div>

      {/* Status badge with dropdown */}
      <div className='relative'>
        <button
          type='button'
          onClick={(e) => {
            e.stopPropagation();
            setShowStatusDropdown(showStatusDropdown ? null : task._id);
          }}
          onKeyDown={(e) => e.stopPropagation()}
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
            onKeyDown={(e) => e.stopPropagation()}
            role='presentation'
          >
            {STATUS_ORDER.map((s) => {
              const sConfig = STATUS_CONFIG[s];
              return (
                <button
                  key={s}
                  type='button'
                  aria-current={task.status === s ? 'true' : undefined}
                  onClick={() => onStatusChange(s)}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 flex items-center gap-2 ${
                    task.status === s ? 'bg-slate-50 font-medium' : ''
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full ${sConfig.color}`} />
                  {sConfig.label}
                  {task.status === s && <HiCheck className='w-4 h-4 ml-auto text-indigo-600' aria-hidden='true' />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// TaskFormModal component (for create and edit)
function TaskFormModal({ task, onClose, onSubmit, loading, title }) {
  const { t } = useTranslation();
  const uid = useId();
  const fid = (name) => `${uid}-${name}`;
  const [formData, setFormData] = useState({
    title: task?.title || '',
    description: task?.description || '',
    status: task?.status || 'todo',
    priority: task?.priority || 'medium',
    dueAt: task?.dueAt ? new Date(task.dueAt).toISOString().split('T')[0] : '',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = { ...formData };
    if (data.dueAt) {
      data.dueAt = new Date(data.dueAt).toISOString();
    } else {
      delete data.dueAt;
    }
    onSubmit(data);
  };

  return (
    <Modal open onClose={onClose} title={title} size='lg'>
      <form onSubmit={handleSubmit} className='space-y-4'>
        <div>
          <label htmlFor={fid('title')} className='block text-sm font-medium text-slate-700 mb-1'>{t('tasks.taskTitle')}</label>
          <input
            id={fid('title')}
            type='text'
            required
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            className='w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-indigo-400 outline-none transition-all'
            placeholder={t('tasks.enterTaskTitle')}
          />
        </div>
        <div className='grid grid-cols-2 gap-4'>
          <div>
            <label htmlFor={fid('status')} className='block text-sm font-medium text-slate-700 mb-1'>{t('tasks.status')}</label>
            <select
              id={fid('status')}
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className='w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-indigo-400 outline-none transition-all bg-white'
            >
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>{STATUS_CONFIG[s]?.label || s}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={fid('priority')} className='block text-sm font-medium text-slate-700 mb-1'>{t('tasks.priority')}</label>
            <select
              id={fid('priority')}
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
              className='w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-indigo-400 outline-none transition-all bg-white'
            >
              {PRIORITY_ORDER.map((p) => (
                <option key={p} value={p}>{PRIORITY_CONFIG[p]?.label || p}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor={fid('due')} className='block text-sm font-medium text-slate-700 mb-1'>{t('tasks.dueDate')}</label>
          <input
            id={fid('due')}
            type='date'
            value={formData.dueAt}
            onChange={(e) => setFormData({ ...formData, dueAt: e.target.value })}
            className='w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-indigo-400 outline-none transition-all'
          />
        </div>
        <div>
          <label htmlFor={fid('description')} className='block text-sm font-medium text-slate-700 mb-1'>{t('tasks.description')}</label>
          <textarea
            id={fid('description')}
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={4}
            className='w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-indigo-400 outline-none transition-all resize-none'
            placeholder={t('tasks.addTaskDescription')}
          />
        </div>
        <div className='flex items-center justify-end gap-3 pt-2'>
          <button
            type='button'
            onClick={onClose}
            className='px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors'
          >{t('tasks.cancel')}</button>
          <button
            type='submit'
            disabled={loading || !formData.title}
            className='px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
          >
            {loading ? 'Saving...' : task ? 'Save Changes' : 'Create Task'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// TaskDetailPanel component
function TaskDetailPanel({ task, onClose, onEdit, onDelete, onStatusChange, formatDueDate }) {
  const { t } = useTranslation();
  const config = STATUS_CONFIG[task.status] || STATUS_CONFIG.todo;
  const priorityConfig = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const due = formatDueDate(task.dueAt, task.status);
  const closeRef = useRef(null);
  const titleId = useId();

  // Focus starts inside the panel, so keyboard users are not left behind it.
  useEffect(() => { closeRef.current?.focus(); }, []);

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const formatFullDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className='fixed inset-0 !mt-0 bg-black/30 backdrop-blur-[2px] flex items-start justify-end z-50'>
      <div
        className='w-full max-w-xl h-full bg-white shadow-2xl overflow-hidden flex flex-col'
        role='dialog'
        aria-modal='true'
        aria-labelledby={titleId}
      >
        {/* Header */}
        <div className='bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0'>
          <div className='flex items-start justify-between'>
            <div className='flex items-center gap-3'>
              <div className={`w-2 h-12 rounded-full ${config.color}`} />
              <div>
                <h2 id={titleId} className='text-lg font-bold text-slate-900'>{task.title}</h2>
              </div>
            </div>
            <div className='flex items-center gap-2'>
              <button
                type='button'
                onClick={onEdit}
                className='px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 transition-colors'
              >
                <HiPencil className='w-4 h-4' aria-hidden='true' />{t('tasks.edit')}</button>
              <button
                type='button'
                onClick={onDelete}
                aria-label={t('tasks.delete')}
                className='px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-rose-600 hover:bg-rose-50 hover:border-rose-200 flex items-center gap-1.5 transition-colors'
              >
                <HiTrash className='w-4 h-4' aria-hidden='true' />
              </button>
              <button ref={closeRef} type='button' onClick={onClose} aria-label='Close' className='p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors'>
                <HiX className='w-5 h-5' aria-hidden='true' />
              </button>
            </div>
          </div>

          {/* Status and Priority badges */}
          <div className='mt-4 flex items-center gap-2'>
            <div className='relative'>
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
                        aria-current={task.status === s ? 'true' : undefined}
                        onClick={() => { onStatusChange(s); setShowStatusDropdown(false); }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2 ${
                          task.status === s ? 'bg-slate-50 font-medium' : ''
                        }`}
                      >
                        <div className={`w-2.5 h-2.5 rounded-full ${sConfig.color}`} />
                        {sConfig.label}
                        {task.status === s && <HiCheck className='w-4 h-4 ml-auto text-indigo-600' aria-hidden='true' />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <span className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium ${priorityConfig.color} text-white`}>
              <priorityConfig.icon className='w-3.5 h-3.5' aria-hidden='true' />
              {priorityConfig.label}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className='flex-1 overflow-y-auto p-6'>
          <div className='space-y-6'>
            {/* Due Date */}
            <div className='bg-slate-50 rounded-xl p-5'>
              <h3 className='font-semibold text-slate-900 mb-3 flex items-center gap-2'>
                <HiCalendar className='w-5 h-5 text-slate-400' aria-hidden='true' />{t('tasks.dueDate')}</h3>
              {due ? (
                <div className='flex items-center gap-3'>
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${due.class}`}>
                    <HiClock className='w-4 h-4' aria-hidden='true' />
                    {due.text}
                  </span>
                  <span className='text-sm text-slate-500'>{formatFullDate(task.dueAt)}</span>
                </div>
              ) : (
                <p className='text-sm text-slate-500'>{t('tasks.noDueDateSet')}</p>
              )}
            </div>

            {/* Description */}
            <div className='bg-slate-50 rounded-xl p-5'>
              <h3 className='font-semibold text-slate-900 mb-3 flex items-center gap-2'>
                <HiClipboardList className='w-5 h-5 text-slate-400' aria-hidden='true' />{t('tasks.description')}</h3>
              <p className='text-sm text-slate-700 whitespace-pre-wrap'>{task.description || 'No description added.'}</p>
            </div>

            {/* Timestamps */}
            <div className='bg-slate-50 rounded-xl p-5'>
              <h3 className='font-semibold text-slate-900 mb-3 flex items-center gap-2'>
                <HiClock className='w-5 h-5 text-slate-400' aria-hidden='true' />{t('tasks.timeline')}</h3>
              <div className='grid grid-cols-2 gap-4'>
                <div>
                  <span className='text-xs font-medium text-slate-500 uppercase tracking-wider'>{t('tasks.created')}</span>
                  <p className='text-sm text-slate-900 mt-1'>{formatFullDate(task.createdAt)}</p>
                </div>
                <div>
                  <span className='text-xs font-medium text-slate-500 uppercase tracking-wider'>{t('tasks.lastUpdated')}</span>
                  <p className='text-sm text-slate-900 mt-1'>{formatFullDate(task.updatedAt)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Click outside to close. order-first: it sat after the panel, so as
          a flex-1 it took the left of the row and pushed the panel off the
          right edge where justify-end meant to put it. */}
      <div className='order-first flex-1 h-full' onClick={onClose} aria-hidden='true' />
    </div>
  );
}

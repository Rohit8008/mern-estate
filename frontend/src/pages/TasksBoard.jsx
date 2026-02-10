import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { apiClient } from '../utils/http';
import { useBuyerView } from '../contexts/BuyerViewContext';
import {
  HiPlus, HiSearch, HiX, HiChevronDown, HiChevronRight,
  HiCheck, HiPencil, HiTrash, HiRefresh, HiClock,
  HiViewGrid, HiViewList, HiUser, HiCalendar, HiFlag,
  HiClipboardList, HiExclamation,
} from 'react-icons/hi';

const STATUS_CONFIG = {
  todo: { label: 'To Do', color: 'bg-slate-400', textColor: 'text-slate-600', bgLight: 'bg-slate-50', border: 'border-slate-200' },
  in_progress: { label: 'In Progress', color: 'bg-amber-500', textColor: 'text-amber-700', bgLight: 'bg-amber-50', border: 'border-amber-200' },
  review: { label: 'Review', color: 'bg-blue-500', textColor: 'text-blue-700', bgLight: 'bg-blue-50', border: 'border-blue-200' },
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

export default function TasksBoard() {
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
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [creating, setCreating] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [showStatusDropdown, setShowStatusDropdown] = useState(null);

  // Filters
  const q = searchParams.get('q') || '';
  const statusFilter = searchParams.get('status') || '';
  const priorityFilter = searchParams.get('priority') || '';

  const canAccess = useMemo(() => {
    if (!currentUser) return false;
    if (isBuyerViewMode) return false;
    return currentUser.role === 'admin' || currentUser.role === 'employee';
  }, [currentUser, isBuyerViewMode]);

  const fetchTasks = useCallback(async () => {
    if (!canAccess) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (statusFilter) params.set('status', statusFilter);
      params.set('limit', '200');
      const response = await apiClient.get(`/tasks?${params.toString()}`);
      const data = response?.data || response || [];
      setTasks(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to load tasks:', e);
      setError(e?.message || 'Failed to load tasks');
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [canAccess, q, statusFilter]);

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

  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  };

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
    if (!window.confirm('Are you sure you want to delete this task?')) return;
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

  const formatDueDate = (dateStr) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const now = new Date();
    const diff = date - now;
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    
    if (days < 0) return { text: 'Overdue', class: 'text-rose-600 bg-rose-50' };
    if (days === 0) return { text: 'Today', class: 'text-amber-600 bg-amber-50' };
    if (days === 1) return { text: 'Tomorrow', class: 'text-amber-600 bg-amber-50' };
    if (days <= 7) return { text: `${days} days`, class: 'text-blue-600 bg-blue-50' };
    return { text: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), class: 'text-slate-600 bg-slate-50' };
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
          <h1 className='text-xl font-bold text-slate-900'>Tasks</h1>
          <span className='text-xs font-medium text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full'>
            {tasks.length}
          </span>
        </div>
        <div className='flex items-center gap-2'>
          <button
            onClick={fetchTasks}
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
            New task
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
                placeholder='Search tasks...'
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

            <select
              value={priorityFilter}
              onChange={(e) => setParam('priority', e.target.value)}
              className='px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 outline-none transition-all'
            >
              <option value=''>All priorities</option>
              {PRIORITY_ORDER.map((p) => (
                <option key={p} value={p}>{PRIORITY_CONFIG[p]?.label || p}</option>
              ))}
            </select>

            {(q || statusFilter || priorityFilter) && (
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
            <HiExclamation className='w-4 h-4 flex-shrink-0' />
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
            {STATUS_ORDER.map((status) => {
              const items = groupedTasks.get(status) || [];
              if (items.length === 0 && statusFilter && statusFilter !== status) return null;
              const config = STATUS_CONFIG[status] || STATUS_CONFIG.todo;
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
                      {items.map((task) => (
                        <TaskCard
                          key={task._id}
                          task={task}
                          onSelect={() => setSelectedTask(task)}
                          onEdit={() => openEditModal(task)}
                          onDelete={() => handleDeleteTask(task._id)}
                          onStatusChange={(newStatus) => handleStatusChange(task._id, newStatus)}
                          showStatusDropdown={showStatusDropdown === task._id}
                          setShowStatusDropdown={setShowStatusDropdown}
                          formatDueDate={formatDueDate}
                        />
                      ))}
                      {/* Add task card */}
                      <button
                        onClick={() => setShowCreateModal(true)}
                        className='border-2 border-dashed border-slate-200 rounded-xl p-4 min-h-[140px] flex flex-col items-center justify-center text-slate-400 hover:border-slate-400 hover:text-slate-600 transition-colors'
                      >
                        <HiPlus className='w-6 h-6 mb-2' />
                        <span className='text-sm font-medium'>Add task</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {tasks.length === 0 && !loading && (
              <div className='text-center py-16'>
                <div className='w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4'>
                  <HiClipboardList className='w-8 h-8 text-slate-400' />
                </div>
                <h3 className='text-lg font-semibold text-slate-900 mb-2'>No tasks yet</h3>
                <p className='text-slate-500 mb-4'>Get started by creating your first task</p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className='px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 text-sm font-medium inline-flex items-center gap-2'
                >
                  <HiPlus className='w-4 h-4' />
                  Create task
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
                  <th className='text-left pl-4 pr-2 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider w-[300px]'>Task</th>
                  <th className='text-left px-3 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider'>Status</th>
                  <th className='text-left px-3 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider'>Priority</th>
                  <th className='text-left px-3 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider'>Due Date</th>
                  <th className='text-left px-3 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider'>Description</th>
                  <th className='text-right px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider w-[100px]'></th>
                </tr>
              </thead>
              <tbody className='divide-y divide-slate-100'>
                {STATUS_ORDER.map((status) => {
                  const items = groupedTasks.get(status) || [];
                  if (items.length === 0) return null;
                  const config = STATUS_CONFIG[status] || STATUS_CONFIG.todo;
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
                      {/* Task rows */}
                      {!isCollapsed && items.map((task) => {
                        const due = formatDueDate(task.dueAt);
                        const priorityConfig = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
                        return (
                          <tr
                            key={task._id}
                            className='group hover:bg-blue-50/40 transition-colors cursor-pointer'
                            onClick={() => setSelectedTask(task)}
                          >
                            <td className='pl-4 pr-2 py-3'>
                              <div className='flex items-center gap-3'>
                                <div className={`w-1 h-8 rounded-full ${config.color} flex-shrink-0`} />
                                <div className='min-w-0'>
                                  <div className='font-semibold text-slate-900 text-[13px] truncate group-hover:text-blue-700 transition-colors'>
                                    {task.title}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className='px-3 py-3'>
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${config.color} text-white`}>
                                {config.label}
                              </span>
                            </td>
                            <td className='px-3 py-3'>
                              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium ${priorityConfig.color} text-white`}>
                                <priorityConfig.icon className='w-3 h-3' />
                                {priorityConfig.label}
                              </span>
                            </td>
                            <td className='px-3 py-3'>
                              {due ? (
                                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium ${due.class}`}>
                                  <HiClock className='w-3 h-3' />
                                  {due.text}
                                </span>
                              ) : (
                                <span className='text-slate-400 text-[13px]'>—</span>
                              )}
                            </td>
                            <td className='px-3 py-3'>
                              <span className='text-slate-600 text-[13px] truncate block max-w-[200px]'>
                                {task.description || '—'}
                              </span>
                            </td>
                            <td className='px-4 py-3 text-right'>
                              <div className='flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity'>
                                <button
                                  onClick={(e) => { e.stopPropagation(); openEditModal(task); }}
                                  className='p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors'
                                  title='Edit'
                                >
                                  <HiPencil className='w-4 h-4' />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDeleteTask(task._id); }}
                                  className='p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors'
                                  title='Delete'
                                >
                                  <HiTrash className='w-4 h-4' />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
                {tasks.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} className='px-4 py-16 text-center'>
                      <div className='flex flex-col items-center gap-3'>
                        <div className='w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center'>
                          <HiClipboardList className='w-6 h-6 text-slate-400' />
                        </div>
                        <p className='text-slate-500 text-sm'>No tasks found</p>
                        <button
                          onClick={() => setShowCreateModal(true)}
                          className='text-sm font-medium text-blue-600 hover:text-blue-700'
                        >
                          + Create your first task
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Footer summary */}
            {tasks.length > 0 && (
              <div className='px-4 py-2.5 border-t border-slate-200 bg-slate-50/50 flex items-center justify-between'>
                <span className='text-xs text-slate-500'>{tasks.length} task{tasks.length === 1 ? '' : 's'} total</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Task Detail Panel */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onEdit={() => openEditModal(selectedTask)}
          onDelete={() => handleDeleteTask(selectedTask._id)}
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
          title='Create New Task'
        />
      )}

      {/* Edit Task Modal */}
      {showEditModal && editingTask && (
        <TaskFormModal
          task={editingTask}
          onClose={() => { setShowEditModal(false); setEditingTask(null); }}
          onSubmit={(data) => handleUpdateTask(editingTask._id, data)}
          loading={false}
          title='Edit Task'
        />
      )}
    </div>
  );
}

// TaskCard component
function TaskCard({ task, onSelect, onEdit, onDelete, onStatusChange, showStatusDropdown, setShowStatusDropdown, formatDueDate }) {
  const config = STATUS_CONFIG[task.status] || STATUS_CONFIG.todo;
  const priorityConfig = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
  const due = formatDueDate(task.dueAt);

  return (
    <div
      className='bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md hover:border-slate-300 transition-all cursor-pointer group'
      onClick={onSelect}
    >
      {/* Header */}
      <div className='flex items-start justify-between mb-3'>
        <div className='flex items-center gap-2 min-w-0'>
          <div className={`w-1 h-8 rounded-full ${config.color} flex-shrink-0`} />
          <h3 className='font-semibold text-slate-900 text-sm truncate group-hover:text-blue-700 transition-colors'>
            {task.title}
          </h3>
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

      {/* Description */}
      {task.description && (
        <p className='text-xs text-slate-500 line-clamp-2 mb-3'>{task.description}</p>
      )}

      {/* Meta info */}
      <div className='flex flex-wrap items-center gap-2 mb-3'>
        {/* Priority */}
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${priorityConfig.color} text-white`}>
          <priorityConfig.icon className='w-3 h-3' />
          {priorityConfig.label}
        </span>
        {/* Due date */}
        {due && (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${due.class}`}>
            <HiClock className='w-3 h-3' />
            {due.text}
          </span>
        )}
      </div>

      {/* Status badge with dropdown */}
      <div className='relative'>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowStatusDropdown(showStatusDropdown ? null : task._id);
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
                    task.status === s ? 'bg-slate-50 font-medium' : ''
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full ${sConfig.color}`} />
                  {sConfig.label}
                  {task.status === s && <HiCheck className='w-4 h-4 ml-auto text-blue-600' />}
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
            <label className='block text-sm font-medium text-slate-700 mb-1'>Task Title *</label>
            <input
              type='text'
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className='w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400 outline-none transition-all'
              placeholder='Enter task title'
            />
          </div>
          <div className='grid grid-cols-2 gap-4'>
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
              <label className='block text-sm font-medium text-slate-700 mb-1'>Priority</label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                className='w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400 outline-none transition-all bg-white'
              >
                {PRIORITY_ORDER.map((p) => (
                  <option key={p} value={p}>{PRIORITY_CONFIG[p]?.label || p}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className='block text-sm font-medium text-slate-700 mb-1'>Due Date</label>
            <input
              type='date'
              value={formData.dueAt}
              onChange={(e) => setFormData({ ...formData, dueAt: e.target.value })}
              className='w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400 outline-none transition-all'
            />
          </div>
          <div>
            <label className='block text-sm font-medium text-slate-700 mb-1'>Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={4}
              className='w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400 outline-none transition-all resize-none'
              placeholder='Add task description...'
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
              disabled={loading || !formData.title}
              className='px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
            >
              {loading ? 'Saving...' : task ? 'Save Changes' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// TaskDetailPanel component
function TaskDetailPanel({ task, onClose, onEdit, onDelete, onStatusChange, formatDueDate }) {
  const config = STATUS_CONFIG[task.status] || STATUS_CONFIG.todo;
  const priorityConfig = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const due = formatDueDate(task.dueAt);

  const formatFullDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className='fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-start justify-end z-50'>
      <div className='w-full max-w-xl h-full bg-white shadow-2xl overflow-hidden flex flex-col'>
        {/* Header */}
        <div className='bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0'>
          <div className='flex items-start justify-between'>
            <div className='flex items-center gap-3'>
              <div className={`w-2 h-12 rounded-full ${config.color}`} />
              <div>
                <h2 className='text-lg font-bold text-slate-900'>{task.title}</h2>
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

          {/* Status and Priority badges */}
          <div className='mt-4 flex items-center gap-2'>
            <div className='relative'>
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
                          task.status === s ? 'bg-slate-50 font-medium' : ''
                        }`}
                      >
                        <div className={`w-2.5 h-2.5 rounded-full ${sConfig.color}`} />
                        {sConfig.label}
                        {task.status === s && <HiCheck className='w-4 h-4 ml-auto text-blue-600' />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <span className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium ${priorityConfig.color} text-white`}>
              <priorityConfig.icon className='w-3.5 h-3.5' />
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
                <HiCalendar className='w-5 h-5 text-slate-400' />
                Due Date
              </h3>
              {due ? (
                <div className='flex items-center gap-3'>
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${due.class}`}>
                    <HiClock className='w-4 h-4' />
                    {due.text}
                  </span>
                  <span className='text-sm text-slate-500'>{formatFullDate(task.dueAt)}</span>
                </div>
              ) : (
                <p className='text-sm text-slate-400'>No due date set</p>
              )}
            </div>

            {/* Description */}
            <div className='bg-slate-50 rounded-xl p-5'>
              <h3 className='font-semibold text-slate-900 mb-3 flex items-center gap-2'>
                <HiClipboardList className='w-5 h-5 text-slate-400' />
                Description
              </h3>
              <p className='text-sm text-slate-700 whitespace-pre-wrap'>{task.description || 'No description added.'}</p>
            </div>

            {/* Timestamps */}
            <div className='bg-slate-50 rounded-xl p-5'>
              <h3 className='font-semibold text-slate-900 mb-3 flex items-center gap-2'>
                <HiClock className='w-5 h-5 text-slate-400' />
                Timeline
              </h3>
              <div className='grid grid-cols-2 gap-4'>
                <div>
                  <label className='text-xs font-medium text-slate-500 uppercase tracking-wider'>Created</label>
                  <p className='text-sm text-slate-900 mt-1'>{formatFullDate(task.createdAt)}</p>
                </div>
                <div>
                  <label className='text-xs font-medium text-slate-500 uppercase tracking-wider'>Last Updated</label>
                  <p className='text-sm text-slate-900 mt-1'>{formatFullDate(task.updatedAt)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Click outside to close */}
      <div className='flex-1 h-full' onClick={onClose} />
    </div>
  );
}

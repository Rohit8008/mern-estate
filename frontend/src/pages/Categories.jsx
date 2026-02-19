import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { FaThList, FaPlus, FaExternalLinkAlt, FaTable, FaPencilAlt, FaTrash, FaUpload, FaTimes, FaCheck } from 'react-icons/fa';
import { apiClient } from '../utils/http';

function CategoryCard({ c, hasPerm, onDelete, deletingId }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDeleteClick = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      // Auto-cancel confirmation after 4 seconds
      setTimeout(() => setConfirmDelete(false), 4000);
      return;
    }
    onDelete(c);
    setConfirmDelete(false);
  };

  return (
    <div className='bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-md hover:border-slate-300 transition-all duration-200 flex flex-col gap-4'>
      {/* Header */}
      <div className='flex items-start justify-between gap-3'>
        <div className='flex items-center gap-3 min-w-0'>
          <div className='w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0'>
            <FaThList className='w-4 h-4 text-indigo-600' />
          </div>
          <div className='min-w-0'>
            <div className='text-sm font-semibold text-slate-900 truncate'>{c.name}</div>
            <div className='text-xs text-slate-400 font-mono mt-0.5'>{c.slug}</div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className='flex items-center gap-2 flex-wrap'>
        <Link
          to={`/category/${c.slug}`}
          className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-medium transition-colors border border-slate-200'
        >
          <FaExternalLinkAlt className='w-3 h-3' />
          View Listings
        </Link>
        <Link
          to={`/dynamic-listings/${c.slug}`}
          className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-medium transition-colors border border-emerald-200'
        >
          <FaTable className='w-3 h-3' />
          Excel View
        </Link>
      </div>

      {/* Admin/edit actions */}
      {(hasPerm('updateCategory') || hasPerm('deleteCategory')) && (
        <div className='flex items-center justify-between pt-3 border-t border-slate-100'>
          <div className='flex items-center gap-3'>
            {hasPerm('updateCategory') && (
              <Link
                to={`/admin/categories/${c.slug}/fields`}
                className='inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-indigo-600 font-medium transition-colors'
              >
                <FaPencilAlt className='w-3 h-3' />
                Edit Fields
              </Link>
            )}
          </div>

          {hasPerm('deleteCategory') && (
            <div className='flex items-center gap-1.5'>
              {confirmDelete && (
                <span className='text-xs text-red-600 font-medium'>Confirm?</span>
              )}
              <button
                onClick={handleDeleteClick}
                disabled={deletingId === c._id}
                className={`inline-flex items-center gap-1.5 text-xs font-medium transition-colors px-2.5 py-1 rounded-lg ${
                  confirmDelete
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'text-red-500 hover:text-red-700 hover:bg-red-50'
                } disabled:opacity-50`}
              >
                {deletingId === c._id ? (
                  <span>Deleting…</span>
                ) : confirmDelete ? (
                  <>
                    <FaCheck className='w-3 h-3' />
                    Yes, Delete
                  </>
                ) : (
                  <>
                    <FaTrash className='w-3 h-3' />
                    Delete
                  </>
                )}
              </button>
              {confirmDelete && (
                <button
                  onClick={() => setConfirmDelete(false)}
                  className='p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors'
                >
                  <FaTimes className='w-3 h-3' />
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Categories() {
  const { currentUser } = useSelector((state) => state.user);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [userPermissions, setUserPermissions] = useState({});
  const isAdmin = currentUser?.role === 'admin';
  const hasPerm = (perm) => isAdmin || userPermissions[perm] === true;
  const [newCategoryName, setNewCategoryName] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [permResult, data] = await Promise.allSettled([
          apiClient.get('/user/my-permissions'),
          apiClient.get('/category/list'),
        ]);
        if (permResult.status === 'fulfilled' && permResult.value?.permissions) {
          setUserPermissions(permResult.value.permissions);
        }
        const catData = data.status === 'fulfilled' ? data.value : [];
        if (Array.isArray(catData)) {
          if (currentUser?.role === 'employee' && currentUser.assignedCategories?.length) {
            setCategories(catData.filter((c) => currentUser.assignedCategories.includes(c.slug)));
          } else {
            setCategories(catData);
          }
        }
      } catch {
        setError('Failed to load categories');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [currentUser]);

  const handleCreate = async () => {
    if (!newCategoryName.trim()) {
      setError('Please enter a category name');
      return;
    }
    try {
      setCreating(true);
      setError('');
      const data = await apiClient.post('/category/create', { name: newCategoryName.trim() });
      if (data?.slug) {
        setCategories((prev) => [...prev, data]);
        setNewCategoryName('');
        setSuccessMsg(`"${data.name}" created successfully`);
        setTimeout(() => setSuccessMsg(''), 3000);
      } else {
        setError(data?.message || 'Failed to create category');
      }
    } catch {
      setError('Failed to create category');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (c) => {
    try {
      setDeletingId(c._id);
      await apiClient.delete(`/category/delete/${c._id}`);
      setCategories((prev) => prev.filter((x) => x._id !== c._id));
      setSuccessMsg(`"${c.name}" deleted`);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (e) {
      setError(e.message || 'Failed to delete category');
    } finally {
      setDeletingId('');
    }
  };

  return (
    <main>
      {/* Page header */}
      <div className='flex items-center justify-between mb-6 gap-4 flex-wrap'>
        <div>
          <h1 className='text-xl font-bold text-slate-900'>Categories</h1>
          <p className='text-sm text-slate-500 mt-0.5'>
            {categories.length} {categories.length === 1 ? 'category' : 'categories'}
          </p>
        </div>
        {isAdmin && (
          <Link
            to='/admin/import'
            className='inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-medium text-slate-700 transition-colors'
          >
            <FaUpload className='w-3.5 h-3.5' />
            Bulk Import
          </Link>
        )}
      </div>

      {/* Create form */}
      {hasPerm('createCategory') && (
        <div className='bg-white border border-slate-200 rounded-2xl p-5 mb-6'>
          <div className='text-sm font-semibold text-slate-700 mb-3'>Create New Category</div>
          <div className='flex gap-3 flex-wrap'>
            <input
              type='text'
              placeholder='e.g., DLF Phase 5, Sector 42…'
              className='flex-1 min-w-0 px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white transition-all'
              value={newCategoryName}
              onChange={(e) => {
                setNewCategoryName(e.target.value);
                setError('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <button
              disabled={creating || !newCategoryName.trim()}
              onClick={handleCreate}
              className='inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0'
            >
              <FaPlus className='w-3.5 h-3.5' />
              {creating ? 'Creating…' : 'Create Category'}
            </button>
          </div>
        </div>
      )}

      {/* Alerts */}
      {error && (
        <div className='mb-4 flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm font-medium'>
          <span className='flex-1'>{error}</span>
          <button onClick={() => setError('')} className='text-red-400 hover:text-red-600'>
            <FaTimes className='w-4 h-4' />
          </button>
        </div>
      )}
      {successMsg && (
        <div className='mb-4 flex items-center gap-3 bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl text-sm font-medium'>
          <FaCheck className='w-4 h-4 flex-shrink-0' />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4'>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className='bg-white border border-slate-200 rounded-2xl p-5 animate-pulse'>
              <div className='flex items-center gap-3 mb-4'>
                <div className='w-10 h-10 rounded-xl bg-slate-100' />
                <div className='flex-1'>
                  <div className='h-3.5 bg-slate-100 rounded w-3/4 mb-2' />
                  <div className='h-2.5 bg-slate-100 rounded w-1/2' />
                </div>
              </div>
              <div className='flex gap-2'>
                <div className='h-7 bg-slate-100 rounded-lg w-28' />
                <div className='h-7 bg-slate-100 rounded-lg w-24' />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Grid */}
      {!loading && (
        <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4'>
          {categories.map((c) => (
            <CategoryCard
              key={c._id}
              c={c}
              hasPerm={hasPerm}
              onDelete={handleDelete}
              deletingId={deletingId}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && categories.length === 0 && (
        <div className='flex flex-col items-center justify-center py-20 text-center'>
          <div className='w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4'>
            <FaThList className='w-7 h-7 text-slate-400' />
          </div>
          <div className='text-base font-semibold text-slate-700 mb-1'>No categories yet</div>
          <p className='text-sm text-slate-500 max-w-xs'>
            {hasPerm('createCategory')
              ? 'Create your first category using the form above.'
              : 'No categories have been assigned to you yet. Contact your administrator.'}
          </p>
        </div>
      )}
    </main>
  );
}

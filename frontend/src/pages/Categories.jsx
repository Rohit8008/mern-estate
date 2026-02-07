import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { apiClient } from '../utils/http';

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

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // Fetch permissions and categories in parallel
        const [permResult, data] = await Promise.allSettled([
          apiClient.get('/user/my-permissions'),
          apiClient.get('/category/list'),
        ]);
        if (permResult.status === 'fulfilled' && permResult.value?.permissions) {
          setUserPermissions(permResult.value.permissions);
        }
        const catData = data.status === 'fulfilled' ? data.value : [];
        if (Array.isArray(catData)) {
          // Employees only see their assigned categories
          if (currentUser?.role === 'employee' && currentUser.assignedCategories?.length) {
            setCategories(catData.filter((c) => currentUser.assignedCategories.includes(c.slug)));
          } else {
            setCategories(catData);
          }
        }
        setLoading(false);
      } catch (e) {
        setError('Failed to load categories');
        setLoading(false);
      }
    };
    fetchData();
  }, [currentUser]);

  return (
    <main className='max-w-6xl mx-auto px-4 py-8'>
      <h1 className='text-3xl font-bold text-slate-800 mb-6'>Categories</h1>
      {hasPerm('createCategory') && (
      <div className='mb-6 flex gap-2 items-center flex-wrap'>
        <input
          type='text'
          placeholder='Create new category (e.g., DLF)'
          className='border p-3 rounded-lg flex-1'
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
        />
        <button
          disabled={creating || !newCategoryName.trim()}
          onClick={async () => {
            if (!newCategoryName.trim()) {
              setError('Please enter a category name');
              return;
            }
            try {
              setCreating(true);
              setError(''); // Clear any previous errors
              const data = await apiClient.post('/category/create', { name: newCategoryName.trim() });
              if (data && data.slug) {
                setCategories((prev) => [...prev, data]);
                setNewCategoryName('');
                setError(''); // Clear any previous errors
              } else {
                setError(data?.message || 'Failed to create category');
              }
            } catch (error) {
              console.error('Error creating category:', error);
              setError('Failed to create category');
            } finally {
              setCreating(false);
            }
          }}
          className='px-5 py-3 rounded-lg bg-slate-800 text-white hover:opacity-95 disabled:opacity-70'
        >
          {creating ? 'Creating...' : 'Create Category'}
        </button>
        {isAdmin && <Link to='/admin/import' className='px-4 py-3 rounded-lg border text-slate-700'>Bulk Import</Link>}
      </div>
      )}
      {loading && <p>Loading...</p>}
      {error && <p className='text-red-600'>{error}</p>}
      <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4'>
        {categories.map((c) => (
          <div key={c._id} className='border rounded-xl p-5 bg-white shadow hover:shadow-md transition-shadow'>
            <div>
              <div className='text-lg font-semibold text-slate-800'>{c.name}</div>
              <div className='text-slate-500 text-sm mt-1'>Slug: {c.slug}</div>
              <div className='mt-3 flex space-x-3'>
                <Link to={`/category/${c.slug}`} className='text-blue-700 text-sm hover:underline'>
                  View listings →
                </Link>
                <Link to={`/dynamic-listings/${c.slug}`} className='text-green-700 text-sm hover:underline'>
                  Excel View →
                </Link>
              </div>
            </div>
            {(hasPerm('updateCategory') || hasPerm('deleteCategory')) && (
              <div className='mt-2 flex items-center gap-3'>
                {hasPerm('updateCategory') && (
                  <Link to={`/admin/categories/${c.slug}/fields`} className='text-sm text-slate-700 underline'>Edit fields</Link>
                )}
                {hasPerm('deleteCategory') && (
                  <button
                    onClick={async () => {
                      const ok = window.confirm(`Delete category "${c.name}"? This cannot be undone.`);
                      if (!ok) return;
                      try {
                        setDeletingId(c._id);
                        await apiClient.delete(`/category/delete/${c._id}`);
                        setCategories((prev) => prev.filter((x) => x._id !== c._id));
                      } catch (e) {
                        alert(e.message || 'Failed to delete');
                      } finally {
                        setDeletingId('');
                      }
                    }}
                    disabled={deletingId === c._id}
                    className='text-sm text-red-700 underline disabled:opacity-60'
                  >
                    {deletingId === c._id ? 'Deleting…' : 'Delete'}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        {!loading && categories.length === 0 && (
          <p className='text-slate-600'>No categories yet.</p>
        )}
      </div>
    </main>
  );
}



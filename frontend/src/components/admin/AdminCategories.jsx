import { useState } from 'react';
import { Link } from 'react-router-dom';
import { HiPlus, HiTag, HiAdjustments, HiTrash } from 'react-icons/hi';
import { apiClient } from '../../utils/http';
import { Button, Badge, Input, EmptyState } from '../../design-system';
import ConfirmDialog from '../ConfirmDialog';
import { useNotification } from '../../contexts/NotificationContext';

/**
 * The workspace's property categories. A category's fields govern how every
 * listing in it is stored, so deleting one that is in use is a decision: the API
 * refuses with a count (409) and the dialog offers to go ahead anyway.
 */
export default function AdminCategories({ categories, setCategories, canCreate, canUpdate, canDelete }) {
  const { showError, showSuccess } = useNotification();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  // { category, listingCount } — listingCount is set once the API has said it is in use.
  const [pendingDelete, setPendingDelete] = useState(null);

  const create = async (e) => {
    e.preventDefault();
    const value = name.trim();
    if (!value) return;
    setCreating(true);
    setError('');
    try {
      const data = await apiClient.post('/category/create', { name: value }, { silent: true });
      if (!data?.slug) throw new Error(data?.message || 'Could not create the category.');
      setCategories((prev) => [...prev, data]);
      setName('');
      showSuccess(`Category "${data.name}" created`);
    } catch (err) {
      setError(err?.message || 'Could not create the category.');
    } finally {
      setCreating(false);
    }
  };

  const remove = async (force) => {
    const { category } = pendingDelete;
    try {
      await apiClient.delete(`/category/delete/${category._id}${force ? '?force=true' : ''}`, { silent: true });
      setCategories((prev) => prev.filter((c) => c._id !== category._id));
      setPendingDelete(null);
      showSuccess(`Category "${category.name}" deleted`);
    } catch (err) {
      if (err?.statusCode === 409 && err?.details?.listingCount) {
        // In use: ask again, with the number, rather than deleting silently.
        setPendingDelete({ category, listingCount: err.details.listingCount });
      } else {
        setPendingDelete(null);
        showError(err?.message || 'Could not delete the category.');
      }
    }
  };

  const inUse = pendingDelete?.listingCount > 0;

  return (
    <div className='space-y-4'>
      {canCreate && (
        <form onSubmit={create} className='flex flex-wrap items-start gap-2 bg-white border border-slate-200 rounded-xl px-3 py-3 shadow-sm'>
          <Input
            aria-label='New category name'
            placeholder='New category, e.g. Residential, DLF Phase 2'
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={error || undefined}
            className='flex-1 min-w-[14rem]'
          />
          <Button type='submit' icon={HiPlus} loading={creating} disabled={!name.trim()}>Add category</Button>
        </form>
      )}

      {categories.length === 0 ? (
        <div className='bg-white border border-slate-200 rounded-xl shadow-sm'>
          <EmptyState icon={HiTag} title='No categories yet' body='Categories group your properties and decide which extra fields the listing form asks for.' />
        </div>
      ) : (
        <div className='grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4'>
          {categories.map((c) => (
            <div key={c._id} className='bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex flex-col'>
              <div className='flex items-start justify-between gap-2'>
                <div className='min-w-0'>
                  <h3 className='font-semibold text-slate-900 truncate'>{c.name}</h3>
                  <p className='text-xs text-slate-500 font-mono truncate'>{c.slug}</p>
                </div>
                {typeof c.listingCount === 'number' && (
                  <Badge variant={c.listingCount ? 'brand' : 'slate'}>{c.listingCount} {c.listingCount === 1 ? 'property' : 'properties'}</Badge>
                )}
              </div>
              <p className='text-sm text-slate-500 mt-3'>{c.fields?.length || 0} custom {(c.fields?.length || 0) === 1 ? 'field' : 'fields'}</p>
              <div className='mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2'>
                {canUpdate ? (
                  <Button as={Link} to={`/admin/categories/${c.slug}/fields`} variant='secondary' size='xs' icon={HiAdjustments}>Edit fields</Button>
                ) : <span />}
                {canDelete && (
                  <Button variant='ghost' size='xs' icon={HiTrash} onClick={() => setPendingDelete({ category: c })} className='text-rose-600 hover:text-rose-700 hover:bg-rose-50'>Delete</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title={inUse ? `"${pendingDelete.category.name}" is still in use` : `Delete "${pendingDelete?.category?.name}"?`}
        description={inUse
          ? `${pendingDelete.listingCount} ${pendingDelete.listingCount === 1 ? 'property is' : 'properties are'} in this category. They keep their data but lose the category and its extra fields. This cannot be undone.`
          : 'This cannot be undone.'}
        confirmLabel={inUse ? 'Delete anyway' : 'Delete'}
        onConfirm={() => remove(inUse)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

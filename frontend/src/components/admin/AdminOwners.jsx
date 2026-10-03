import { useMemo, useState } from 'react';
import { HiPlus, HiTrash, HiUserGroup } from 'react-icons/hi';
import { apiClient } from '../../utils/http';
import { Button, Avatar, SearchBar, Switch, Input, Modal, EmptyState, Pagination, Table, Thead, Th, Tbody, Tr, Td, useTableSort } from '../../design-system';
import ConfirmDialog from '../ConfirmDialog';
import { useNotification } from '../../contexts/NotificationContext';

const EMPTY = { name: '', email: '', phone: '', companyName: '' };

/** Property owners: search, add in a dialog, switch active, delete (with a confirm). */
export default function AdminOwners({ owners, setOwners, loading, canCreate, canUpdate, canDelete }) {
  const { showError, showSuccess } = useNotification();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return owners;
    return owners.filter((o) => [o.name, o.email, o.companyName, o.phone].some((v) => String(v || '').toLowerCase().includes(q)));
  }, [owners, query]);
  const { sorted, sort, toggle } = useTableSort(filtered, { initial: null });
  const paged = sorted.slice((page - 1) * pageSize, page * pageSize);

  const create = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const data = await apiClient.post('/owner', form, { silent: true });
      if (!data?._id) throw new Error(data?.message || 'Could not add the owner.');
      // The API hands back an existing owner with the same phone rather than a duplicate.
      setOwners((prev) => (prev.some((o) => o._id === data._id) ? prev : [data, ...prev]));
      setAdding(false);
      setForm(EMPTY);
      showSuccess(data.existing ? `${data.name} is already an owner with that phone number.` : `${data.name} added`);
    } catch (err) {
      setError(err?.message || 'Could not add the owner.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (owner) => {
    try {
      const data = await apiClient.put(`/owner/${owner._id}`, { active: !owner.active }, { silent: true });
      if (data?._id) setOwners((prev) => prev.map((o) => (o._id === data._id ? data : o)));
    } catch (err) {
      showError(err?.message || 'Could not update the owner.');
    }
  };

  const remove = async () => {
    const owner = pendingDelete;
    setPendingDelete(null);
    try {
      const data = await apiClient.delete(`/owner/${owner._id}`, { silent: true });
      if (data?.success) {
        setOwners((prev) => prev.filter((o) => o._id !== owner._id));
        showSuccess(`${owner.name} deleted`);
      }
    } catch (err) {
      showError(err?.message || 'Could not delete the owner.');
    }
  };

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2.5 shadow-sm'>
        <SearchBar value={query} onChange={(v) => { setQuery(v); setPage(1); }} placeholder='Search name, company, email or phone…' className='w-full sm:w-80' />
        {canCreate && <div className='ml-auto'><Button icon={HiPlus} onClick={() => setAdding(true)}>Add owner</Button></div>}
      </div>

      {!loading && filtered.length === 0 ? (
        <div className='bg-white border border-slate-200 rounded-xl shadow-sm'>
          <EmptyState
            icon={HiUserGroup}
            title={query ? 'No owners match that search' : 'No owners yet'}
            body={query ? 'Try a different name, company or phone number.' : 'Owners are the people and companies your properties belong to.'}
            action={!query && canCreate ? <Button icon={HiPlus} onClick={() => setAdding(true)}>Add owner</Button> : undefined}
          />
        </div>
      ) : (
        <div className='bg-white border border-slate-200 rounded-xl shadow-sm p-3'>
          <Table>
            <Thead>
              <tr>
                <Th sortKey='name' sort={sort} onSort={toggle}>Owner</Th>
                <Th sortKey='companyName' sort={sort} onSort={toggle}>Company</Th>
                <Th>Phone</Th>
                <Th sortKey='active' sort={sort} onSort={toggle}>Active</Th>
                {canDelete && <Th right><span className='sr-only'>Actions</span></Th>}
              </tr>
            </Thead>
            <Tbody>
              {paged.map((o) => (
                <Tr key={o._id}>
                  <Td>
                    <div className='flex items-center gap-3'>
                      <Avatar name={o.name} />
                      <div className='min-w-0'>
                        <div className='font-medium text-slate-900 truncate'>{o.name}</div>
                        <div className='text-xs text-slate-500 truncate'>{o.email || '—'}</div>
                      </div>
                    </div>
                  </Td>
                  <Td muted>{o.companyName || '—'}</Td>
                  <Td muted>{o.phone || '—'}</Td>
                  <Td>
                    <Switch checked={!!o.active} onChange={() => toggleActive(o)} disabled={!canUpdate} label={`${o.name} is ${o.active ? 'active' : 'inactive'}`} />
                  </Td>
                  {canDelete && (
                    <Td right>
                      <button
                        type='button'
                        onClick={() => setPendingDelete(o)}
                        aria-label={`Delete ${o.name}`}
                        className='p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'
                      ><HiTrash className='w-4 h-4' aria-hidden='true' /></button>
                    </Td>
                  )}
                </Tr>
              ))}
            </Tbody>
          </Table>
          {filtered.length > 0 && <Pagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} />}
        </div>
      )}

      <Modal
        open={adding}
        onClose={() => { if (!saving) { setAdding(false); setError(''); } }}
        title='Add an owner'
        description='Someone a property belongs to. A phone number already on file will not be added twice.'
        footer={
          <>
            <Button variant='secondary' onClick={() => setAdding(false)} disabled={saving}>Cancel</Button>
            <Button type='submit' form='admin-owner-form' loading={saving} disabled={!form.name.trim()}>Add owner</Button>
          </>
        }
      >
        <form id='admin-owner-form' onSubmit={create} className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
          <Input label='Name' required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className='sm:col-span-2' autoFocus />
          <Input label='Phone' type='tel' value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label='Email' type='email' value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label='Company' value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} className='sm:col-span-2' />
          {error && <p role='alert' className='sm:col-span-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2'>{error}</p>}
        </form>
      </Modal>

      <ConfirmDialog
        open={!!pendingDelete}
        title={`Delete ${pendingDelete?.name || 'this owner'}?`}
        description='Properties they own keep their record but lose this owner. This cannot be undone.'
        confirmLabel='Delete'
        onConfirm={remove}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

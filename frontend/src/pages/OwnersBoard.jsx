/**
 * OwnersBoard — Property Owners management page.
 *
 * Previously this data lived at /contacts in the nav, which caused severe
 * confusion with CRM clients (leads). Property owners are the landlords /
 * sellers whose properties are listed in the system. Renamed to /owners.
 */
import { useEffect, useState, useCallback } from 'react';
import {
  HiPlus, HiPencil, HiTrash, HiPhone, HiMail, HiOfficeBuilding,
  HiRefresh, HiUser,
} from 'react-icons/hi';
import ConfirmDialog from '../components/ConfirmDialog';
import { apiClient } from '../utils/http';
import { useCrmAccess } from '../hooks/useCrmAccess';
import {
  PageHeader, Button, SearchBar, Toolbar, ToolbarDivider,
  Table, Thead, Th, Tbody, Tr, Td,
  Modal, Input, Textarea,
  EmptyState, PageLoader, Badge,
} from '../design-system';

const emptyForm = {
  name: '', email: '', phone: '', companyName: '',
  address1: '', address2: '', city: '', state: '', postal: '', country: '',
  taxId: '', notes: '',
};

export default function OwnersBoard() {
  const { canAccess } = useCrmAccess();

  const [owners, setOwners]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [search, setSearch]         = useState('');
  const [showModal, setShowModal]   = useState(false);
  const [editingOwner, setEditing]  = useState(null);
  const [form, setForm]             = useState(emptyForm);
  const [saving, setSaving]         = useState(false);
  const [formError, setFormError]   = useState('');
  const [pendingDelete, setDel]     = useState(null);

  const fetchOwners = useCallback(async () => {
    if (!canAccess) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.get('/owner/list');
      const data = Array.isArray(res) ? res : res?.data || [];
      setOwners(data);
    } catch (e) {
      setError(e?.message || 'Failed to load owners');
    } finally {
      setLoading(false);
    }
  }, [canAccess]);

  useEffect(() => { fetchOwners(); }, [fetchOwners]);

  const filtered = owners.filter((o) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      o.name?.toLowerCase().includes(q) ||
      o.email?.toLowerCase().includes(q) ||
      o.phone?.toLowerCase().includes(q) ||
      o.companyName?.toLowerCase().includes(q) ||
      o.city?.toLowerCase().includes(q)
    );
  });

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setFormError('');
    setShowModal(true);
  }

  function openEdit(owner) {
    setEditing(owner);
    setForm({
      name:        owner.name || '',
      email:       owner.email || '',
      phone:       owner.phone || '',
      companyName: owner.companyName || '',
      address1:    owner.addressLine1 || '',
      address2:    owner.addressLine2 || '',
      city:        owner.city || '',
      state:       owner.state || '',
      postal:      owner.postalCode || '',
      country:     owner.country || '',
      taxId:       owner.taxId || '',
      notes:       owner.notes || '',
    });
    setFormError('');
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { setFormError('Name is required'); return; }
    setSaving(true);
    setFormError('');
    const payload = {
      name:         form.name,
      email:        form.email,
      phone:        form.phone,
      companyName:  form.companyName,
      addressLine1: form.address1,
      addressLine2: form.address2,
      city:         form.city,
      state:        form.state,
      postalCode:   form.postal,
      country:      form.country,
      taxId:        form.taxId,
      notes:        form.notes,
    };
    try {
      if (editingOwner) {
        await apiClient.post(`/owner/${editingOwner._id}`, payload);
      } else {
        await apiClient.post('/owner', payload);
      }
      setShowModal(false);
      fetchOwners();
    } catch (e) {
      setFormError(e?.message || 'Failed to save owner');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(owner) {
    try {
      await apiClient.delete(`/owner/${owner._id}`);
      fetchOwners();
    } catch (e) {
      setError(e?.message || 'Failed to delete owner');
    } finally {
      setDel(null);
    }
  }

  if (!canAccess) {
    return (
      <EmptyState icon={HiUser} title='Access denied' body='You do not have permission to view property owners.' />
    );
  }

  return (
    <div className='space-y-5'>
      <PageHeader
        title='Property Owners'
        description='Manage the owners of listed properties'
        actions={
          <Button icon={HiPlus} onClick={openCreate}>Add Owner</Button>
        }
      />

      <Toolbar
        left={
          <>
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder='Search by name, email, phone, city…'
              className='w-72'
            />
            <ToolbarDivider />
            <span className='text-xs text-slate-400'>{filtered.length} owner{filtered.length !== 1 ? 's' : ''}</span>
          </>
        }
        right={
          <Button variant='secondary' size='sm' icon={HiRefresh} onClick={fetchOwners}>
            Refresh
          </Button>
        }
      />

      {error && (
        <div className='bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-4 py-3 flex items-center justify-between'>
          {error}
          <button onClick={() => setError('')} className='text-rose-400 hover:text-rose-600 ml-2'>×</button>
        </div>
      )}

      {loading ? (
        <PageLoader />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={HiOfficeBuilding}
          title={search ? 'No owners match your search' : 'No property owners yet'}
          body={search ? 'Try a different search term.' : 'Add your first property owner to get started.'}
          action={!search && <Button icon={HiPlus} onClick={openCreate}>Add First Owner</Button>}
        />
      ) : (
        <Table>
          <Thead>
            <tr>
              <Th>Name</Th>
              <Th>Company</Th>
              <Th>Contact</Th>
              <Th>City</Th>
              <Th>Status</Th>
              <Th right>Actions</Th>
            </tr>
          </Thead>
          <Tbody>
            {filtered.map((owner) => (
              <Tr key={owner._id}>
                <Td>
                  <div className='flex items-center gap-3'>
                    <div className='w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0'>
                      <span className='text-xs font-bold text-slate-500'>
                        {(owner.name || '?').slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <span className='font-medium text-slate-900'>{owner.name}</span>
                  </div>
                </Td>
                <Td muted>{owner.companyName || '—'}</Td>
                <Td>
                  <div className='flex flex-col gap-0.5'>
                    {owner.phone && (
                      <span className='flex items-center gap-1 text-xs text-slate-600'>
                        <HiPhone className='w-3 h-3 text-slate-400' />{owner.phone}
                      </span>
                    )}
                    {owner.email && (
                      <span className='flex items-center gap-1 text-xs text-slate-600'>
                        <HiMail className='w-3 h-3 text-slate-400' />{owner.email}
                      </span>
                    )}
                  </div>
                </Td>
                <Td muted>{owner.city || '—'}</Td>
                <Td>
                  <Badge variant={owner.active === false ? 'default' : 'success'} dot>
                    {owner.active === false ? 'Inactive' : 'Active'}
                  </Badge>
                </Td>
                <Td right>
                  <div className='flex items-center justify-end gap-1'>
                    <Button variant='ghost' size='xs' icon={HiPencil} title='Edit' aria-label='Edit' onClick={() => openEdit(owner)} />
                    <Button variant='ghost' size='xs' icon={HiTrash} title='Delete' aria-label='Delete' onClick={() => setDel(owner)}
                      className='hover:text-rose-600 hover:bg-rose-50' />
                  </div>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      {/* Create / Edit Modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingOwner ? 'Edit Owner' : 'Add Property Owner'}
        size='lg'
        footer={
          <>
            <Button variant='secondary' onClick={() => setShowModal(false)}>Cancel</Button>
            <Button loading={saving} onClick={handleSave}>
              {editingOwner ? 'Save Changes' : 'Add Owner'}
            </Button>
          </>
        }
      >
        <div className='space-y-4'>
          {formError && (
            <div className='bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-3 py-2'>{formError}</div>
          )}

          <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
            <Input
              label='Full Name'
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder='John Smith'
            />
            <Input
              label='Company Name'
              value={form.companyName}
              onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
              placeholder='Acme Realty Ltd.'
            />
            <Input
              label='Email'
              type='email'
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder='owner@example.com'
            />
            <Input
              label='Phone'
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder='+91 98765 43210'
            />
          </div>

          <div className='grid grid-cols-1 sm:grid-cols-3 gap-4'>
            <Input
              label='City'
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              placeholder='Mumbai'
              className='sm:col-span-1'
            />
            <Input
              label='State'
              value={form.state}
              onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
              placeholder='Maharashtra'
            />
            <Input
              label='PIN / Postal'
              value={form.postal}
              onChange={(e) => setForm((f) => ({ ...f, postal: e.target.value }))}
              placeholder='400001'
            />
          </div>

          <Textarea
            label='Notes'
            rows={3}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder='Any additional notes about this owner…'
          />
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!pendingDelete}
        title='Delete Owner'
        message={`Are you sure you want to delete "${pendingDelete?.name}"? This cannot be undone.`}
        confirmLabel='Delete'
        destructive
        onConfirm={() => handleDelete(pendingDelete)}
        onCancel={() => setDel(null)}
      />
    </div>
  );
}

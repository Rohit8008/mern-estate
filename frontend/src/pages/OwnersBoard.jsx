/**
 * OwnersBoard — Property Owners management page.
 *
 * Previously this data lived at /contacts in the nav, which caused severe
 * confusion with CRM clients (leads). Property owners are the landlords /
 * sellers whose properties are listed in the system. Renamed to /owners.
 */
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  HiPlus, HiPencil, HiTrash, HiPhone, HiMail, HiOfficeBuilding,
  HiRefresh, HiUser, HiSearch,
} from 'react-icons/hi';
import ConfirmDialog from '../components/ConfirmDialog';
import BulkActionBar, { BulkButton } from '../components/BulkActionBar';
import { apiClient } from '../utils/http';
import { useCrmAccess } from '../hooks/useCrmAccess';
import { useColumnPrefs } from '../hooks/useColumnPrefs';
import {
  PageHeader, Button, SearchBar, Toolbar, ToolbarDivider,
  Table, Thead, Th, Tbody, Tr, Td, SkeletonRows,
  Modal, Input, Textarea, Checkbox, ColumnToggle, Pagination,
  EmptyState, Badge, useRowSelection,
} from '../design-system';
import { useTranslation } from 'react-i18next';

const emptyForm = {
  name: '', email: '', phone: '', companyName: '',
  address1: '', address2: '', city: '', state: '', postal: '', country: '',
  taxId: '', notes: '',
};

/** How long typing settles before the search goes to the server. */
const SEARCH_DEBOUNCE_MS = 300;

export default function OwnersBoard() {
  const { t } = useTranslation();
  const { canAccess } = useCrmAccess();

  const [owners, setOwners]         = useState([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [search, setSearch]         = useState('');
  const [query, setQuery]           = useState('');
  const [activeFilter, setActive]   = useState('');
  const [sort, setSort]             = useState(null);
  const [page, setPage]             = useState(1);
  const [pageSize, setPageSize]     = useState(20);
  const [showModal, setShowModal]   = useState(false);
  const [editingOwner, setEditing]  = useState(null);
  const [form, setForm]             = useState(emptyForm);
  const [saving, setSaving]         = useState(false);
  const [formError, setFormError]   = useState('');
  const [pendingDelete, setDel]     = useState(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkBusy, setBulkBusy]     = useState(false);

  // Typing settles before it becomes a request, and a new search starts from
  // page 1 — page 4 of a narrower result is usually empty.
  useEffect(() => {
    const id = setTimeout(() => { setQuery(search.trim()); setPage(1); }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [search]);

  // Paged on the server: asking with `page` is what makes /owner/list answer
  // { data, total } instead of the bare array its other callers read.
  const fetchOwners = useCallback(async () => {
    if (!canAccess) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (query) params.set('q', query);
      if (activeFilter) params.set('active', activeFilter);
      if (sort) params.set('sort', `${sort.key}:${sort.dir}`);
      const res = await apiClient.get(`/owner/list?${params}`);
      const data = Array.isArray(res) ? res : res?.data || [];
      setOwners(data);
      setTotal(Array.isArray(res) ? data.length : Number(res?.total) || 0);
    } catch (e) {
      setError(e?.message || 'Failed to load owners');
    } finally {
      setLoading(false);
    }
  }, [canAccess, page, pageSize, query, activeFilter, sort]);

  useEffect(() => { fetchOwners(); }, [fetchOwners]);

  // Deleting the last row of the last page would otherwise leave an empty
  // page with a pager saying there are more.
  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(total / pageSize));
    if (!loading && page > lastPage) setPage(lastPage);
  }, [total, pageSize, page, loading]);

  // Server-side sort: asc → desc → off, the same cycle as useTableSort.
  const toggleSort = (key) => {
    setSort((s) => {
      if (!s || s.key !== key) return { key, dir: 'asc' };
      if (s.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
    setPage(1);
  };

  const columns = useMemo(() => [
    { key: 'name',    label: t('owners.name'), locked: true },
    { key: 'company', label: t('owners.company') },
    { key: 'contact', label: t('owners.contact') },
    { key: 'city',    label: t('owners.city') },
    { key: 'status',  label: t('owners.status') },
  ], [t]);
  const cols = useColumnPrefs('owners', columns);

  const ids = useMemo(() => owners.map((o) => o._id), [owners]);
  const selection = useRowSelection(ids);

  const isFiltered = Boolean(query || activeFilter);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setFormError('');
    setShowModal(true);
  }

  const [searchParams, setSearchParams] = useSearchParams();
  // `?new=1` — the ⌘K palette's "New …" action — opens the create form once,
  // then drops the flag so a reload or Back does not open it again.
  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    openCreate();
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

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

  /**
   * Bulk actions reuse the per-row endpoints — there is no batch route for
   * owners — and run them all even if some fail, then say how many did not
   * go through rather than stopping at the first.
   */
  async function runBulk(action) {
    const targets = [...selection.selected];
    if (targets.length === 0) return;
    setBulkBusy(true);
    setError('');
    const results = await Promise.allSettled(targets.map(action));
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed) setError(t('owners.bulkFailed', { failed, total: targets.length }));
    selection.clear();
    setBulkBusy(false);
    fetchOwners();
  }

  const bulkSetActive = (active) => runBulk((id) => apiClient.post(`/owner/${id}`, { active }));
  const bulkDelete = async () => {
    setBulkDeleteOpen(false);
    await runBulk((id) => apiClient.delete(`/owner/${id}`));
  };

  if (!canAccess) {
    return (
      <EmptyState icon={HiUser} title={t('owners.accessDenied')} body={t('owners.youDoNotHavePermissionTo')} />
    );
  }

  return (
    <div className='space-y-5'>
      <PageHeader
        title={t('owners.propertyOwners')}
        description={t('owners.manageTheOwnersOfListedProperties')}
        actions={
          <Button icon={HiPlus} onClick={openCreate}>{t('owners.addOwner')}</Button>
        }
      />

      <Toolbar
        left={
          <>
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder={t('owners.searchByName')}
              className='w-full sm:w-72'
            />
            <select
              value={activeFilter}
              onChange={(e) => { setActive(e.target.value); setPage(1); }}
              aria-label={t('owners.statusFilter')}
              className='h-9 rounded-lg border border-border bg-card text-foreground text-sm px-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500'
            >
              <option value=''>{t('owners.allStatuses')}</option>
              <option value='true'>{t('owners.activeOnly')}</option>
              <option value='false'>{t('owners.inactiveOnly')}</option>
            </select>
            <ToolbarDivider />
            <span className='text-xs text-muted-foreground tabular-nums' aria-live='polite'>
              {loading ? '' : t('owners.ownerCount', { count: total })}
            </span>
          </>
        }
        right={
          <>
            <ColumnToggle columns={columns} isVisible={cols.isVisible} onToggle={cols.toggle} onReset={cols.reset} />
            <Button variant='secondary' size='sm' icon={HiRefresh} onClick={fetchOwners}>{t('owners.refresh')}</Button>
          </>
        }
      />

      {error && (
        <div className='bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-4 py-3 flex items-center justify-between'>
          {error}
          <button onClick={() => setError('')} className='text-rose-400 hover:text-rose-600 ml-2'>×</button>
        </div>
      )}

      {!loading && owners.length === 0 ? (
        isFiltered ? (
          <EmptyState
            icon={HiSearch}
            title={t('owners.noMatch')}
            body={t('owners.noMatchBody')}
            action={
              <Button variant='secondary' onClick={() => { setSearch(''); setActive(''); }}>
                {t('common.clearAll')}
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={HiOfficeBuilding}
            title={t('owners.noOwnersYet')}
            body={t('owners.noOwnersYetBody')}
            action={<Button icon={HiPlus} onClick={openCreate}>{t('owners.addFirstOwner')}</Button>}
          />
        )
      ) : (
        <div>
          <Table maxHeight='max-h-[calc(100dvh-18rem)]'>
            <Thead sticky>
              <tr>
                <Th className='w-10'>
                  <Checkbox
                    aria-label={t('owners.selectAll')}
                    checked={selection.headerCheckbox.checked}
                    indeterminate={selection.headerCheckbox.indeterminate}
                    onChange={selection.headerCheckbox.onChange}
                    disabled={loading || selection.headerCheckbox.disabled}
                  />
                </Th>
                <Th sortKey='name' sort={sort} onSort={toggleSort}>{t('owners.name')}</Th>
                {cols.isVisible('company') && <Th>{t('owners.company')}</Th>}
                {cols.isVisible('contact') && <Th sortKey='email' sort={sort} onSort={toggleSort}>{t('owners.contact')}</Th>}
                {cols.isVisible('city') && <Th>{t('owners.city')}</Th>}
                {cols.isVisible('status') && <Th>{t('owners.status')}</Th>}
                <Th right>{t('owners.actions')}</Th>
              </tr>
            </Thead>
            <Tbody>
              {loading ? (
                <SkeletonRows rows={Math.min(pageSize, 8)} columns={cols.visibleColumns.length + 2} />
              ) : owners.map((owner) => (
                <Tr key={owner._id} selected={selection.isSelected(owner._id)}>
                  <Td>
                    <Checkbox
                      aria-label={t('owners.selectRow', { name: owner.name })}
                      checked={selection.isSelected(owner._id)}
                      onChange={() => selection.toggle(owner._id)}
                    />
                  </Td>
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
                  {cols.isVisible('company') && <Td muted>{owner.companyName || '—'}</Td>}
                  {cols.isVisible('contact') && (
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
                  )}
                  {cols.isVisible('city') && <Td muted>{owner.city || '—'}</Td>}
                  {cols.isVisible('status') && (
                    <Td>
                      <Badge variant={owner.active === false ? 'default' : 'success'} dot>
                        {owner.active === false ? t('owners.inactive') : t('owners.active')}
                      </Badge>
                    </Td>
                  )}
                  <Td right>
                    <div className='flex items-center justify-end gap-1'>
                      <Button variant='ghost' size='xs' icon={HiPencil} title={t('owners.edit')} aria-label={t('owners.edit')} onClick={() => openEdit(owner)} />
                      <Button variant='ghost' size='xs' icon={HiTrash} title={t('owners.delete')} aria-label={t('owners.delete')} onClick={() => setDel(owner)}
                        className='hover:text-rose-600 hover:bg-rose-50' />
                    </div>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          {total > 0 && (
            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
            />
          )}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingOwner ? 'Edit Owner' : 'Add Property Owner'}
        size='lg'
        footer={
          <>
            <Button variant='secondary' onClick={() => setShowModal(false)}>{t('owners.cancel')}</Button>
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
              label={t('owners.fullName')}
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={t('owners.johnSmith')}
            />
            <Input
              label={t('owners.companyName')}
              value={form.companyName}
              onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
              placeholder={t('owners.acmeRealtyLtd')}
            />
            <Input
              label={t('owners.email')}
              type='email'
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder={t('owners.ownerExampleCom')}
            />
            <Input
              label={t('owners.phone')}
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder='+91 98765 43210'
            />
          </div>

          <div className='grid grid-cols-1 sm:grid-cols-3 gap-4'>
            <Input
              label={t('owners.city')}
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              placeholder={t('owners.mumbai')}
              className='sm:col-span-1'
            />
            <Input
              label={t('owners.state')}
              value={form.state}
              onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
              placeholder={t('owners.maharashtra')}
            />
            <Input
              label={t('owners.pinPostal')}
              value={form.postal}
              onChange={(e) => setForm((f) => ({ ...f, postal: e.target.value }))}
              placeholder='400001'
            />
          </div>

          <Textarea
            label={t('owners.notes')}
            rows={3}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder={t('owners.anyAdditionalNotesAboutThisOwner')}
          />
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!pendingDelete}
        title={t('owners.deleteOwner')}
        description={`Are you sure you want to delete "${pendingDelete?.name}"? This cannot be undone.`}
        confirmLabel={t('owners.delete')}
        onConfirm={() => handleDelete(pendingDelete)}
        onCancel={() => setDel(null)}
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        title={t('owners.bulkDeleteTitle')}
        description={t('owners.bulkDeleteBody', { count: selection.count })}
        confirmLabel={t('owners.delete')}
        onConfirm={bulkDelete}
        onCancel={() => setBulkDeleteOpen(false)}
      />

      <BulkActionBar count={selection.count} onClear={selection.clear}>
        <BulkButton onClick={() => bulkSetActive(true)} disabled={bulkBusy}>{t('owners.bulkActivate')}</BulkButton>
        <BulkButton onClick={() => bulkSetActive(false)} disabled={bulkBusy}>{t('owners.bulkDeactivate')}</BulkButton>
        <BulkButton danger onClick={() => setBulkDeleteOpen(true)} disabled={bulkBusy}>{t('owners.bulkDelete')}</BulkButton>
      </BulkActionBar>
    </div>
  );
}

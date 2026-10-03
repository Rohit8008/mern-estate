import { useMemo, useState } from 'react';
import { HiUserAdd, HiDotsVertical, HiPencil, HiMail, HiBan, HiCheckCircle, HiUsers } from 'react-icons/hi';
import { apiClient } from '../../utils/http';
import {
  Button, Badge, Avatar, SearchBar, Select, Pagination, EmptyState,
  Table, Thead, Th, Tbody, Tr, Td, Dropdown, DropdownItem, useTableSort,
} from '../../design-system';
import { useNotification } from '../../contexts/NotificationContext';
import InviteEmployeeModal from './InviteEmployeeModal';
import UserManageModal from './UserManageModal';
import { ROLE_META, STATUS_META, timeAgo } from './adminFormat';

/**
 * The team: everyone who can sign in to this workspace.
 * Data lives in the Admin shell (the overview counts it too); this owns the
 * filters, the table and the two dialogs.
 */
export default function AdminUsers({ users, setUsers, categories, currentUser, loading, inviteOpen, setInviteOpen }) {
  const { showSuccess, showError } = useNotification();
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  const [pendingOnly, setPendingOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [managing, setManaging] = useState(null);
  const [resendingId, setResendingId] = useState(null);
  const [lastInvite, setLastInvite] = useState(null);

  const pendingCount = users.filter((u) => u.invitePending).length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (role !== 'all' && (u.role || 'buyer') !== role) return false;
      if (status !== 'all' && (u.status || 'active') !== status) return false;
      if (pendingOnly && !u.invitePending) return false;
      if (!q) return true;
      return [u.username, u.email, u.phone].some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [users, query, role, status, pendingOnly]);

  const { sorted, sort, toggle } = useTableSort(filtered, {
    initial: null,
    accessors: { lastLogin: (u) => (u.lastLogin ? new Date(u.lastLogin) : null), createdAt: (u) => new Date(u.createdAt) },
  });
  const paged = sorted.slice((page - 1) * pageSize, page * pageSize);
  const filtersOn = query || role !== 'all' || status !== 'all' || pendingOnly;
  const reset = () => { setQuery(''); setRole('all'); setStatus('all'); setPendingOnly(false); setPage(1); };
  const refine = (set) => (v) => { set(v); setPage(1); };

  const replaceUser = (next) => {
    setUsers((prev) => prev.map((u) => (u._id === next._id ? { ...u, ...next } : u)));
    setManaging((m) => (m && m._id === next._id ? { ...m, ...next } : m));
  };

  const toggleStatus = async (user) => {
    const current = user.status || 'active';
    const next = current === 'active' ? 'inactive' : 'active';
    try {
      const data = await apiClient.post(`/user/admin/toggle-status/${user._id}`, { status: next }, { silent: true });
      if (data?.success) {
        replaceUser({ _id: user._id, status: next });
        showSuccess(next === 'active' ? `${user.username} reactivated` : `${user.username} deactivated`);
      } else {
        showError(data?.message || 'Failed to update user status');
      }
    } catch (err) {
      showError(err?.message || 'Failed to update user status');
    }
  };

  const resendInvite = async (user) => {
    try {
      setResendingId(user._id);
      const data = await apiClient.post(`/user/employee/${user._id}/invite`, {}, { silent: true });
      setLastInvite({ email: user.email, url: data.inviteUrl, sent: Boolean(data.sent) });
      showSuccess(data.sent ? `Invitation sent to ${user.email}` : 'New invite link created');
    } catch (err) {
      showError(err?.message || 'Failed to resend invite');
    } finally {
      setResendingId(null);
    }
  };

  const copyLastInvite = async () => {
    try {
      await navigator.clipboard.writeText(lastInvite.url);
      showSuccess('Invite link copied');
    } catch {
      showError('Copy failed. Select the link and copy it manually.');
    }
  };

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2.5 shadow-sm'>
        <SearchBar value={query} onChange={refine(setQuery)} placeholder='Search name, email or phone…' className='w-full sm:w-72' />
        <Select aria-label='Filter by role' value={role} onChange={(e) => refine(setRole)(e.target.value)} className='w-36'>
          <option value='all'>All roles</option>
          {Object.entries(ROLE_META).map(([value, m]) => <option key={value} value={value}>{m.label}</option>)}
        </Select>
        <Select aria-label='Filter by status' value={status} onChange={(e) => refine(setStatus)(e.target.value)} className='w-36'>
          <option value='all'>All statuses</option>
          {Object.entries(STATUS_META).map(([value, m]) => <option key={value} value={value}>{m.label}</option>)}
        </Select>
        {pendingCount > 0 && (
          <button
            type='button'
            aria-pressed={pendingOnly}
            onClick={() => { setPendingOnly((p) => !p); setPage(1); }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${pendingOnly ? 'bg-amber-100 text-amber-900 border-amber-300' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}
          >Invite pending · {pendingCount}</button>
        )}
        {filtersOn && <button type='button' onClick={reset} className='text-sm text-slate-500 hover:text-slate-800 underline underline-offset-2'>Clear</button>}
        <div className='ml-auto'>
          <Button icon={HiUserAdd} onClick={() => setInviteOpen(true)}>Invite employee</Button>
        </div>
      </div>

      {lastInvite?.url && (
        <div role='status' className='flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm'>
          <span className='text-slate-700'>
            {lastInvite.sent ? `Invitation emailed to ${lastInvite.email}.` : `Email to ${lastInvite.email} could not be sent.`} The link works once.
          </span>
          <input readOnly aria-label='Invite link' value={lastInvite.url} onFocus={(e) => e.target.select()} className='flex-1 min-w-[12rem] border border-slate-300 bg-slate-50 px-3 py-1.5 rounded-lg text-xs font-mono' />
          <Button size='xs' variant='secondary' onClick={copyLastInvite}>Copy</Button>
          <Button size='xs' variant='ghost' onClick={() => setLastInvite(null)}>Dismiss</Button>
        </div>
      )}

      {!loading && filtered.length === 0 ? (
        <div className='bg-white border border-slate-200 rounded-xl shadow-sm'>
          <EmptyState
            icon={HiUsers}
            title={filtersOn ? 'No one matches those filters' : 'No team members yet'}
            body={filtersOn ? 'Try a different search or clear the filters.' : 'Invite your first employee to get started.'}
            action={filtersOn
              ? <Button variant='secondary' onClick={reset}>Clear filters</Button>
              : <Button icon={HiUserAdd} onClick={() => setInviteOpen(true)}>Invite employee</Button>}
          />
        </div>
      ) : (
        <div className='bg-white border border-slate-200 rounded-xl shadow-sm p-3'>
          <Table>
            <Thead>
              <tr>
                <Th sortKey='username' sort={sort} onSort={toggle}>User</Th>
                <Th sortKey='role' sort={sort} onSort={toggle}>Role</Th>
                <Th>Categories</Th>
                <Th sortKey='status' sort={sort} onSort={toggle}>Status</Th>
                <Th sortKey='lastLogin' sort={sort} onSort={toggle}>Last sign-in</Th>
                <Th right><span className='sr-only'>Actions</span></Th>
              </tr>
            </Thead>
            <Tbody>
              {paged.map((u) => {
                const roleMeta = ROLE_META[u.role] || ROLE_META.buyer;
                const st = u.status || 'active';
                const stMeta = STATUS_META[st] || STATUS_META.active;
                const isSelf = String(u._id) === String(currentUser?._id);
                const cats = u.assignedCategories || [];
                return (
                  <Tr key={u._id} onClick={() => setManaging(u)}>
                    <Td>
                      <div className='flex items-center gap-3'>
                        <Avatar name={u.username} src={u.avatar} />
                        <div className='min-w-0'>
                          <div className='font-medium text-slate-900 truncate'>{u.username || 'Unnamed user'}{isSelf && <span className='ml-1.5 text-xs font-normal text-slate-500'>(you)</span>}</div>
                          <div className='text-xs text-slate-500 truncate'>{u.email}</div>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <Badge variant={roleMeta.variant}>{roleMeta.label}</Badge>
                      {u.assignedRole?.name && <div className='text-xs text-slate-500 mt-0.5'>{u.assignedRole.name}</div>}
                    </Td>
                    <Td>
                      {cats.length === 0 ? <span className='text-xs text-slate-400'>All</span> : (
                        <div className='flex flex-wrap gap-1 max-w-[14rem]'>
                          {cats.slice(0, 2).map((c) => <Badge key={c} variant='slate'>{c}</Badge>)}
                          {cats.length > 2 && <Badge variant='default'>+{cats.length - 2}</Badge>}
                        </div>
                      )}
                    </Td>
                    <Td>
                      <div className='flex flex-wrap items-center gap-1.5'>
                        <Badge variant={stMeta.variant} dot>{stMeta.label}</Badge>
                        {u.invitePending && <Badge variant='warning'>Invited</Badge>}
                      </div>
                    </Td>
                    <Td muted>{u.lastLogin ? timeAgo(u.lastLogin) : <span className='text-slate-400'>Never</span>}</Td>
                    <Td right>
                      {/* The row opens the account on click; the menu must not. */}
                      <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} className='inline-block'>
                        <Dropdown
                          label={`Actions for ${u.username}`}
                          trigger={(props) => (
                            <button
                              {...props}
                              aria-label={`Actions for ${u.username}`}
                              className='p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'
                            >
                              <HiDotsVertical className='w-5 h-5' aria-hidden='true' />
                            </button>
                          )}
                        >
                          <DropdownItem icon={HiPencil} onSelect={() => setManaging(u)}>Manage account</DropdownItem>
                          {u.role === 'employee' && u.invitePending && (
                            <DropdownItem icon={HiMail} disabled={resendingId === u._id} onSelect={() => resendInvite(u)}>
                              {resendingId === u._id ? 'Sending…' : 'Resend invite'}
                            </DropdownItem>
                          )}
                          {u.role !== 'admin' && !isSelf && (
                            <DropdownItem
                              icon={st === 'active' ? HiBan : HiCheckCircle}
                              danger={st === 'active'}
                              onSelect={() => toggleStatus(u)}
                            >{st === 'active' ? 'Deactivate' : 'Reactivate'}</DropdownItem>
                          )}
                        </Dropdown>
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
          {filtered.length > 0 && (
            <Pagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} />
          )}
        </div>
      )}

      <InviteEmployeeModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        categories={categories}
        onCreated={(u) => setUsers((prev) => [u, ...prev])}
      />
      <UserManageModal
        user={managing}
        categories={categories}
        currentUser={currentUser}
        onClose={() => setManaging(null)}
        onChanged={replaceUser}
      />
    </div>
  );
}

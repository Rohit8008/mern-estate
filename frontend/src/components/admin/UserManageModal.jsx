import { useEffect, useState } from 'react';
import { HiBan, HiCheckCircle } from 'react-icons/hi';
import { apiClient } from '../../utils/http';
import { Modal, Button, Input, Select, Avatar, Badge } from '../../design-system';
import { useNotification } from '../../contexts/NotificationContext';
import { ROLE_META, STATUS_META, timeAgo } from './adminFormat';

const Fact = ({ label, children }) => (
  <div className='flex items-center justify-between gap-4 py-2 border-b border-slate-100 last:border-0'>
    <dt className='text-sm text-slate-500'>{label}</dt>
    <dd className='text-sm text-slate-900 text-right min-w-0 truncate'>{children}</dd>
  </div>
);

/**
 * One person's account: role, categories, status and (for employees) a password
 * reset. Saves go through the same endpoints the old dialog used; the rules are
 * unchanged — another admin cannot be edited, and an admin's role is fixed.
 */
export default function UserManageModal({ user, categories, currentUser, onClose, onChanged }) {
  const { showSuccess, showError } = useNotification();
  const [role, setRole] = useState('buyer');
  const [cats, setCats] = useState([]);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState('');

  // Reset the form whenever a different person is opened.
  useEffect(() => {
    if (!user) return;
    setRole(user.role || 'buyer');
    setCats([...(user.assignedCategories || [])]);
    setPassword('');
    setConfirm('');
  }, [user?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return null;

  const isAdminUser = user.role === 'admin';
  const isSelf = String(user._id) === String(currentUser?._id);
  const status = user.status || 'active';
  const roleMeta = ROLE_META[user.role] || ROLE_META.buyer;
  const statusMeta = STATUS_META[status] || STATUS_META.active;

  const save = async () => {
    if (isAdminUser && !isSelf) { showError('Cannot modify another admin.'); return; }
    setBusy('save');
    try {
      const nextRole = isAdminUser ? 'admin' : role;
      const data = await apiClient.post(`/user/role/${user._id}`, { role: nextRole, assignedCategories: cats }, { silent: true });
      if (data?._id) {
        onChanged(data);
        showSuccess('Changes saved');
      }
    } catch (err) {
      showError(err?.message || 'Could not save changes');
    } finally {
      setBusy('');
    }
  };

  const toggleStatus = async () => {
    const next = status === 'active' ? 'inactive' : 'active';
    setBusy('status');
    try {
      const data = await apiClient.post(`/user/admin/toggle-status/${user._id}`, { status: next }, { silent: true });
      if (data?.success) {
        onChanged({ ...user, status: next });
        showSuccess(next === 'active' ? 'Account reactivated' : 'Account deactivated');
      } else {
        showError(data?.message || 'Failed to update user status');
      }
    } catch (err) {
      showError(err?.message || 'Failed to update user status');
    } finally {
      setBusy('');
    }
  };

  const resetPassword = async () => {
    if (!password) return;
    if (password !== confirm) { showError('Passwords do not match'); return; }
    setBusy('password');
    try {
      await apiClient.post(`/user/admin/set-employee-password/${user._id}`, { newPassword: password }, { silent: true });
      showSuccess('Password updated');
      setPassword('');
      setConfirm('');
    } catch (err) {
      showError(err?.message || 'Failed to update password');
    } finally {
      setBusy('');
    }
  };

  const toggleCat = (slug) => setCats((c) => (c.includes(slug) ? c.filter((x) => x !== slug) : [...c, slug]));

  return (
    <Modal
      open
      onClose={() => { if (!busy) onClose(); }}
      size='2xl'
      className='!max-w-3xl'
      title={
        <span className='flex items-center gap-3'>
          <Avatar name={user.username} src={user.avatar} size='md' />
          <span className='min-w-0'>
            <span className='block truncate'>{user.username || 'Unnamed user'}</span>
            <span className='block text-sm font-normal text-slate-500 truncate'>{user.email}</span>
          </span>
        </span>
      }
      footer={
        <>
          <Button variant='secondary' onClick={onClose} disabled={!!busy}>Close</Button>
          <Button onClick={save} loading={busy === 'save'} disabled={!!busy || (isAdminUser && !isSelf)}>Save changes</Button>
        </>
      }
    >
      <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
        <section aria-labelledby='um-overview'>
          <h3 id='um-overview' className='text-sm font-semibold text-slate-900 mb-1'>Overview</h3>
          <dl>
            <Fact label='Role'><Badge variant={roleMeta.variant}>{roleMeta.label}</Badge></Fact>
            <Fact label='Status'><Badge variant={statusMeta.variant} dot>{statusMeta.label}</Badge></Fact>
            <Fact label='Phone'>{user.phone || '—'}</Fact>
            <Fact label='Last sign-in'>{user.lastLogin ? timeAgo(user.lastLogin) : 'Never'}</Fact>
            <Fact label='Created'>{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}</Fact>
            <Fact label='User ID'><span className='font-mono text-xs'>{String(user._id).slice(-8)}</span></Fact>
          </dl>
          {!isAdminUser && !isSelf && (
            <div className='mt-4'>
              <Button
                variant='secondary'
                size='sm'
                icon={status === 'active' ? HiBan : HiCheckCircle}
                onClick={toggleStatus}
                loading={busy === 'status'}
                disabled={!!busy}
              >{status === 'active' ? 'Deactivate account' : 'Reactivate account'}</Button>
              {status === 'active' && <p className='mt-1.5 text-xs text-slate-500'>They lose access straight away and cannot sign in until reactivated.</p>}
            </div>
          )}
        </section>

        <section aria-labelledby='um-access' className='space-y-4'>
          <h3 id='um-access' className='text-sm font-semibold text-slate-900'>Access</h3>
          {isAdminUser ? (
            <p className='text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2'>
              Admin roles cannot be changed here.
            </p>
          ) : (
            <Select label='Role' value={role} onChange={(e) => setRole(e.target.value)} disabled={!!busy}>
              <option value='buyer'>Buyer</option>
              <option value='seller'>Seller</option>
              <option value='employee'>Employee</option>
            </Select>
          )}
          {categories.length > 0 && (
            <fieldset disabled={!!busy || (isAdminUser && !isSelf)}>
              <legend className='text-sm font-medium text-slate-700 mb-2'>Assigned categories</legend>
              <div className='flex flex-wrap gap-2'>
                {categories.map((c) => {
                  const on = cats.includes(c.slug);
                  return (
                    <button
                      key={c._id}
                      type='button'
                      aria-pressed={on}
                      onClick={() => toggleCat(c.slug)}
                      className={`px-3 py-1.5 rounded-full text-sm border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50 ${on ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}
                    >{c.name}</button>
                  );
                })}
              </div>
            </fieldset>
          )}
        </section>
      </div>

      {user.role === 'employee' && (
        <section aria-labelledby='um-password' className='mt-6 pt-6 border-t border-slate-100'>
          <h3 id='um-password' className='text-sm font-semibold text-slate-900 mb-3'>Reset password</h3>
          <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
            <Input label='New password' type='password' autoComplete='new-password' value={password} onChange={(e) => setPassword(e.target.value)} disabled={!!busy} />
            <Input label='Confirm password' type='password' autoComplete='new-password' value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={!!busy} error={confirm && password !== confirm ? 'Passwords do not match' : undefined} />
          </div>
          <div className='mt-3 flex justify-end'>
            <Button variant='secondary' size='sm' onClick={resetPassword} loading={busy === 'password'} disabled={!!busy || !password || password !== confirm}>Update password</Button>
          </div>
        </section>
      )}
    </Modal>
  );
}

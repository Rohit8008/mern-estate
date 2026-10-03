import { useState } from 'react';
import { HiClipboardCopy, HiCheckCircle, HiExclamationCircle } from 'react-icons/hi';
import { apiClient } from '../../utils/http';
import { Modal, Button, Input } from '../../design-system';
import { useNotification } from '../../contexts/NotificationContext';

const EMPTY = { username: '', email: '', phone: '', assignedCategories: [] };

/**
 * Invite an employee. There is no password field on purpose: they receive a
 * single-use link and choose their own, so the product never carries a password
 * an admin typed for somebody else.
 *
 * Two steps in one dialog. After the invite is created the form is replaced by
 * the link, because that link is a credential shown exactly once — if email is
 * down, this is the only moment the admin can pass it on.
 */
export default function InviteEmployeeModal({ open, onClose, categories, onCreated }) {
  const { showSuccess, showError } = useNotification();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [invite, setInvite] = useState(null); // { email, url, sent, expiresAt }

  const close = () => {
    setForm(EMPTY);
    setError('');
    setInvite(null);
    onClose();
  };

  const toggleCategory = (slug) =>
    setForm((f) => ({
      ...f,
      assignedCategories: f.assignedCategories.includes(slug)
        ? f.assignedCategories.filter((s) => s !== slug)
        : [...f.assignedCategories, slug],
    }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const data = await apiClient.post('/user/employee', form, { silent: true });
      if (!data?._id) throw new Error(data?.message || 'Could not create the employee.');
      onCreated({ ...data, invitePending: true });
      setInvite({ email: data.email, url: data.inviteUrl, sent: Boolean(data.inviteSent), expiresAt: data.inviteExpiresAt });
    } catch (err) {
      // Said where the admin is looking. This used to be a console.error, so a
      // duplicate email or a bad phone number looked like the button did nothing.
      setError(err?.message || 'Could not create the employee.');
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite.url);
      showSuccess('Invite link copied');
    } catch {
      showError('Copy failed. Select the link and copy it manually.');
    }
  };

  if (invite) {
    return (
      <Modal
        open={open}
        onClose={close}
        title='Invitation created'
        size='lg'
        footer={<Button onClick={close}>Done</Button>}
      >
        <div className='space-y-4'>
          <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${invite.sent ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
            {invite.sent
              ? <HiCheckCircle className='w-5 h-5 mt-0.5 flex-shrink-0 text-emerald-600' aria-hidden='true' />
              : <HiExclamationCircle className='w-5 h-5 mt-0.5 flex-shrink-0 text-amber-600' aria-hidden='true' />}
            <p>
              {invite.sent
                ? <>We emailed an invitation to <strong>{invite.email}</strong>.</>
                : <>The email to <strong>{invite.email}</strong> could not be sent, so share the link below yourself.</>}
            </p>
          </div>
          {invite.url && (
            <div>
              <label htmlFor='invite-link' className='text-sm font-medium text-slate-700'>Invite link</label>
              <div className='mt-1 flex gap-2'>
                <input
                  id='invite-link'
                  readOnly
                  value={invite.url}
                  onFocus={(e) => e.target.select()}
                  className='flex-1 min-w-0 border border-slate-300 bg-slate-50 px-3 py-2 rounded-lg text-xs font-mono text-slate-700'
                />
                <Button variant='secondary' size='sm' icon={HiClipboardCopy} onClick={copy}>Copy</Button>
              </div>
              <p className='mt-2 text-xs text-slate-500'>
                It works once and expires {invite.expiresAt ? `on ${new Date(invite.expiresAt).toLocaleDateString()}` : 'in 7 days'}. Sending a new invite cancels this one. It will not be shown again.
              </p>
            </div>
          )}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title='Invite an employee'
      description='They get a one-time link to set their own password.'
      size='lg'
      footer={
        <>
          <Button variant='secondary' onClick={close} disabled={saving}>Cancel</Button>
          <Button type='submit' form='invite-employee-form' loading={saving} disabled={!form.username.trim() || !form.email.trim()}>Send invite</Button>
        </>
      }
    >
      <form id='invite-employee-form' onSubmit={submit} className='space-y-4'>
        <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
          <Input label='Username' required hint='Letters and numbers only.' autoComplete='off' value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          <Input label='Email' type='email' required autoComplete='off' value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label='Phone (optional)' type='tel' autoComplete='off' value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className='sm:col-span-2' />
        </div>

        {categories.length > 0 && (
          <fieldset>
            <legend className='text-sm font-medium text-slate-700'>Categories they can work on</legend>
            <p className='text-xs text-slate-500 mb-2'>Leave all unticked for no category restriction.</p>
            <div className='flex flex-wrap gap-2'>
              {categories.map((c) => {
                const on = form.assignedCategories.includes(c.slug);
                return (
                  <button
                    key={c._id}
                    type='button'
                    aria-pressed={on}
                    onClick={() => toggleCategory(c.slug)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${on ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}
                  >{c.name}</button>
                );
              })}
            </div>
          </fieldset>
        )}

        {error && <p role='alert' className='text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2'>{error}</p>}
      </form>
    </Modal>
  );
}

import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { HiOutlineClipboardCopy, HiOutlineLockClosed, HiOutlineEye } from 'react-icons/hi';
import { apiClient } from '../utils/http';
import { useNotification } from '../contexts/NotificationContext';
import { formatDate } from '../utils/currency';
import { Modal, Button, Badge, Spinner } from '../design-system';

/**
 * Every share link sent out, with a way to withdraw one.
 *
 * The API could list and revoke links, but nothing in the app called it, so a
 * link sent to the wrong buyer stayed live until it expired. Admins see the
 * workspace's links; everyone else sees their own (the API decides).
 */
export default function ShareLinksDialog({ open, onClose }) {
  const { showSuccess, showError } = useNotification();
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/share', { silent: true });
      setShares(res?.data?.shares || []);
    } catch (err) {
      showError(err?.message || 'Shared links could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const revoke = async (share) => {
    if (!window.confirm('Withdraw this link? Anyone who opens it will see that it has been withdrawn.')) return;
    setBusyId(share.id);
    try {
      await apiClient.post(`/share/${share.id}/revoke`, {});
      showSuccess('Link withdrawn.');
      setShares((prev) => prev.map((s) => (s.id === share.id ? { ...s, isLive: false, revokedAt: new Date().toISOString() } : s)));
    } catch (err) {
      showError(err?.message || 'The link could not be withdrawn.');
    } finally {
      setBusyId(null);
    }
  };

  const copy = async (share) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/s/${share.token}`);
      showSuccess('Link copied.');
    } catch {
      showError('Copy failed. Open the link and copy it from the address bar.');
    }
  };

  const statusOf = (s) => {
    if (s.revokedAt) return { label: 'Withdrawn', variant: 'default' };
    if (!s.isLive) return { label: 'Expired', variant: 'default' };
    return { label: 'Live', variant: 'success' };
  };

  return (
    <Modal open={open} onClose={onClose} title="Shared links" description="Links you have sent to buyers, and who has opened them." size="2xl">
      {loading ? (
        <div className="py-10 flex justify-center"><Spinner /></div>
      ) : shares.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">No links yet. Select properties and press Share to send one.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {shares.map((s) => {
            const st = statusOf(s);
            return (
              <li key={s.id} className="py-3 flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-900 truncate">{s.label || s.recipientName || 'Untitled link'}</span>
                    <Badge variant={st.variant} size="sm">{st.label}</Badge>
                    {s.hasPasscode && (
                      <span className="inline-flex items-center gap-1 text-xs text-slate-500"><HiOutlineLockClosed className="w-3.5 h-3.5" />Passcode</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {s.listingIds.length} propert{s.listingIds.length === 1 ? 'y' : 'ies'}
                    {s.recipientName ? `, for ${s.recipientName}` : ''}
                    {`, sent ${formatDate(s.createdAt)}`}
                    {s.expiresAt && !s.revokedAt ? `, ${s.isLive ? 'expires' : 'expired'} ${formatDate(s.expiresAt)}` : ''}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5 inline-flex items-center gap-1">
                    <HiOutlineEye className="w-3.5 h-3.5" />
                    {s.viewCount ? `Opened ${s.viewCount} time${s.viewCount === 1 ? '' : 's'}, last ${formatDate(s.lastViewedAt)}` : 'Not opened yet'}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {s.isLive && (
                    <Button size="sm" variant="secondary" icon={HiOutlineClipboardCopy} onClick={() => copy(s)}>Copy link</Button>
                  )}
                  {s.isLive && (
                    <Button size="sm" variant="secondary" loading={busyId === s.id} onClick={() => revoke(s)}>Withdraw</Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

ShareLinksDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};

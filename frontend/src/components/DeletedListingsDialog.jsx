import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { apiClient } from '../utils/http';
import { useNotification } from '../contexts/NotificationContext';
import { formatDate, formatListingPrice } from '../utils/currency';
import { Modal, Button, Spinner } from '../design-system';

/**
 * Deleted properties, and a way back. Deleting from the board is a soft
 * delete; this is the only place that shows what was removed.
 */
export default function DeletedListingsDialog({ open, onClose, onRestored }) {
  const { showSuccess, showError } = useNotification();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/listing/deleted', { silent: true });
      setListings(res?.data?.listings || []);
    } catch (err) {
      showError(err?.message || 'Deleted properties could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const restore = async (l) => {
    setBusyId(l._id);
    try {
      await apiClient.post(`/listing/restore/${l._id}`, {});
      setListings((prev) => prev.filter((x) => x._id !== l._id));
      showSuccess(`${l.name} restored.`);
      onRestored?.();
    } catch (err) {
      showError(err?.message || 'That property could not be restored.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Deleted properties" description="Restore a property to put it back on the board." size="2xl">
      {loading ? (
        <div className="py-10 flex justify-center"><Spinner /></div>
      ) : listings.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">Nothing has been deleted.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {listings.map((l) => (
            <li key={l._id} className="py-3 flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900 truncate">{l.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {[l.locality, l.city].filter(Boolean).join(', ') || 'No location'}
                  {`, ${formatListingPrice(l.regularPrice)}`}
                  {l.deletedAt ? `, deleted ${formatDate(l.deletedAt)}` : ''}
                </p>
              </div>
              <Button size="sm" variant="secondary" loading={busyId === l._id} onClick={() => restore(l)}>Restore</Button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

DeletedListingsDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onRestored: PropTypes.func,
};

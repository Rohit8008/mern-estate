import { useState } from 'react';
import { Link } from 'react-router-dom';
import { HiHome } from 'react-icons/hi';
import { apiClient } from '../../utils/http';
import { Button } from '../../design-system';
import ListingPicker from './ListingPicker';

/**
 * The property a deal is about, on the deal card. A deal opened without one can
 * have it linked afterwards — including a deal already won, which then marks the
 * property sold and fixes the sale record. A won deal's property is fixed (the
 * API refuses a swap), so no change button is offered there.
 * PATCH /api/crm/:id/deals/:dealId/listing
 */
export default function DealProperty({ clientId, deal, onSaved }) {
  const property = deal.listingId && typeof deal.listingId === 'object' ? deal.listingId : null;
  const [editing, setEditing] = useState(false);
  const [picked, setPicked] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const locked = deal.stage === 'closed_won' && !!property;

  async function save(listing) {
    setSaving(true);
    setError('');
    try {
      await apiClient.patch(`/crm/${clientId}/deals/${deal._id}/listing`, { listingId: listing ? listing._id : null }, { silent: true });
      setEditing(false);
      setPicked(null);
      await onSaved?.();
    } catch (e) {
      setError(e?.message || 'Could not update the property.');
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="mt-2 space-y-2">
        <ListingPicker value={picked} onChange={setPicked} autoFocus />
        {error && <p role="alert" className="text-xs text-rose-600">{error}</p>}
        <div className="flex gap-2">
          <Button size="xs" onClick={() => save(picked)} loading={saving} disabled={!picked || saving}>Save property</Button>
          <Button size="xs" variant="secondary" onClick={() => { setEditing(false); setPicked(null); setError(''); }} disabled={saving}>Cancel</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 flex items-center gap-2 text-sm">
      <HiHome className="w-4 h-4 text-slate-400 shrink-0" />
      {property ? (
        <Link to={`/listing/${property._id}`} className="hover:underline truncate">
          {property.name}
          {property.city ? <span className="text-slate-500"> · {property.city}</span> : null}
        </Link>
      ) : (
        <span className="text-slate-400 italic">No property linked</span>
      )}
      {!locked && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="ml-auto text-xs text-brand-700 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-500 rounded"
        >
          {property ? 'Change' : 'Link property'}
        </button>
      )}
      {error && <span role="alert" className="text-xs text-rose-600">{error}</span>}
    </div>
  );
}

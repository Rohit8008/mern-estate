import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { HiPlusSm } from 'react-icons/hi';
import { apiClient } from '../../utils/http';
import { Badge, Button, Skeleton } from '../../design-system';
import { formatCompactCurrency } from '../../utils/currency';

const STATUS_VARIANT = { active: 'success', matched: 'brand', closed: 'default', inactive: 'default' };

/**
 * What this client is looking for — the buyer requirements linked to them. A
 * returning client's new need is a new requirement here, beside the deals, not
 * a second client record.
 */
export default function ClientRequirements({ clientId }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    apiClient.get(`/buyer-requirements?clientId=${clientId}`, { silent: true })
      .then((res) => { if (alive) setItems(Array.isArray(res) ? res : res?.data || []); })
      .catch((e) => { if (alive) setError(e?.message || 'Could not load requirements.'); });
    return () => { alive = false; };
  }, [clientId]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Requirements</h3>
        <Link to={`/buyers?new=1&client=${clientId}`}>
          <Button size="xs" variant="secondary" icon={HiPlusSm}>Add requirement</Button>
        </Link>
      </div>
      {error && <p role="alert" className="text-xs text-rose-600">{error}</p>}
      {items === null && !error && <Skeleton className="h-10 w-full" />}
      {items && items.length === 0 && <p className="text-sm text-slate-400 italic">No requirements recorded.</p>}
      <ul className="space-y-2">
        {(items || []).map((r) => (
          <li key={r._id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm flex items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="block truncate font-medium capitalize">
                {r.propertyType === 'rent' ? 'Rent' : 'Buy'} · {r.propertyTypeInterest || 'any'}
                {r.preferredLocation ? ` · ${r.preferredLocation}` : ''}
              </span>
              <span className="block truncate text-xs text-slate-500">
                {r.maxPrice > 0 ? `Up to ${formatCompactCurrency(r.maxPrice)}` : r.budget || 'No budget stated'}
                {r.minBedrooms > 0 ? ` · ${r.minBedrooms}+ bed` : ''}
              </span>
            </span>
            <Badge variant={STATUS_VARIANT[r.status] || 'default'} className="capitalize shrink-0">{r.status}</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { apiClient } from '../utils/http';

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

export default function PropertiesLegacy() {
  const { currentUser } = useSelector((state) => state.user);
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const q = searchParams.get('q') || '';
  const status = searchParams.get('status') || '';

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (q) params.set('searchTerm', q);
    params.set('limit', '50');
    params.set('startIndex', '0');
    return `?${params.toString()}`;
  }, [q, status]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const isEmployee = currentUser?.role === 'employee';
        const endpoint = isEmployee ? `/listing/my-assigned${query}` : `/listing/get${query}`;
        const data = await apiClient.get(endpoint);
        const listings = data?.data?.listings || [];
        if (!mounted) return;
        setItems(Array.isArray(listings) ? listings : []);
      } catch (e) {
        if (!mounted) return;
        setItems([]);
        setError(e?.message || 'Failed to load properties');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [currentUser?.role, query]);

  function setParam(key, value) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  }

  return (
    <div className='max-w-6xl mx-auto p-4 space-y-4'>
      <div className='flex items-center justify-between'>
        <h1 className='text-2xl font-semibold'>Properties</h1>
        <Link to='/create-listing' className='px-4 py-2 bg-slate-900 text-white rounded'>New</Link>
      </div>

      <div className='grid grid-cols-1 md:grid-cols-3 gap-2'>
        <input
          className='border rounded px-3 py-2'
          placeholder='Search'
          value={q}
          onChange={(e) => setParam('q', e.target.value)}
        />
        <select className='border rounded px-3 py-2' value={status} onChange={(e) => setParam('status', e.target.value)}>
          <option value=''>All statuses</option>
          <option value='available'>Available</option>
          <option value='under_negotiation'>Under negotiation</option>
          <option value='sold'>Sold</option>
        </select>
      </div>

      {error && <div className='text-red-600 text-sm'>{error}</div>}
      {loading && <div>Loading...</div>}

      <div className='overflow-x-auto rounded border'>
        <table className='min-w-full text-sm'>
          <thead className='bg-slate-50'>
            <tr>
              <th className='text-left p-2'>Name</th>
              <th className='text-left p-2'>City</th>
              <th className='text-left p-2'>Locality</th>
              <th className='text-left p-2'>Price</th>
              <th className='text-left p-2'>Status</th>
              <th className='text-left p-2'>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((x) => (
              <tr key={x._id} className='border-t'>
                <td className='p-2'>{x.name}</td>
                <td className='p-2'>{x.city || '-'}</td>
                <td className='p-2'>{x.locality || '-'}</td>
                <td className='p-2'>{formatCurrency(x.regularPrice)}</td>
                <td className='p-2'>{x.status || '-'}</td>
                <td className='p-2'>
                  <Link className='text-blue-600 hover:underline' to={`/listing/${x._id}`} target='_blank' rel='noreferrer'>
                    Open
                  </Link>
                </td>
              </tr>
            ))}
            {items.length === 0 && !loading && (
              <tr>
                <td className='p-4 text-center text-slate-500' colSpan={6}>No properties found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

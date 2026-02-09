import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient } from '../utils/http';
import { useBuyerView } from '../contexts/BuyerViewContext';

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

export default function DealsLegacy() {
  const navigate = useNavigate();
  const { currentUser } = useSelector((state) => state.user);
  const { isBuyerViewMode } = useBuyerView();

  const [pipeline, setPipeline] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canAccess = useMemo(() => {
    if (!currentUser) return false;
    if (isBuyerViewMode) return false;
    return currentUser.role === 'admin' || currentUser.role === 'employee';
  }, [currentUser, isBuyerViewMode]);

  useEffect(() => {
    if (!currentUser) return;
    if (!canAccess) navigate('/unauthorized');
  }, [canAccess, currentUser, navigate]);

  useEffect(() => {
    if (!canAccess) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const data = await apiClient.get('/crm/pipeline');
        if (!mounted) return;
        setPipeline(data?.data || []);
      } catch (e) {
        if (!mounted) return;
        setError(e?.message || 'Failed to load pipeline');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [canAccess]);

  if (!canAccess) return null;

  return (
    <div className='max-w-6xl mx-auto p-4 space-y-4'>
      <div className='flex items-center justify-between'>
        <h1 className='text-2xl font-semibold'>Deals</h1>
        <Link className='text-blue-600 hover:underline' to='/clients'>Open Clients</Link>
      </div>

      {error && <div className='text-red-600 text-sm'>{error}</div>}
      {loading && <div>Loading...</div>}

      <div className='overflow-x-auto rounded border'>
        <table className='min-w-full text-sm'>
          <thead className='bg-slate-50'>
            <tr>
              <th className='text-left p-2'>Stage</th>
              <th className='text-left p-2'>Deals</th>
              <th className='text-left p-2'>Total Value</th>
            </tr>
          </thead>
          <tbody>
            {(pipeline || []).map((col) => (
              <tr key={col._id} className='border-t'>
                <td className='p-2'>{col._id}</td>
                <td className='p-2'>{col.count || 0}</td>
                <td className='p-2'>{formatCurrency(col.totalValue || 0)}</td>
              </tr>
            ))}
            {(!pipeline || pipeline.length === 0) && !loading && (
              <tr>
                <td className='p-4 text-center text-slate-500' colSpan={3}>No deals</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

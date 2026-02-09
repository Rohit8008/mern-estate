import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient } from '../utils/http';
import { useBuyerView } from '../contexts/BuyerViewContext';

const STAGES = [
  { id: 'new_lead', label: 'New Lead', header: 'bg-slate-50 text-slate-700 border-slate-200' },
  { id: 'contacted', label: 'Contacted', header: 'bg-blue-50 text-blue-700 border-blue-200' },
  { id: 'qualified', label: 'Qualified', header: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { id: 'site_visit_scheduled', label: 'Site Visit Scheduled', header: 'bg-purple-50 text-purple-700 border-purple-200' },
  { id: 'negotiation', label: 'Negotiation', header: 'bg-amber-50 text-amber-800 border-amber-200' },
  { id: 'booking_token', label: 'Booking / Token', header: 'bg-orange-50 text-orange-800 border-orange-200' },
  { id: 'documentation', label: 'Documentation', header: 'bg-yellow-50 text-yellow-800 border-yellow-200' },
  { id: 'closed_won', label: 'Closed (Won)', header: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  { id: 'closed_lost', label: 'Closed (Lost)', header: 'bg-rose-50 text-rose-800 border-rose-200' },

  // Legacy
  { id: 'initial_contact', label: 'Initial Contact (Legacy)', header: 'bg-slate-50 text-slate-700 border-slate-200' },
  { id: 'site_visit_done', label: 'Site Visit Done (Legacy)', header: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { id: 'payment_pending', label: 'Payment Pending (Legacy)', header: 'bg-orange-50 text-orange-800 border-orange-200' },
];

const stageById = Object.fromEntries(STAGES.map((s) => [s.id, s]));

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

export default function DealsBoard() {
  const navigate = useNavigate();
  const { currentUser } = useSelector((state) => state.user);
  const { isBuyerViewMode } = useBuyerView();

  const [pipeline, setPipeline] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState(false);

  const canAccess = useMemo(() => {
    if (!currentUser) return false;
    if (isBuyerViewMode) return false;
    return currentUser.role === 'admin' || currentUser.role === 'employee';
  }, [currentUser, isBuyerViewMode]);

  useEffect(() => {
    if (!currentUser) return;
    if (!canAccess) {
      navigate('/unauthorized');
    }
  }, [canAccess, currentUser, navigate]);

  async function loadPipeline() {
    setLoading(true);
    setError('');
    try {
      const data = await apiClient.get('/crm/pipeline');
      setPipeline(data?.data || []);
    } catch (e) {
      setError(e?.message || 'Failed to load pipeline');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!canAccess) return;
    loadPipeline();
  }, [canAccess]);

  async function moveDeal({ clientId, dealId, toStage }) {
    setUpdating(true);
    try {
      await apiClient.request(`/crm/${clientId}/deals/${dealId}/stage`, {
        method: 'PATCH',
        body: JSON.stringify({ stage: toStage }),
      });
      await loadPipeline();
    } catch (e) {
      setError(e?.message || 'Failed to update deal stage');
    } finally {
      setUpdating(false);
    }
  }

  const columns = useMemo(() => {
    const map = new Map();
    for (const stage of STAGES) map.set(stage.id, { ...stage, count: 0, totalValue: 0, deals: [] });

    for (const col of pipeline || []) {
      const stageId = col?._id;
      if (!map.has(stageId)) {
        map.set(stageId, {
          id: stageId,
          label: stageId,
          header: 'bg-slate-50 text-slate-700 border-slate-200',
          count: 0,
          totalValue: 0,
          deals: [],
        });
      }
      const existing = map.get(stageId);
      existing.count = col.count || 0;
      existing.totalValue = col.totalValue || 0;
      existing.deals = col.deals || [];
      map.set(stageId, existing);
    }

    return Array.from(map.values());
  }, [pipeline]);

  if (!canAccess) return null;

  return (
    <div className='min-h-screen bg-slate-50'>
      <div className='max-w-[1400px] mx-auto px-4 py-6 space-y-5'>
        <div className='flex flex-col md:flex-row md:items-end md:justify-between gap-3'>
          <div>
            <h1 className='text-2xl md:text-3xl font-bold text-slate-900'>Deals Board</h1>
            <p className='text-slate-600 mt-1'>Pipeline overview by stage (assigned-only)</p>
          </div>

          <div className='flex items-center gap-2'>
            <Link
              to='/clients'
              className='px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-sm font-semibold'
            >
              Open Clients
            </Link>
            <button
              onClick={loadPipeline}
              disabled={loading}
              className='px-4 py-2.5 rounded-xl bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-400 text-sm font-semibold'
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        {error && (
          <div className='bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-4 py-3 text-sm'>
            {error}
          </div>
        )}

        <div className='overflow-x-auto'>
          <div className='min-w-[1100px] grid grid-cols-12 gap-3'>
            {columns.map((col) => (
              <div key={col.id} className='col-span-12 sm:col-span-6 lg:col-span-4 xl:col-span-3'>
                <div className={`rounded-2xl border ${col.header} overflow-hidden`}> 
                  <div className='px-4 py-3 flex items-center justify-between border-b border-inherit'>
                    <div>
                      <div className='font-bold'>{col.label}</div>
                      <div className='text-xs opacity-80 mt-0.5'>
                        {col.count} deal(s) · {formatCurrency(col.totalValue)}
                      </div>
                    </div>
                  </div>

                  <div className='p-3 space-y-3 bg-white'>
                    {(col.deals || []).map((d) => (
                      <div key={d.dealId} className='rounded-xl border border-slate-200 bg-white p-3 shadow-sm'>
                        <div className='flex items-start justify-between gap-3'>
                          <div>
                            <Link
                              to={`/clients/${d.clientId}`}
                              className='font-semibold text-slate-900 hover:underline'
                            >
                              {d.clientName || 'Client'}
                            </Link>
                            <div className='text-sm text-slate-600 mt-0.5'>{formatCurrency(d.value)}</div>
                          </div>

                          <select
                            value={col.id}
                            disabled={updating}
                            onChange={(e) => moveDeal({ clientId: d.clientId, dealId: d.dealId, toStage: e.target.value })}
                            className='text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white'
                            title='Move stage'
                          >
                            {STAGES.map((s) => (
                              <option key={s.id} value={s.id}>
                                {stageById[s.id]?.label || s.id}
                              </option>
                            ))}
                          </select>
                        </div>

                        {d.expectedCloseDate && (
                          <div className='text-xs text-slate-500 mt-2'>
                            Expected: {new Date(d.expectedCloseDate).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    ))}

                    {(!col.deals || col.deals.length === 0) && (
                      <div className='text-sm text-slate-500 px-1 py-2'>No deals</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {updating && (
          <div className='text-sm text-slate-500'>Updating stage…</div>
        )}
      </div>
    </div>
  );
}

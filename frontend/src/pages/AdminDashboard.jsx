import { useEffect, useState } from 'react';
import { apiClient } from '../utils/http';

import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
import AdminStatsGrid from '../components/admin-dashboard/AdminStatsGrid';
import ClientsByStatusCard from '../components/admin-dashboard/ClientsByStatusCard';
import TasksSummaryCard from '../components/admin-dashboard/TasksSummaryCard';
import TopAgentsTableCard from '../components/admin-dashboard/TopAgentsTableCard';

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await apiClient.get('/metrics/admin');
        if (!mounted) return;
        setData(res?.data || res);
      } catch (e) {
        if (!mounted) return;
        setError(e?.message || 'Failed to load metrics');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <div className='max-w-6xl mx-auto p-4 space-y-6'>
        <div className='flex items-center justify-between'>
          <Skeleton className='h-8 w-56' />
        </div>
        <div className='grid md:grid-cols-4 gap-4'>
          <Skeleton className='h-24' />
          <Skeleton className='h-24' />
          <Skeleton className='h-24' />
          <Skeleton className='h-24' />
        </div>
        <div className='grid md:grid-cols-2 gap-4'>
          <Skeleton className='h-44' />
          <Skeleton className='h-44' />
        </div>
        <Skeleton className='h-72' />
      </div>
    );
  }

  if (error) {
    return (
      <div className='max-w-6xl mx-auto p-4'>
        <EmptyState title='Failed to load metrics' description={error} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className='max-w-6xl mx-auto p-4'>
        <EmptyState title='No dashboard data' description='No data was returned from the server.' />
      </div>
    );
  }

  const { totals, clientsByStatus, tasks, topAgents } = data;

  return (
    <div className='max-w-6xl mx-auto p-4 space-y-6'>
      <h1 className='text-2xl font-semibold'>Admin Dashboard</h1>

      <AdminStatsGrid totals={totals} />

      <div className='grid md:grid-cols-2 gap-4'>
        <ClientsByStatusCard clientsByStatus={clientsByStatus} />
        <TasksSummaryCard tasks={tasks} />
      </div>

      <TopAgentsTableCard topAgents={topAgents} />
    </div>
  );
}

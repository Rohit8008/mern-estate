import { useEffect, useState } from 'react';
import { apiClient } from '../utils/http';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import Skeleton from '../components/ui/Skeleton';

export default function TeamDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await apiClient.get('/metrics/me');
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
      <div className='min-h-screen bg-gray-50'>
        <div className='max-w-6xl mx-auto px-4 py-8 space-y-6'>
          <div>
            <Skeleton className='h-8 w-48' />
            <Skeleton className='h-4 w-80 mt-2' />
          </div>
          <div className='grid md:grid-cols-3 gap-4'>
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardContent className='pt-6'>
                  <Skeleton className='h-4 w-24' />
                  <Skeleton className='h-9 w-20 mt-3' />
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader>
              <Skeleton className='h-5 w-52' />
              <Skeleton className='h-4 w-64 mt-2' />
            </CardHeader>
            <CardContent>
              <div className='space-y-2'>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className='flex items-center justify-between'>
                    <Skeleton className='h-4 w-28' />
                    <Skeleton className='h-4 w-10' />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='min-h-screen bg-gray-50'>
        <div className='max-w-6xl mx-auto px-4 py-8'>
          <Card>
            <CardHeader>
              <CardTitle>My Dashboard</CardTitle>
              <CardDescription>We couldn’t load your metrics right now.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className='text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-4'>
                {error}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }
  if (!data) return null;

  const { my, myTasks, myClientsByStatus } = data;

  return (
    <div className='min-h-screen bg-gray-50'>
      <div className='max-w-6xl mx-auto px-4 py-8 space-y-6'>
        <div>
          <h1 className='text-3xl font-bold text-gray-900'>My Dashboard</h1>
          <p className='text-gray-600 mt-1'>A quick snapshot of your work and pipeline.</p>
        </div>

        <div className='grid md:grid-cols-3 gap-4'>
          <MetricCard title='My Clients' value={my.clients} />
          <MetricCard title='My Tasks' value={my.tasks} />
          <MetricCard title='Tasks Due Today' value={myTasks.dueToday} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>My Clients by Status</CardTitle>
            <CardDescription>Distribution of your active clients across stages.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className='text-sm space-y-2'>
              {myClientsByStatus.map((s) => (
                <li key={s.status} className='flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-4 py-3'>
                  <span className='capitalize font-medium text-gray-800'>{s.status}</span>
                  <span className='font-bold text-gray-900'>{s.count}</span>
                </li>
              ))}
              {myClientsByStatus.length === 0 && (
                <li className='text-gray-500'>No data</li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ title, value }) {
  return (
    <Card>
      <CardContent className='pt-6'>
        <div className='text-sm font-semibold text-gray-600'>{title}</div>
        <div className='mt-2 text-3xl font-bold text-gray-900'>{value}</div>
      </CardContent>
    </Card>
  );
}

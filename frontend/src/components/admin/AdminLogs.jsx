import { useCallback, useEffect, useRef, useState } from 'react';
import { HiRefresh, HiShieldCheck } from 'react-icons/hi';
import { apiClient } from '../../utils/http';
import { Button, Badge, SearchBar, Select, Pagination, EmptyState, Skeleton, Table, Thead, Th, Tbody, Tr, Td } from '../../design-system';
import { LOG_STATUS, describeReason, describeUserAgent, timeAgo } from './adminFormat';

const STATUS_TABS = [
  { value: 'all', label: 'All' },
  { value: 'success', label: 'Success' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'invalid', label: 'Invalid' },
];

/** Sign-in activity for the workspace, filtered and paged on the server. */
export default function AdminLogs() {
  const [filters, setFilters] = useState({ status: 'all', method: 'all', email: '', since: '', until: '' });
  const [emailInput, setEmailInput] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const seq = useRef(0);

  // Typing settles before it becomes a request.
  useEffect(() => {
    const id = setTimeout(() => {
      setFilters((f) => (f.email === emailInput.trim() ? f : { ...f, email: emailInput.trim() }));
      setPage(1);
    }, 350);
    return () => clearTimeout(id);
  }, [emailInput]);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: String(pageSize), skip: String((page - 1) * pageSize) });
      if (filters.status !== 'all') params.set('status', filters.status);
      if (filters.method !== 'all') params.set('method', filters.method);
      if (filters.email) params.set('email', filters.email);
      // The date inputs give a day; the API reads a moment. Whole local days, so
      // "to 4 Oct" includes everything that happened on the 4th.
      if (filters.since) params.set('since', new Date(`${filters.since}T00:00:00`).toISOString());
      if (filters.until) params.set('until', new Date(`${filters.until}T23:59:59.999`).toISOString());
      const data = await apiClient.get(`/user/security/logs?${params}`, { silent: true });
      if (mine !== seq.current) return;
      setLogs(Array.isArray(data?.logs) ? data.logs : []);
      setTotal(Number(data?.total) || 0);
    } catch (err) {
      if (mine === seq.current) setError(err?.message || 'Could not load the sign-in log.');
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [filters, page, pageSize]);

  useEffect(() => { load(); }, [load]);

  const set = (patch) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };
  const filtersOn = filters.status !== 'all' || filters.method !== 'all' || filters.email || filters.since || filters.until;
  const reset = () => { setFilters({ status: 'all', method: 'all', email: '', since: '', until: '' }); setEmailInput(''); setPage(1); };

  return (
    <div className='space-y-4'>
      <div className='bg-white border border-slate-200 rounded-xl shadow-sm px-3 py-3 space-y-3'>
        <div className='flex flex-wrap items-center gap-2'>
          <div role='group' aria-label='Filter by outcome' className='flex items-center rounded-lg border border-slate-200 overflow-hidden bg-slate-50'>
            {STATUS_TABS.map((t) => (
              <button
                key={t.value}
                type='button'
                aria-pressed={filters.status === t.value}
                onClick={() => set({ status: t.value })}
                className={`px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 ${filters.status === t.value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >{t.label}</button>
            ))}
          </div>
          <SearchBar value={emailInput} onChange={setEmailInput} placeholder='Filter by email…' className='w-full sm:w-56' />
          <Select aria-label='Filter by method' value={filters.method} onChange={(e) => set({ method: e.target.value })} className='w-36'>
            <option value='all'>All methods</option>
            <option value='password'>Password</option>
            <option value='google'>Google</option>
            <option value='signup'>Sign-up</option>
            <option value='other'>Other</option>
          </Select>
          <label className='flex items-center gap-2 text-sm text-slate-600'>
            <span className='sr-only sm:not-sr-only'>From</span>
            <input type='date' value={filters.since} max={filters.until || undefined} onChange={(e) => set({ since: e.target.value })} className='h-9 rounded-lg border border-slate-300 px-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500' />
          </label>
          <label className='flex items-center gap-2 text-sm text-slate-600'>
            <span className='sr-only sm:not-sr-only'>To</span>
            <input type='date' value={filters.until} min={filters.since || undefined} onChange={(e) => set({ until: e.target.value })} className='h-9 rounded-lg border border-slate-300 px-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500' />
          </label>
          {filtersOn && <button type='button' onClick={reset} className='text-sm text-slate-500 hover:text-slate-800 underline underline-offset-2'>Clear</button>}
          <div className='ml-auto'>
            <Button variant='secondary' size='sm' icon={HiRefresh} onClick={load} className={loading ? '[&>svg]:animate-spin' : ''}>Refresh</Button>
          </div>
        </div>
      </div>

      {error && <p role='alert' className='text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2'>{error}</p>}

      <div className='bg-white border border-slate-200 rounded-xl shadow-sm p-3'>
        {!loading && logs.length === 0 ? (
          <EmptyState
            icon={HiShieldCheck}
            title={filtersOn ? 'No sign-ins match those filters' : 'No sign-in activity yet'}
            body={filtersOn ? 'Widen the dates or clear the filters.' : 'Sign-ins, blocked attempts and sign-ups appear here.'}
            action={filtersOn ? <Button variant='secondary' onClick={reset}>Clear filters</Button> : undefined}
          />
        ) : (
          <>
            <Table>
              <Thead>
                <tr>
                  <Th>When</Th>
                  <Th>Email</Th>
                  <Th>Outcome</Th>
                  <Th>Detail</Th>
                  <Th>Device</Th>
                  <Th>IP address</Th>
                </tr>
              </Thead>
              <Tbody>
                {loading && logs.length === 0
                  ? Array.from({ length: 6 }, (_, i) => (
                      <tr key={i}><td colSpan={6} className='px-4 py-3'><Skeleton className='h-5 w-full' /></td></tr>
                    ))
                  : logs.map((log) => {
                      const meta = LOG_STATUS[log.status] || { label: log.status, variant: 'default' };
                      return (
                        <Tr key={log._id}>
                          <Td><span title={new Date(log.createdAt).toLocaleString()}>{timeAgo(log.createdAt)}</span></Td>
                          <Td className='max-w-[16rem] truncate'><span title={log.email}>{log.email || '—'}</span></Td>
                          <Td>
                            <div className='flex items-center gap-2'>
                              <Badge variant={meta.variant} dot>{meta.label}</Badge>
                              <span className='text-xs text-slate-500 capitalize'>{String(log.method || '').replace(/_/g, ' ')}</span>
                            </div>
                          </Td>
                          <Td muted><span title={log.path || undefined}>{describeReason(log.reason)}</span></Td>
                          <Td muted><span title={log.userAgent || undefined}>{describeUserAgent(log.userAgent)}</span></Td>
                          <Td muted><span className='font-mono text-xs'>{log.ip || '—'}</span></Td>
                        </Tr>
                      );
                    })}
              </Tbody>
            </Table>
            <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} pageSizes={[25, 50, 100]} />
          </>
        )}
      </div>
    </div>
  );
}

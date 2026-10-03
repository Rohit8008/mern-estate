import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { HiPlus, HiDownload, HiUpload, HiPencil, HiCollection } from 'react-icons/hi';
import { apiClient } from '../../utils/http';
import { formatListingPrice, isPlaceholderPrice } from '../../utils/currency';
import { toCsv, downloadTextFile } from '../../utils/spreadsheet';
import { localDateString } from '../../utils/localDate';
import { LISTING_STATUS_LABELS, listingStatusLabel } from '../../utils/listingStatus';
import {
  Button, Badge, SearchBar, Select, Pagination, EmptyState, Skeleton,
  Table, Thead, Th, Tbody, Tr, Td,
} from '../../design-system';
import { useNotification } from '../../contexts/NotificationContext';

const STATUS_VARIANT = { available: 'success', under_negotiation: 'warning', sold: 'default', rented: 'info' };
const EXPORT_LIMIT = 500;

/**
 * Every listing, paged and searched on the server — the old tab showed the 50
 * newest and searched only those, so a workspace with 400 properties could not
 * find number 51. Import goes to the import wizard, which validates each row
 * and reports per-row results; the CSV dialog that lived here did neither.
 */
export default function AdminListings({ canCreate = true }) {
  const { showError, showSuccess } = useNotification();
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const id = setTimeout(() => { setSearch(query.trim()); setPage(1); }, 300);
    return () => clearTimeout(id);
  }, [query]);

  const paramsFor = useCallback((extra = {}) => {
    const p = new URLSearchParams({ order: 'desc', ...extra });
    if (search) p.set('searchTerm', search);
    if (type !== 'all') p.set('type', type);
    if (status !== 'all') p.set('status', status);
    return p;
  }, [search, type, status]);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.get(`/listing/get?${paramsFor({ limit: String(pageSize), startIndex: String((page - 1) * pageSize) })}`, { silent: true });
      if (mine !== seq.current) return;
      setRows(Array.isArray(res?.data?.listings) ? res.data.listings : []);
      setTotal(Number(res?.data?.pagination?.total) || 0);
    } catch (err) {
      if (mine === seq.current) setError(err?.message || 'Could not load listings.');
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [paramsFor, page, pageSize]);

  useEffect(() => { load(); }, [load]);

  // Refresh when a listing is created, edited or deleted elsewhere in the app.
  useEffect(() => {
    const events = ['listing-created', 'listing-updated', 'listing-deleted'];
    events.forEach((e) => window.addEventListener(e, load));
    return () => events.forEach((e) => window.removeEventListener(e, load));
  }, [load]);

  /** The filtered set, not the page on screen. CSV formula-injection is handled by toCsv. */
  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await apiClient.get(`/listing/get?${paramsFor({ limit: String(EXPORT_LIMIT), startIndex: '0' })}`, { silent: true });
      const list = res?.data?.listings || [];
      if (!list.length) { showError('No listings to export.'); return; }
      const grid = [
        ['ID', 'Name', 'Address', 'City', 'State', 'Pincode', 'Category', 'Property Type', 'Type', 'Status', 'Price', 'Discount Price', 'Offer', 'Bedrooms', 'Bathrooms', 'Parking', 'Furnished', 'Created At'],
        ...list.map((l) => [
          l._id, l.name || '', l.address || '', l.city || '', l.state || '', l.pincode || '', l.category || '',
          l.propertyType || '', l.type || '', l.status || 'available', l.regularPrice || 0, l.discountPrice || 0,
          l.offer ? 'Yes' : 'No', l.bedrooms || 0, l.bathrooms || 0, l.parking ? 'Yes' : 'No', l.furnished ? 'Yes' : 'No',
          l.createdAt ? new Date(l.createdAt).toISOString().slice(0, 10) : '',
        ]),
      ];
      downloadTextFile(`listings-${localDateString()}.csv`, toCsv(grid));
      showSuccess(total > EXPORT_LIMIT ? `Exported the first ${EXPORT_LIMIT} of ${total} listings.` : `Exported ${list.length} listing${list.length === 1 ? '' : 's'}.`);
    } catch (err) {
      showError(err?.message || 'Export failed.');
    } finally {
      setExporting(false);
    }
  };

  const filtersOn = !!search || type !== 'all' || status !== 'all';
  const reset = () => { setQuery(''); setSearch(''); setType('all'); setStatus('all'); setPage(1); };

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2.5 shadow-sm'>
        <SearchBar value={query} onChange={setQuery} placeholder='Search name, area or ID…' className='w-full sm:w-72' />
        <Select aria-label='Filter by type' value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} className='w-32'>
          <option value='all'>Sale &amp; rent</option>
          <option value='sale'>For sale</option>
          <option value='rent'>For rent</option>
        </Select>
        <Select aria-label='Filter by status' value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className='w-44'>
          <option value='all'>All statuses</option>
          {Object.entries(LISTING_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        {filtersOn && <button type='button' onClick={reset} className='text-sm text-slate-500 hover:text-slate-800 underline underline-offset-2'>Clear</button>}
        <div className='ml-auto flex items-center gap-2'>
          <Button variant='secondary' size='sm' icon={HiDownload} onClick={exportCsv} loading={exporting}>Export</Button>
          <Button as={Link} to='/admin/import' variant='secondary' size='sm' icon={HiUpload}>Import</Button>
          {canCreate && <Button as={Link} to='/create-listing' size='sm' icon={HiPlus}>Add property</Button>}
        </div>
      </div>

      {error && <p role='alert' className='text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2'>{error}</p>}

      <div className='bg-white border border-slate-200 rounded-xl shadow-sm p-3'>
        {!loading && rows.length === 0 ? (
          <EmptyState
            icon={HiCollection}
            title={filtersOn ? 'No listings match those filters' : 'No listings yet'}
            body={filtersOn ? 'Try a different search or clear the filters.' : 'Add your first property, or import a spreadsheet.'}
            action={filtersOn
              ? <Button variant='secondary' onClick={reset}>Clear filters</Button>
              : <Button as={Link} to='/create-listing' icon={HiPlus}>Add property</Button>}
          />
        ) : (
          <>
            <Table>
              <Thead>
                <tr>
                  <Th>Property</Th>
                  <Th>Category</Th>
                  <Th>Type</Th>
                  <Th>Status</Th>
                  <Th right>Price</Th>
                  <Th>Added</Th>
                  <Th right><span className='sr-only'>Actions</span></Th>
                </tr>
              </Thead>
              <Tbody>
                {loading && rows.length === 0
                  ? Array.from({ length: 5 }, (_, i) => <tr key={i}><td colSpan={7} className='px-4 py-3'><Skeleton className='h-5 w-full' /></td></tr>)
                  : rows.map((l) => {
                      const price = (l.offer && l.discountPrice) ? l.discountPrice : l.regularPrice;
                      const st = l.status || 'available';
                      return (
                        <Tr key={l._id}>
                          <Td>
                            <Link to={`/listing/${l._id}`} className='font-medium text-slate-900 hover:underline'>{l.name}</Link>
                            <div className='text-xs text-slate-500 truncate max-w-[22rem]'>{[l.address, l.city].filter(Boolean).join(', ')}</div>
                          </Td>
                          <Td muted>{l.category || '—'}</Td>
                          <Td><Badge variant={l.type === 'rent' ? 'info' : 'purple'}>{l.type === 'rent' ? 'Rent' : 'Sale'}</Badge></Td>
                          <Td><Badge variant={STATUS_VARIANT[st] || 'default'} dot>{listingStatusLabel(st)}</Badge></Td>
                          <Td right>
                            <span className='tabular-nums'>{formatListingPrice(price)}</span>
                            {l.type === 'rent' && !isPlaceholderPrice(price) && <span className='text-xs text-slate-500'> /mo</span>}
                            {l.offer && <div><Badge variant='success' size='xs'>Offer</Badge></div>}
                          </Td>
                          <Td muted>{l.createdAt ? new Date(l.createdAt).toLocaleDateString() : '—'}</Td>
                          <Td right>
                            <Link
                              to={`/update-listing/${l._id}`}
                              aria-label={`Edit ${l.name}`}
                              className='inline-flex p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'
                            >
                              <HiPencil className='w-4 h-4' aria-hidden='true' />
                            </Link>
                          </Td>
                        </Tr>
                      );
                    })}
              </Tbody>
            </Table>
            <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} />
          </>
        )}
      </div>
    </div>
  );
}

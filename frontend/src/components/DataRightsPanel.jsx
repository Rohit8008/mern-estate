import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { HiOutlineDownload, HiOutlineExclamation, HiOutlineSearch, HiOutlineShieldCheck, HiOutlineTrash } from 'react-icons/hi';
import { apiClient } from '../utils/http';
import { useNotification } from '../contexts/NotificationContext';
import { Button, Input, Modal, EmptyState, Select } from '../design-system';

/**
 * Data subject requests: hand someone the copy of what the workspace holds
 * about them, or erase it.
 *
 * Export is reversible and logged; erasure is neither, so it sits behind a
 * dialog that spells out what goes and what stays, and will not enable its
 * button until the person's name is typed back exactly. The backend stays the
 * authority (admin only, cannot erase yourself or a platform operator).
 */

const KINDS = {
  user: {
    label: 'Team member',
    keeps: 'Their account is closed and personal details replaced. Records they created stay, attributed to "Former team member".',
  },
  client: {
    label: 'Lead / client',
    keeps: 'Name, phone, email, notes and communications are removed. An anonymous shell stays so pipeline totals remain correct.',
  },
  owner: {
    label: 'Property owner',
    keeps: 'Name, contact, address, tax id and notes are removed. An anonymous shell stays so linked properties remain intact.',
  },
  buyer: {
    label: 'Buyer requirement',
    keeps: 'Name, phone, email and notes are removed. An anonymous shell stays so matching and report totals remain correct.',
  },
};

const rowOf = {
  user: (u) => ({ id: u._id, name: u.username || u.email, detail: u.email }),
  client: (c) => ({ id: c._id, name: c.name, detail: c.phone || c.email || '' }),
  owner: (o) => ({ id: o._id, name: o.name, detail: o.phone || o.email || '' }),
  buyer: (b) => ({ id: b._id, name: b.buyerName, detail: b.buyerPhone || b.buyerEmail || '' }),
};

async function fetchSubjects(kind, q) {
  const enc = encodeURIComponent(q);
  if (kind === 'user') {
    const res = await apiClient.get('/user/list', { silent: true });
    const list = Array.isArray(res) ? res : res?.data || [];
    const needle = q.toLowerCase();
    return list
      .filter((u) => !needle || `${u.username} ${u.email}`.toLowerCase().includes(needle))
      .slice(0, 20);
  }
  if (kind === 'client') {
    const res = await apiClient.get(`/clients?q=${enc}&limit=20`, { silent: true });
    return res?.data || [];
  }
  if (kind === 'owner') {
    const res = await apiClient.get(`/owner/list?q=${enc}`, { silent: true });
    return (Array.isArray(res) ? res : res?.data || []).slice(0, 20);
  }
  const res = await apiClient.get('/buyer-requirements?page=1&limit=100', { silent: true });
  const needle = q.toLowerCase();
  return (res?.data || [])
    .filter((b) => !needle || `${b.buyerName} ${b.buyerPhone || ''}`.toLowerCase().includes(needle))
    .slice(0, 20);
}

const exportUrl = (kind, id) => (kind === 'user' ? `/data-rights/export/user/${id}` : `/data-rights/export/${kind}/${id}`);
const eraseUrl = (kind, id) => (kind === 'user' ? `/data-rights/erase/user/${id}` : `/data-rights/erase/${kind}/${id}`);

export default function DataRightsPanel() {
  const { showSuccess, showError } = useNotification();
  const { currentUser } = useSelector((s) => s.user);

  const [kind, setKind] = useState('client');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [target, setTarget] = useState(null);
  const [typed, setTyped] = useState('');
  const [erasing, setErasing] = useState(false);

  const load = useCallback(() => {
    let cancelled = false;
    setRows(null);
    setError('');
    const handle = setTimeout(() => {
      fetchSubjects(kind, query.trim())
        .then((list) => { if (!cancelled) setRows(list.map(rowOf[kind]).filter((r) => r.id)); })
        .catch((e) => { if (!cancelled) { setRows([]); setError(e?.message || 'Could not load the list.'); } });
    }, query ? 300 : 0);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [kind, query]);

  useEffect(load, [load]);

  const doExport = async (row) => {
    setBusyId(row.id);
    try {
      const data = await apiClient.get(exportUrl(kind, row.id));
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${kind}-export-${row.id}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showSuccess(`Exported the data held about ${row.name}.`);
    } catch (e) {
      showError(e?.message || 'Could not export that record.');
    } finally {
      setBusyId('');
    }
  };

  const closeErase = () => { if (!erasing) { setTarget(null); setTyped(''); } };

  const doErase = async () => {
    if (!target) return;
    setErasing(true);
    try {
      await apiClient.delete(eraseUrl(target.kind, target.row.id));
      showSuccess('Personal details erased.');
      setRows((prev) => (prev || []).filter((r) => r.id !== target.row.id));
      setTarget(null);
      setTyped('');
    } catch (e) {
      showError(e?.message || 'Could not erase that record.');
    } finally {
      setErasing(false);
    }
  };

  const nameMatches = target && typed.trim() === String(target.row.name || '').trim();
  const isSelf = (row) => kind === 'user' && String(row.id) === String(currentUser?._id);
  const kindOptions = useMemo(() => Object.entries(KINDS).map(([value, k]) => ({ value, label: k.label })), []);

  return (
    <div className='bg-white rounded-xl border border-slate-200 p-5'>
      <div className='flex items-center gap-3 mb-4'>
        <div className='w-9 h-9 rounded-xl bg-slate-100 ring-1 ring-slate-200 flex items-center justify-center flex-shrink-0'>
          <HiOutlineShieldCheck className='w-5 h-5 text-slate-600' />
        </div>
        <div>
          <h2 className='text-base font-semibold text-slate-900'>Data requests</h2>
          <p className='text-xs text-slate-500'>Export everything held about a person, or erase their personal details when they ask.</p>
        </div>
      </div>

      <div className='flex flex-col sm:flex-row gap-3 mb-4'>
        <div className='sm:w-52'>
          <Select
            label='Who is it about'
            value={kind}
            onChange={(e) => { setKind(e.target.value); setQuery(''); }}
          >
            {kindOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </div>
        <div className='flex-1 relative'>
          <Input
            label='Find them'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Name, phone or email'
          />
        </div>
      </div>

      {rows === null ? (
        <p className='text-sm text-slate-400 py-4' aria-busy='true'>Loading&hellip;</p>
      ) : error ? (
        <p className='text-sm text-rose-600 py-4' role='alert'>{error}</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={HiOutlineSearch} title='Nobody found' body={query ? `Nothing matches "${query}".` : 'There are no records of this kind yet.'} />
      ) : (
        <ul className='divide-y divide-slate-100 border border-slate-200 rounded-lg'>
          {rows.map((row) => (
            <li key={row.id} className='flex items-center gap-3 px-3 py-2.5 flex-wrap sm:flex-nowrap'>
              <div className='min-w-0 flex-1'>
                <p className='text-sm font-medium text-slate-800 truncate'>{row.name}</p>
                {row.detail && <p className='text-xs text-slate-500 truncate'>{row.detail}</p>}
              </div>
              <div className='flex items-center gap-2 flex-shrink-0'>
                <Button variant='secondary' icon={HiOutlineDownload} loading={busyId === row.id} onClick={() => doExport(row)}>Export</Button>
                <Button
                  variant='danger'
                  icon={HiOutlineTrash}
                  disabled={isSelf(row)}
                  title={isSelf(row) ? 'Ask another admin to erase your own account' : undefined}
                  onClick={() => { setTyped(''); setTarget({ kind, row }); }}
                >
                  Erase
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal open={Boolean(target)} onClose={closeErase} title='Erase personal details?'>
        {target && (
          <div className='space-y-4'>
            <div className='flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3'>
              <HiOutlineExclamation className='w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5' aria-hidden='true' />
              <p className='text-sm text-rose-900'>
                This cannot be undone. {KINDS[target.kind].keeps}
              </p>
            </div>
            <p className='text-sm text-slate-600'>
              Consider exporting their data first. To confirm, type <strong className='text-slate-900'>{target.row.name}</strong> below.
            </p>
            <Input
              label='Type the name to confirm'
              value={typed}
              autoFocus
              autoComplete='off'
              onChange={(e) => setTyped(e.target.value)}
            />
            <div className='flex justify-end gap-2'>
              <Button variant='secondary' onClick={closeErase} disabled={erasing}>Cancel</Button>
              <Button variant='danger' icon={HiOutlineTrash} loading={erasing} disabled={!nameMatches} onClick={doErase}>
                Erase permanently
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

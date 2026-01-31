import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { fetchWithRefresh, handleApiResponse } from '../utils/http';
import { HiOutlineViewGrid, HiOutlineCollection, HiOutlineTag, HiOutlineUserGroup, HiOutlineClipboardList, HiOutlineShieldCheck, HiOutlinePlus, HiOutlineSearch, HiOutlineDownload, HiOutlineKey } from 'react-icons/hi';
import { useBuyerView } from '../contexts/BuyerViewContext';
import { useSelector } from 'react-redux';
import RoleManagement from '../components/RoleManagement';

export default function Admin() {
  const { currentUser } = useSelector((state) => state.user);
  const { isBuyerViewMode } = useBuyerView();
  const [users, setUsers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', email: '', password: '', assignedCategories: [] });
  const [newCategoryName, setNewCategoryName] = useState('');
  const [logs, setLogs] = useState([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logFilters, setLogFilters] = useState({ method: 'all', status: 'all', email: '', since: '', until: '' });
  const [logPage, setLogPage] = useState(0);
  const [onlyPhoneChanges, setOnlyPhoneChanges] = useState(false);
  const [usersQuery, setUsersQuery] = useState('');
  const pageSize = 50;
  // Owners management
  const [owners, setOwners] = useState([]);
  const [ownersQuery, setOwnersQuery] = useState('');
  const [ownersLoading, setOwnersLoading] = useState(false);
  const [newOwner, setNewOwner] = useState({ name: '', email: '', phone: '', companyName: '' });
  // Listings overview (dashboard-like)
  const [listings, setListings] = useState([]);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [listSearch, setListSearch] = useState('');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [editingUser, setEditingUser] = useState(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const totalOwners = owners.length;
  const totalUsers = users.length;
  const totalListings = listings.length;

  // Role-based access control
  const isAdmin = currentUser?.role === 'admin';
  const isEmployee = currentUser?.role === 'employee';

  // Redirect if in buyer view mode
  if (isBuyerViewMode) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Access Restricted</h1>
          <p className="text-gray-600 mb-6">Admin features are not available in buyer view mode.</p>
          <p className="text-sm text-gray-500">Exit buyer view mode to access admin features.</p>
        </div>
      </div>
    );
  }

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        setOwnersLoading(true);
        const [uRes, cRes, lRes, oRes, lsRes] = await Promise.all([
          fetch('/api/user/list', { credentials: 'include' }),
          fetch('/api/category/list'),
          fetch(`/api/user/security/logs?limit=${pageSize}&skip=${logPage*pageSize}`, { credentials: 'include' }),
          fetch('/api/owner/list', { credentials: 'include' }),
          fetch('/api/listing/get?limit=50&order=desc', { credentials: 'include' }),
        ]);
        const [uData, cData, lText, oText, lsText] = await Promise.all([uRes.text(), cRes.text(), lRes.text(), oRes.text(), lsRes.text()]);
        const uJson = uData ? JSON.parse(uData) : [];
        const cJson = cData ? JSON.parse(cData) : [];
        const lJson = lText ? JSON.parse(lText) : { logs: [], total: 0 };
        const oJson = oText ? JSON.parse(oText) : [];
        const lsJson = lsText ? JSON.parse(lsText) : { success: true, data: { listings: [] } };
        setUsers(uJson || []);
        setCategories(cJson || []);
        setLogs(Array.isArray(lJson.logs) ? lJson.logs : []);
        setLogsTotal(Number(lJson.total) || 0);
        setOwners(Array.isArray(oJson) ? oJson : []);
        setListings(Array.isArray(lsJson?.data?.listings) ? lsJson.data.listings : []);
      } catch (_) {}
      setLoading(false);
      setOwnersLoading(false);
    };
    load();
  }, [logPage]);

  // Realtime owners refresh when admin updates owners
  useEffect(() => {
    const socket = io('http://localhost:3000', {
      withCredentials: true,
      transports: ['websocket'],
    });
    const handleOwnersChanged = async () => {
      try {
        const oRes = await fetch('/api/owner/list', { credentials: 'include' });
        const oText = await oRes.text();
        const oJson = oText ? JSON.parse(oText) : [];
        setOwners(Array.isArray(oJson) ? oJson : []);
      } catch (_) {}
    };
    socket.on('owners:changed', handleOwnersChanged);
    return () => {
      socket.off('owners:changed', handleOwnersChanged);
      socket.close();
    };
  }, []);

  const updateUser = async (id, role, assignedCategories) => {
    try {
      setSaving(true);
      const res = await fetch(`/api/user/role/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role, assignedCategories }),
      });
      const data = await res.json();
      if (data && data._id) {
        setUsers((prev) => prev.map((u) => (u._id === id ? data : u)));
      }
    } catch (_) {}
    setSaving(false);
  };

  const createOwner = async () => {
    if (!newOwner.name.trim()) return;
    try {
      setCreating(true);
      const res = await fetchWithRefresh('/api/owner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(newOwner),
      });
      const data = await handleApiResponse(res);
      if (data && data._id) {
        setOwners((prev) => [data, ...prev]);
        setNewOwner({ name: '', email: '', phone: '', companyName: '' });
      }
    } catch (_) {}
  };

  const deleteOwnerById = async (id) => {
    try {
      const res = await fetch(`/api/owner/${id}`, { method: 'DELETE', credentials: 'include' });
      const data = await res.json();
      if (data && data.success) setOwners((prev) => prev.filter((o) => o._id !== id));
    } catch (_) {}
  };

  const toggleOwnerActive = async (owner) => {
    try {
      const res = await fetch(`/api/owner/${owner._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ active: !owner.active }),
      });
      const data = await res.json();
      if (data && data._id) setOwners((prev) => prev.map((o) => (o._id === data._id ? data : o)));
    } catch (_) {}
  };

  const deleteUser = async (userId) => {
    try {
      const res = await fetch(`/api/user/${userId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (data && data.success) {
        setUsers((prev) => prev.filter((u) => u._id !== userId));
      }
    } catch (_) {}
  };

  const openCategoryModal = (user) => {
    setEditingUser(user);
    setSelectedCategories([...(user.assignedCategories || [])]);
    setShowCategoryModal(true);
  };

  const closeCategoryModal = () => {
    setEditingUser(null);
    setSelectedCategories([]);
    setShowCategoryModal(false);
  };

  const handleCategoryToggle = (categorySlug) => {
    setSelectedCategories(prev => {
      if (prev.includes(categorySlug)) {
        return prev.filter(cat => cat !== categorySlug);
      } else {
        return [...prev, categorySlug];
      }
    });
  };

  const saveCategoryAssignment = async () => {
    if (!editingUser) return;
    
    try {
      setSaving(true);
      await updateUser(editingUser._id, editingUser.role, selectedCategories);
      closeCategoryModal();
    } catch (error) {
      console.error('Error updating categories:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className='max-w-7xl mx-auto px-4 py-6'>
      <div className='grid grid-cols-[220px_1fr] gap-6'>
        <aside className='bg-white rounded-xl shadow border p-3 sticky top-6 h-fit'>
          <div className='px-2 py-3'>
            <div className='text-xs uppercase tracking-wide text-slate-500'>{isAdmin ? 'Admin' : 'Employee'}</div>
            <div className='text-sm font-semibold text-slate-800'>Control Center</div>
          </div>
          <nav className='flex flex-col'>
            <button onClick={() => setActiveTab('dashboard')} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-slate-50 ${activeTab==='dashboard'?'bg-slate-100 text-slate-900':'text-slate-700'}`}><HiOutlineViewGrid /> Dashboard</button>
            <button onClick={() => setActiveTab('listings')} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-slate-50 ${activeTab==='listings'?'bg-slate-100 text-slate-900':'text-slate-700'}`}><HiOutlineCollection /> Listings</button>
            <button onClick={() => setActiveTab('categories')} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-slate-50 ${activeTab==='categories'?'bg-slate-100 text-slate-900':'text-slate-700'}`}><HiOutlineTag /> Categories</button>
            <button onClick={() => setActiveTab('owners')} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-slate-50 ${activeTab==='owners'?'bg-slate-100 text-slate-900':'text-slate-700'}`}><HiOutlineUserGroup /> Owners</button>
            {isAdmin && (
              <button onClick={() => setActiveTab('users')} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-slate-50 ${activeTab==='users'?'bg-slate-100 text-slate-900':'text-slate-700'}`}><HiOutlineClipboardList /> Users</button>
            )}
            {isAdmin && (
              <button onClick={() => setActiveTab('roles')} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-slate-50 ${activeTab==='roles'?'bg-slate-100 text-slate-900':'text-slate-700'}`}><HiOutlineKey /> Roles & Permissions</button>
            )}
            {isAdmin && (
              <button onClick={() => setActiveTab('logs')} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-slate-50 ${activeTab==='logs'?'bg-slate-100 text-slate-900':'text-slate-700'}`}><HiOutlineShieldCheck /> Security Logs</button>
            )}
          </nav>
        </aside>
        <section className='space-y-8'>
          {activeTab === 'dashboard' && (
            <>
              <div className='flex items-center justify-between'>
                <h1 className='text-2xl font-bold text-slate-800'>{isAdmin ? 'Admin Dashboard' : 'Employee Dashboard'}</h1>
                <div className='flex items-center gap-2'>
                  <a href='/create-listing' className='inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 text-white text-sm hover:opacity-95'><HiOutlinePlus /> New Listing</a>
                </div>
              </div>
              <div className='grid grid-cols-1 sm:grid-cols-3 gap-4'>
                <div className='bg-white rounded-xl shadow p-4 border'>
                  <div className='text-xs text-slate-500'>Listings</div>
                  <div className='text-2xl font-semibold text-slate-800 mt-1'>{totalListings}</div>
                  <div className='text-xs text-slate-400 mt-1'>Active items</div>
                </div>
                <div className='bg-white rounded-xl shadow p-4 border'>
                  <div className='text-xs text-slate-500'>Owners</div>
                  <div className='text-2xl font-semibold text-slate-800 mt-1'>{totalOwners}</div>
                  <div className='text-xs text-slate-400 mt-1'>Registered partners</div>
                </div>
                <div className='bg-white rounded-xl shadow p-4 border'>
                  <div className='text-xs text-slate-500'>Users</div>
                  <div className='text-2xl font-semibold text-slate-800 mt-1'>{totalUsers}</div>
                  <div className='text-xs text-slate-400 mt-1'>Accounts</div>
                </div>
              </div>
            </>
          )}
      {/* Consolidated budget (visual placeholder) */}
      {activeTab === 'dashboard' && (
      <section className='bg-white rounded-xl shadow p-5'>
        <div className='flex items-center justify-between mb-3'>
          <div>
            <h2 className='text-xl font-semibold'>Consolidated budget</h2>
            <div className='text-xs text-slate-500'>Revenues vs Expenditures</div>
          </div>
          <div className='flex gap-4 text-sm'>
            <div className='flex items-center gap-2'><span className='inline-block w-3 h-3 rounded-full bg-sky-500'></span>Sales</div>
            <div className='flex items-center gap-2'><span className='inline-block w-3 h-3 rounded-full bg-red-400'></span>Costs</div>
          </div>
        </div>
        <div className='relative h-40 w-full rounded-lg bg-gradient-to-br from-slate-50 to-white border overflow-hidden'>
          <svg viewBox='0 0 600 160' className='absolute inset-0 w-full h-full'>
            <polyline fill='none' stroke='rgba(59,130,246,0.9)' strokeWidth='2'
              points='0,90 40,80 80,96 120,70 160,78 200,60 240,82 280,70 320,95 360,72 400,86 440,66 480,92 520,74 560,90 600,72' />
            <polyline fill='none' stroke='rgba(248,113,113,0.9)' strokeWidth='2'
              points='0,110 40,118 80,112 120,130 160,122 200,138 240,120 280,132 320,110 360,128 400,116 440,134 480,112 520,126 560,114 600,130' />
            <g strokeDasharray='4 4' stroke='rgba(148,163,184,0.4)'>
              <line x1='0' y1='80' x2='600' y2='80' />
            </g>
          </svg>
        </div>
      </section>
      )}
      {/* Listings overview table */}
      {activeTab === 'listings' && (
      <section className='bg-white rounded-xl shadow p-5'>
        <div className='flex items-center justify-between mb-3'>
          <h2 className='text-xl font-semibold'>All listings</h2>
          <div className='flex gap-2 items-center'>
            <div className='relative'>
              <HiOutlineSearch className='absolute left-2 top-1/2 -translate-y-1/2 text-slate-400' />
              <input
                className='pl-8 pr-2 py-2 border rounded-lg text-sm w-56'
                placeholder='Search by name or address'
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
              />
            </div>
            <button className='px-3 py-2 rounded-lg border text-sm flex items-center gap-2'><HiOutlineDownload /> Export</button>
            <a href='/create-listing' className='px-3 py-2 rounded-lg bg-slate-800 text-white text-sm inline-flex items-center gap-2'><HiOutlinePlus /> Add New</a>
          </div>
        </div>
        <div className='overflow-auto'>
          <table className='min-w-full border rounded-lg text-sm'>
            <thead className='bg-slate-50'>
              <tr>
                <th className='text-left p-2 border-b'>ID</th>
                <th className='text-left p-2 border-b'>Listing</th>
                <th className='text-left p-2 border-b'>Category</th>
                <th className='text-left p-2 border-b'>Type</th>
                <th className='text-left p-2 border-b'>Price</th>
                <th className='text-left p-2 border-b'>Offer</th>
                <th className='text-left p-2 border-b'>Created</th>
              </tr>
            </thead>
            <tbody>
              {(listingsLoading ? [] : listings)
                .filter((l) => {
                  if (!listSearch.trim()) return true;
                  const q = listSearch.toLowerCase();
                  return (
                    String(l.name || '').toLowerCase().includes(q) ||
                    String(l.address || '').toLowerCase().includes(q)
                  );
                })
                .map((l, idx) => {
                  const id = String(l._id).slice(-4).toUpperCase();
                  const price = l.offer ? l.discountPrice : l.regularPrice;
                  return (
                    <tr key={l._id} className='border-b hover:bg-slate-50'>
                      <td className='p-2'>#{id}</td>
                      <td className='p-2'>
                        <a href={`/listing/${l._id}`} className='text-slate-800 hover:underline font-medium'>{l.name}</a>
                        <div className='text-xs text-slate-500 truncate max-w-[360px]'>{l.address}</div>
                      </td>
                      <td className='p-2 text-xs'>{l.category || '-'}</td>
                      <td className='p-2'>
                        <span className={`px-2 py-0.5 rounded-full text-xs ${l.type === 'rent' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>{l.type || '-'}</span>
                      </td>
                      <td className='p-2'>${Number(price || 0).toLocaleString('en-US')}{l.type === 'rent' ? <span className='text-xs text-slate-500'> / month</span> : null}</td>
                      <td className='p-2'>
                        {l.offer ? (
                          <span className='px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-800'>Offer</span>
                        ) : (
                          <span className='px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-700'>—</span>
                        )}
                      </td>
                      <td className='p-2 text-xs'>{l.createdAt ? new Date(l.createdAt).toLocaleDateString() : '-'}</td>
                    </tr>
                  );
                })}
              {!listingsLoading && listings.length === 0 && (
                <tr><td className='p-2 text-slate-500' colSpan={7}>No listings.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      )}
      {/* Categories */}
      {activeTab === 'categories' && (
        <section className='mb-8 bg-white rounded-xl shadow p-5'>
          <div className='flex items-center justify-between mb-4'>
            <h2 className='text-xl font-semibold'>Categories</h2>
            <div className='text-sm text-slate-600'>Total: {categories.length}</div>
          </div>
          
          {/* Create Category Section - Admin Only */}
          {isAdmin && (
            <div className='mb-6 flex gap-2 items-center flex-wrap'>
              <input
                type='text'
                placeholder='Create new category (e.g., DLF)'
                className='border p-3 rounded-lg flex-1'
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
              />
              <button
                disabled={creating || !newCategoryName.trim()}
                onClick={async () => {
                  if (!newCategoryName.trim()) {
                    alert('Please enter a category name');
                    return;
                  }
                  try {
                    setCreating(true);
                    const res = await fetch('/api/category/create', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify({ name: newCategoryName.trim() }),
                    });
                    const data = await res.json();
                    if (data && data.slug) {
                      setCategories((prev) => [...prev, data]);
                      setNewCategoryName('');
                    } else {
                      console.error('Failed to create category:', data);
                      alert(data?.message || 'Failed to create category');
                    }
                  } catch (error) {
                    console.error('Error creating category:', error);
                    alert('Error creating category. Please try again.');
                  } finally {
                    setCreating(false);
                  }
                }}
                className='px-5 py-3 rounded-lg bg-slate-800 text-white hover:opacity-95 disabled:opacity-70'
              >
                {creating ? 'Creating...' : 'Create Category'}
              </button>
            </div>
          )}
          
          {/* Categories List */}
          <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4'>
            {categories.map((category) => (
              <div key={category._id} className='border rounded-lg p-4 hover:shadow-md transition-shadow'>
                <h3 className='font-semibold text-slate-800 mb-2'>{category.name}</h3>
                <p className='text-sm text-slate-600 mb-3'>Slug: {category.slug}</p>
                <div className='flex items-center justify-between'>
                  <span className='text-xs text-slate-500'>
                    {category.fields?.length || 0} fields
                  </span>
                  {isAdmin && (
                    <button
                      onClick={async () => {
                        if (confirm('Are you sure you want to delete this category?')) {
                          try {
                            const res = await fetch(`/api/category/delete/${category._id}`, {
                              method: 'DELETE',
                              credentials: 'include',
                            });
                            const data = await res.json();
                            if (res.ok) {
                              setCategories((prev) => prev.filter((c) => c._id !== category._id));
                              alert('Category deleted successfully!');
                            } else {
                              console.error('Failed to delete category:', data);
                              alert(data?.message || 'Failed to delete category');
                            }
                          } catch (error) {
                            console.error('Error deleting category:', error);
                            alert('Error deleting category. Please try again.');
                          }
                        }
                      }}
                      className='px-2 py-1 text-xs rounded border text-red-700 hover:bg-red-50'
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
            {categories.length === 0 && (
              <div className='col-span-full text-center py-8 text-slate-500'>
                No categories found. Create your first category above.
              </div>
            )}
          </div>
        </section>
      )}
      {/* Security Logs */}
      {activeTab === 'logs' && (
      <section className='mb-8 bg-white rounded-xl shadow p-5'>
        <div className='flex items-center justify-between mb-3'>
          <h2 className='text-xl font-semibold'>Security Logs</h2>
          <div className='text-sm text-slate-600'>Total: {logsTotal}</div>
        </div>
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 mb-3'>
          <input value={logFilters.email} onChange={(e) => setLogFilters({ ...logFilters, email: e.target.value })} placeholder='Filter email' className='border rounded p-2 text-sm' />
          <select value={logFilters.method} onChange={(e) => setLogFilters({ ...logFilters, method: e.target.value })} className='border rounded p-2 text-sm'>
            <option value='all'>All methods</option>
            <option value='password'>Password</option>
            <option value='signup'>Signup</option>
            <option value='other'>Other</option>
          </select>
          <select value={logFilters.status} onChange={(e) => setLogFilters({ ...logFilters, status: e.target.value })} className='border rounded p-2 text-sm'>
            <option value='all'>All status</option>
            <option value='blocked'>Blocked</option>
            <option value='invalid'>Invalid</option>
            <option value='success'>Success</option>
          </select>
          <input type='date' value={logFilters.since} onChange={(e) => setLogFilters({ ...logFilters, since: e.target.value })} className='border rounded p-2 text-sm' />
          <input type='date' value={logFilters.until} onChange={(e) => setLogFilters({ ...logFilters, until: e.target.value })} className='border rounded p-2 text-sm' />
        </div>
        <div className='flex items-center gap-2 mb-3'>
          <button
            className='px-3 py-1.5 rounded bg-slate-800 text-white text-sm'
            onClick={async () => {
              try {
                const params = new URLSearchParams();
                params.set('limit', String(pageSize));
                params.set('skip', String(logPage * pageSize));
                if (logFilters.email.trim()) params.set('email', logFilters.email.trim());
                if (logFilters.method !== 'all') params.set('method', logFilters.method);
                if (logFilters.status !== 'all') params.set('status', logFilters.status);
                if (logFilters.since) params.set('since', logFilters.since);
                if (logFilters.until) params.set('until', logFilters.until);
                const res = await fetch(`/api/user/security/logs?${params.toString()}`, { credentials: 'include' });
                const text = await res.text();
                const data = text ? JSON.parse(text) : { logs: [], total: 0 };
                setLogs(Array.isArray(data.logs) ? data.logs : []);
                setLogsTotal(Number(data.total) || 0);
              } catch (_) {}
            }}
          >Apply Filters</button>
          <button
            className='px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm'
            onClick={async () => {
              try {
                setLogFilters({ method: 'all', status: 'all', email: '', since: '', until: '' });
                setLogPage(0);
                const res = await fetch(`/api/user/security/logs?limit=${pageSize}`, { credentials: 'include' });
                const text = await res.text();
                const data = text ? JSON.parse(text) : { logs: [], total: 0 };
                setLogs(Array.isArray(data.logs) ? data.logs : []);
                setLogsTotal(Number(data.total) || 0);
              } catch (_) {}
            }}
          >Reset</button>
          <label className='flex items-center gap-2 text-sm ml-2'>
            <input type='checkbox' checked={onlyPhoneChanges} onChange={(e) => setOnlyPhoneChanges(e.target.checked)} />
            Only phone changes
          </label>
          <div className='ml-auto flex items-center gap-2'>
            <button disabled={logPage === 0} onClick={() => setLogPage((p) => Math.max(0, p-1))} className='px-3 py-1.5 rounded border text-sm disabled:opacity-50'>Prev</button>
            <span className='text-sm text-slate-600'>Page {logPage + 1} of {Math.max(1, Math.ceil(logsTotal / pageSize))}</span>
            <button disabled={(logPage+1) * pageSize >= logsTotal} onClick={() => setLogPage((p) => p+1)} className='px-3 py-1.5 rounded border text-sm disabled:opacity-50'>Next</button>
          </div>
        </div>
        <div className='overflow-auto max-h-96'>
          <table className='min-w-full border rounded-lg text-sm'>
            <thead className='bg-slate-50'>
              <tr>
                <th className='text-left p-2 border-b'>Time</th>
                <th className='text-left p-2 border-b'>Email</th>
                <th className='text-left p-2 border-b'>Method</th>
                <th className='text-left p-2 border-b'>Status</th>
                <th className='text-left p-2 border-b'>Reason</th>
                <th className='text-left p-2 border-b'>IP</th>
                <th className='text-left p-2 border-b'>User Agent</th>
                <th className='text-left p-2 border-b'>Path</th>
              </tr>
            </thead>
            <tbody>
              {(onlyPhoneChanges ? logs.filter((l) => String(l.reason || '').startsWith('phone_changed:')) : logs).map((log) => {
                const badge = log.status === 'blocked' ? 'bg-red-100 text-red-800' : log.status === 'success' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800';
                return (
                  <tr key={log._id} className='border-b hover:bg-slate-50'>
                    <td className='p-2 whitespace-nowrap'>{new Date(log.createdAt).toLocaleString()}</td>
                    <td className='p-2 break-all'>{log.email}</td>
                    <td className='p-2 capitalize'>{log.method}</td>
                    <td className='p-2'><span className={`px-2 py-0.5 rounded-full text-xs ${badge}`}>{log.status}</span></td>
                    <td className='p-2'>{log.reason}</td>
                    <td className='p-2'>{log.ip}</td>
                    <td className='p-2 text-xs max-w-[280px] truncate' title={log.userAgent}>{log.userAgent}</td>
                    <td className='p-2 text-xs'>{log.path}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      )}
      {/* Owners Management */}
      {activeTab === 'owners' && (
      <section className='mb-8 bg-white rounded-xl shadow p-5'>
        <div className='flex items-center justify-between mb-3'>
          <h2 className='text-xl font-semibold'>Owners</h2>
          {ownersLoading && <span className='text-sm text-slate-500'>Loading…</span>}
        </div>
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3'>
          <input
            className='border p-2 rounded'
            placeholder='Owner name*'
            value={newOwner.name}
            onChange={(e) => setNewOwner({ ...newOwner, name: e.target.value })}
          />
          <input
            className='border p-2 rounded'
            placeholder='Email'
            value={newOwner.email}
            onChange={(e) => setNewOwner({ ...newOwner, email: e.target.value })}
          />
          <input
            className='border p-2 rounded'
            placeholder='Phone'
            value={newOwner.phone}
            onChange={(e) => setNewOwner({ ...newOwner, phone: e.target.value })}
          />
          <input
            className='border p-2 rounded'
            placeholder='Company'
            value={newOwner.companyName}
            onChange={(e) => setNewOwner({ ...newOwner, companyName: e.target.value })}
          />
        </div>
        <div className='flex items-center gap-2 mb-4'>
          <button onClick={createOwner} className='px-4 py-2 rounded bg-blue-600 text-white'>Create Owner</button>
          <input
            className='border p-2 rounded ml-auto'
            placeholder='Search owners'
            value={ownersQuery}
            onChange={(e) => setOwnersQuery(e.target.value)}
          />
        </div>
        <div className='overflow-auto'>
          <table className='min-w-full border rounded-lg'>
            <thead className='bg-slate-50'>
              <tr>
                <th className='text-left p-2 border-b'>Name</th>
                <th className='text-left p-2 border-b'>Company</th>
                <th className='text-left p-2 border-b'>Email</th>
                <th className='text-left p-2 border-b'>Phone</th>
                <th className='text-left p-2 border-b'>Active</th>
                <th className='text-left p-2 border-b'>Actions</th>
              </tr>
            </thead>
            <tbody>
              {owners
                .filter((o) => {
                  if (!ownersQuery.trim()) return true;
                  const q = ownersQuery.toLowerCase();
                  return (
                    String(o.name || '').toLowerCase().includes(q) ||
                    String(o.email || '').toLowerCase().includes(q) ||
                    String(o.companyName || '').toLowerCase().includes(q)
                  );
                })
                .map((o) => (
                  <tr key={o._id} className='border-b'>
                    <td className='p-2'>{o.name}</td>
                    <td className='p-2'>{o.companyName || '-'}</td>
                    <td className='p-2'>{o.email || '-'}</td>
                    <td className='p-2'>{o.phone || '-'}</td>
                    <td className='p-2'>
                      <span className={`px-2 py-0.5 rounded-full text-xs ${o.active ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-700'}`}>{o.active ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td className='p-2'>
                      <div className='flex items-center gap-2'>
                        <button onClick={() => toggleOwnerActive(o)} className='px-2 py-1 text-xs rounded border'>{o.active ? 'Deactivate' : 'Activate'}</button>
                        {isAdmin && (
                          <button onClick={() => deleteOwnerById(o._id)} className='px-2 py-1 text-xs rounded border text-red-700'>Delete</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              {owners.length === 0 && (
                <tr><td className='p-2 text-slate-500' colSpan={6}>No owners yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      )}
      {activeTab === 'users' && (
        <>
          {/* Create Employee Section */}
          <section className='mb-8 bg-white rounded-xl shadow p-5'>
            <h2 className='text-xl font-semibold mb-4'>Create Employee</h2>
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
              <input
                className='border p-2 rounded'
                placeholder='Username'
                value={newUser.username}
                onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
              />
              <input
                className='border p-2 rounded'
                placeholder='Email'
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              />
              <input
                className='border p-2 rounded'
                placeholder='Password'
                type='password'
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              />
              <div className='flex flex-wrap gap-2 items-center'>
                {categories.map((c) => (
                  <label key={c._id} className='flex items-center gap-2 text-sm'>
                    <input
                      type='checkbox'
                      checked={newUser.assignedCategories.includes(c.slug)}
                      onChange={(e) => {
                        const next = new Set(newUser.assignedCategories);
                        if (e.target.checked) next.add(c.slug);
                        else next.delete(c.slug);
                        setNewUser({ ...newUser, assignedCategories: Array.from(next) });
                      }}
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            </div>
            <div className='mt-4'>
              <button
                disabled={creating}
                onClick={async () => {
                  try {
                    setCreating(true);
                    const res = await fetch('/api/user/employee', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify(newUser),
                    });
                    const data = await res.json();
                    if (data && data._id) {
                      setUsers((prev) => [data, ...prev]);
                      setNewUser({ username: '', email: '', password: '', assignedCategories: [] });
                    }
                  } catch (_) {}
                  setCreating(false);
                }}
                className='px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-70'
              >
                {creating ? 'Creating...' : 'Create Employee'}
              </button>
            </div>
          </section>

          {/* All Users Table */}
          <section className='mb-8 bg-white rounded-xl shadow p-5'>
            <div className='flex items-center justify-between mb-4'>
              <h2 className='text-xl font-semibold'>All Users</h2>
              <div className='flex items-center gap-4'>
                <div className='relative'>
                  <HiOutlineSearch className='absolute left-2 top-1/2 -translate-y-1/2 text-slate-400' />
                  <input
                    className='pl-8 pr-2 py-2 border rounded-lg text-sm w-64'
                    placeholder='Search users by name or email'
                    value={usersQuery}
                    onChange={(e) => setUsersQuery(e.target.value)}
                  />
                </div>
                <div className='text-sm text-slate-600'>Total: {users.length} users</div>
              </div>
            </div>
            
            <div className='overflow-auto'>
              <table className='min-w-full border rounded-lg text-sm'>
                <thead className='bg-slate-50'>
                  <tr>
                    <th className='text-left p-3 border-b font-semibold'>User</th>
                    <th className='text-left p-3 border-b font-semibold'>Email</th>
                    <th className='text-left p-3 border-b font-semibold'>Role</th>
                    <th className='text-left p-3 border-b font-semibold'>Categories</th>
                    <th className='text-left p-3 border-b font-semibold'>Created</th>
                    <th className='text-left p-3 border-b font-semibold'>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users
                    .filter((user) => {
                      if (!usersQuery.trim()) return true;
                      const q = usersQuery.toLowerCase();
                      return (
                        String(user.username || '').toLowerCase().includes(q) ||
                        String(user.email || '').toLowerCase().includes(q) ||
                        String(user.phone || '').toLowerCase().includes(q)
                      );
                    })
                    .map((user) => (
                    <tr key={user._id} className='border-b hover:bg-slate-50'>
                      <td className='p-3'>
                        <div className='flex items-center gap-3'>
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            user.role === 'admin' ? 'bg-red-100' :
                            user.role === 'employee' ? 'bg-blue-100' :
                            user.role === 'seller' ? 'bg-green-100' :
                            'bg-slate-200'
                          }`}>
                            <span className={`text-sm font-medium ${
                              user.role === 'admin' ? 'text-red-600' :
                              user.role === 'employee' ? 'text-blue-600' :
                              user.role === 'seller' ? 'text-green-600' :
                              'text-slate-600'
                            }`}>
                              {user.username ? user.username.charAt(0).toUpperCase() : 'U'}
                            </span>
                          </div>
                          <div>
                            <div className='font-medium text-slate-900'>{user.username || 'N/A'}</div>
                            <div className='flex items-center gap-2'>
                              <span className='text-xs text-slate-500'>ID: {String(user._id).slice(-6)}</span>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                user.role === 'admin' ? 'bg-red-100 text-red-800' :
                                user.role === 'employee' ? 'bg-blue-100 text-blue-800' :
                                user.role === 'seller' ? 'bg-green-100 text-green-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {user.role || 'buyer'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className='p-3'>
                        <div className='text-slate-900'>{user.email}</div>
                        {user.phone && (
                          <div className='text-xs text-slate-500'>{user.phone}</div>
                        )}
                      </td>
                      <td className='p-3'>
                        <select
                          value={user.role || 'buyer'}
                          onChange={(e) => updateUser(user._id, e.target.value, user.assignedCategories || [])}
                          disabled={saving}
                          className={`px-2 py-1 rounded border text-sm ${
                            user.role === 'admin' ? 'bg-red-50 border-red-200' :
                            user.role === 'employee' ? 'bg-blue-50 border-blue-200' :
                            user.role === 'seller' ? 'bg-green-50 border-green-200' :
                            'bg-gray-50 border-gray-200'
                          }`}
                        >
                          <option value='buyer'>Buyer</option>
                          <option value='seller'>Seller</option>
                          <option value='employee'>Employee</option>
                          <option value='admin'>Admin</option>
                        </select>
                      </td>
                      <td className='p-3'>
                        <div className='flex flex-wrap gap-1'>
                          {(user.assignedCategories || []).map((cat) => (
                            <span key={cat} className='px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full'>
                              {cat}
                            </span>
                          ))}
                          {(!user.assignedCategories || user.assignedCategories.length === 0) && (
                            <span className='text-xs text-slate-400'>No categories</span>
                          )}
                        </div>
                      </td>
                      <td className='p-3 text-xs text-slate-600'>
                        {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
                      </td>
                      <td className='p-3'>
                        <div className='flex items-center gap-2'>
                          <button
                            onClick={() => openCategoryModal(user)}
                            className='px-2 py-1 text-xs rounded border hover:bg-slate-50'
                          >
                            Edit Categories
                          </button>
                          <button
                            onClick={() => {
                              if (confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
                                deleteUser(user._id);
                              }
                            }}
                            className='px-2 py-1 text-xs rounded border text-red-600 hover:bg-red-50'
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td className='p-3 text-slate-500 text-center' colSpan={6}>
                        No users found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

        {/* Category Assignment Modal */}
        {showCategoryModal && editingUser && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 max-h-[80vh] overflow-hidden">
              <div className="p-6 border-b">
                <h3 className="text-lg font-semibold text-slate-800">
                  Assign Categories to {editingUser.username}
                </h3>
                <p className="text-sm text-slate-600 mt-1">
                  Select the categories this user can access
                </p>
              </div>
              
              <div className="p-6 max-h-96 overflow-y-auto">
                {categories.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <p>No categories available</p>
                    <p className="text-sm mt-1">Create categories first to assign them to users</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {categories.map((category) => (
                      <label
                        key={category._id}
                        className="flex items-center gap-3 p-3 rounded-lg border hover:bg-slate-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedCategories.includes(category.slug)}
                          onChange={() => handleCategoryToggle(category.slug)}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <div className="flex-1">
                          <div className="font-medium text-slate-800">{category.name}</div>
                          <div className="text-sm text-slate-500">Slug: {category.slug}</div>
                          {category.fields && category.fields.length > 0 && (
                            <div className="text-xs text-slate-400 mt-1">
                              {category.fields.length} field{category.fields.length !== 1 ? 's' : ''}
                            </div>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="p-6 border-t bg-slate-50 flex justify-end gap-3">
                <button
                  onClick={closeCategoryModal}
                  disabled={saving}
                  className="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={saveCategoryAssignment}
                  disabled={saving}
                  className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Role Management Tab */}
        {activeTab === 'roles' && isAdmin && (
          <RoleManagement />
        )}
      </section>
    </div>
    </main>
  );
}



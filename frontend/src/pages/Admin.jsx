import { useEffect, useState } from 'react';
import ConfirmDialog from '../components/ConfirmDialog';
import { io } from 'socket.io-client';
import { SOCKET_URL } from '../config/socket';
import { apiClient } from '../utils/http';
import { toCsv, downloadTextFile } from '../utils/spreadsheet';
import { formatListingPrice, isPlaceholderPrice } from '../utils/currency';
import { HiOutlineViewGrid, HiOutlineCollection, HiOutlineTag, HiOutlineUserGroup, HiOutlineClipboardList, HiOutlineShieldCheck, HiOutlinePlus, HiOutlineSearch, HiOutlineDownload, HiOutlineUpload, HiOutlineKey, HiX } from 'react-icons/hi';
import { PageHeader, Button, Badge } from '../design-system';
import { useBuyerView } from '../contexts/BuyerViewContext';
import { useSelector } from 'react-redux';
import { usePermissions } from '../contexts/PermissionsContext';
import RoleManagement from '../components/RoleManagement';
import PropertyTypeManagement from './PropertyTypeManagement';
import { useNotification } from '../contexts/NotificationContext';
import { useTranslation } from 'react-i18next';
import { localDateString } from '../utils/localDate';

export default function Admin() {
  const { t } = useTranslation();
  const { currentUser } = useSelector((state) => state.user);
  const { isBuyerViewMode } = useBuyerView();
  const { showSuccess, showError } = useNotification();
  const [users, setUsers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', email: '', phone: '', assignedCategories: [] });
  const [newCategoryName, setNewCategoryName] = useState('');
  const [logs, setLogs] = useState([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logFilters, setLogFilters] = useState({ method: 'all', status: 'all', email: '', since: '', until: '' });
  const [logPage, setLogPage] = useState(0);
  const [onlyPhoneChanges, setOnlyPhoneChanges] = useState(false);
  const [usersQuery, setUsersQuery] = useState('');
  const [pendingDeleteCategory, setPendingDeleteCategory] = useState(null);
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
  const [showUserManageModal, setShowUserManageModal] = useState(false);
  const [managingUser, setManagingUser] = useState(null);
  const [manageRole, setManageRole] = useState('buyer');
  const [manageCategories, setManageCategories] = useState([]);
  const [managePassword, setManagePassword] = useState('');
  const [managePasswordConfirm, setManagePasswordConfirm] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const totalOwners = owners.length;
  const totalUsers = users.length;
  const totalListings = listings.length;

  // Role-based access control
  const isAdmin = currentUser?.role === 'admin';
  const isBuyerViewRestricted = Boolean(isBuyerViewMode);
  const { can: hasPerm, ready: permReady } = usePermissions();

  // Core data: categories, listings, owners, users — fires once when permissions are ready.
  // logPage is intentionally excluded; log pagination has its own effect below.
  useEffect(() => {
    if (isBuyerViewRestricted || !permReady) return;

    let cancelled = false;
    const load = async () => {
      setOwnersLoading(true);
      setListingsLoading(true);

      const calls = [
        apiClient.get('/category/list'),
        apiClient.get('/listing/get?limit=50&order=desc'),
        hasPerm('viewOwners')
          ? apiClient.get('/owner/list')
          : Promise.resolve([]),
      ];

      const results = await Promise.allSettled(calls);
      if (cancelled) return;

      const cJson  = results[0].status === 'fulfilled' ? results[0].value : [];
      const lsJson = results[1].status === 'fulfilled' ? results[1].value : null;
      const oJson  = results[2].status === 'fulfilled' ? results[2].value : [];

      setCategories(Array.isArray(cJson) ? cJson : []);
      setListings(Array.isArray(lsJson?.data?.listings) ? lsJson.data.listings : []);
      setOwners(Array.isArray(oJson) ? oJson : []);
      setOwnersLoading(false);
      setListingsLoading(false);

      if (isAdmin) {
        try {
          const uJson = await apiClient.get('/user/list');
          if (!cancelled) setUsers(Array.isArray(uJson) ? uJson : []);
        } catch (error) {
          console.error(error);
        }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [isBuyerViewRestricted, isAdmin, permReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Log pagination: only re-fetches security logs, not the full page data.
  useEffect(() => {
    if (!isAdmin || !permReady) return;

    let cancelled = false;
    (async () => {
      try {
        const lJson = await apiClient.get(`/user/security/logs?limit=${pageSize}&skip=${logPage * pageSize}`);
        if (!cancelled) {
          setLogs(Array.isArray(lJson?.logs) ? lJson.logs : []);
          setLogsTotal(Number(lJson?.total) || 0);
        }
      } catch (error) {
        console.error(error);
      }
    })();
    return () => { cancelled = true; };
  }, [isAdmin, logPage, permReady]);

  // Listen for listing changes to refresh data
  useEffect(() => {
    const refreshListings = async () => {
      try {
        const lsJson = await apiClient.get('/listing/get?limit=50&order=desc');
        setListings(Array.isArray(lsJson?.data?.listings) ? lsJson.data.listings : []);
      } catch (error) {
        console.error('Error refreshing listings:', error);
      }
    };

    window.addEventListener('listing-created', refreshListings);
    window.addEventListener('listing-deleted', refreshListings);
    window.addEventListener('listing-updated', refreshListings);

    return () => {
      window.removeEventListener('listing-created', refreshListings);
      window.removeEventListener('listing-deleted', refreshListings);
      window.removeEventListener('listing-updated', refreshListings);
    };
  }, []);

  // Realtime owners refresh — only if user has viewOwners permission
  const canViewOwners = hasPerm('viewOwners');
  useEffect(() => {
    if (isBuyerViewRestricted || !canViewOwners) return;

    const socket = io(SOCKET_URL, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });
    const handleOwnersChanged = async () => {
      try {
        const oJson = await apiClient.get('/owner/list');
        setOwners(Array.isArray(oJson) ? oJson : []);
      } catch (error) {
        console.error(error);
      }
    };
    socket.on('owners:changed', handleOwnersChanged);
    return () => {
      socket.off('owners:changed', handleOwnersChanged);
      socket.close();
    };
  }, [isBuyerViewRestricted, canViewOwners]);

  const updateUser = async (id, role, assignedCategories) => {
    try {
      setSaving(true);
      const data = await apiClient.post(`/user/role/${id}`, { role, assignedCategories });
      if (data && data._id) {
        setUsers((prev) => prev.map((u) => (u._id === id ? data : u)));
      }
    } catch (error) {
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const openUserManageModal = (user) => {
    if (!user) return;
    setManagingUser(user);
    setManageRole(user.role || 'buyer');
    setManageCategories([...(user.assignedCategories || [])]);
    setManagePassword('');
    setManagePasswordConfirm('');
    setShowUserManageModal(true);
  };

  const closeUserManageModal = () => {
    setShowUserManageModal(false);
    setManagingUser(null);
    setManageRole('buyer');
    setManageCategories([]);
    setManagePassword('');
    setManagePasswordConfirm('');
  };

  const toggleManageCategory = (slug) => {
    setManageCategories((prev) => {
      if (prev.includes(slug)) return prev.filter((x) => x !== slug);
      return [...prev, slug];
    });
  };

  const saveManagedUser = async () => {
    if (!managingUser) return;
    if (managingUser.role === 'admin' && managingUser._id !== currentUser._id) {
      showError('Cannot modify another admin.');
      return;
    }
    const roleToSave = managingUser.role === 'admin' ? 'admin' : manageRole;
    await updateUser(managingUser._id, roleToSave, manageCategories);
    setManagingUser((prev) => (prev ? { ...prev, role: roleToSave, assignedCategories: manageCategories } : prev));
  };

  const saveManagedPassword = async () => {
    if (!isAdmin) return;
    if (!managingUser || managingUser.role !== 'employee') return;
    if (!managePassword) return;
    if (managePassword !== managePasswordConfirm) {
      showError('Passwords do not match');
      return;
    }
    try {
      setSaving(true);
      await apiClient.post(`/user/admin/set-employee-password/${managingUser._id}`, { newPassword: managePassword });
      showSuccess('Password updated successfully');
      setManagePassword('');
      setManagePasswordConfirm('');
    } catch (error) {
      console.error(error);
      showError('Failed to update password');
    } finally {
      setSaving(false);
    }
  };

  const createOwner = async () => {
    if (!newOwner.name.trim()) return;
    try {
      setCreating(true);
      const data = await apiClient.post('/owner', newOwner);
      if (data && data._id) {
        setOwners((prev) => [data, ...prev]);
        setNewOwner({ name: '', email: '', phone: '', companyName: '' });
      }
    } catch (error) {
      console.error(error);
    } finally {
      setCreating(false);
    }
  };

  const deleteOwnerById = async (id) => {
    try {
      const data = await apiClient.delete(`/owner/${id}`);
      if (data && data.success) setOwners((prev) => prev.filter((o) => o._id !== id));
    } catch (error) {
      console.error(error);
    }
  };

  const toggleOwnerActive = async (owner) => {
    try {
      const data = await apiClient.put(`/owner/${owner._id}`, { active: !owner.active });
      if (data && data._id) setOwners((prev) => prev.map((o) => (o._id === data._id ? data : o)));
    } catch (error) {
      console.error(error);
    }
  };

  const toggleUserStatus = async (userId, currentStatus) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    try {
      const data = await apiClient.post(`/user/admin/toggle-status/${userId}`, { status: newStatus });
      if (data && data.success) {
        setUsers((prev) => prev.map((u) => u._id === userId ? { ...u, status: newStatus } : u));
      } else {
        showError(data.message || 'Failed to update user status');
      }
    } catch (_) {
      showError('Failed to update user status');
    }
  };

  /**
   * Export the listings the admin is currently looking at.
   *
   * Was hand-rolling its own quoting, which wrapped four columns in quotes and
   * left the rest bare, so a city containing a comma split the row. It also
   * predated the formula-injection guard. Both live in toCsv now.
   */
  const exportListingsToCSV = () => {
    if (!listings || listings.length === 0) {
      showError('No listings to export');
      return;
    }

    const q = listSearch.trim().toLowerCase();
    const filteredListings = listings.filter((l) =>
      !q ||
      String(l.name || '').toLowerCase().includes(q) ||
      String(l.address || '').toLowerCase().includes(q)
    );

    if (!filteredListings.length) {
      showError('No listings match the current search.');
      return;
    }

    const grid = [
      [
        'ID', 'Name', 'Address', 'City', 'State', 'Pincode', 'Category',
        'Property Type', 'Type', 'Price', 'Discount Price', 'Offer',
        'Bedrooms', 'Bathrooms', 'Parking', 'Furnished', 'Created At',
      ],
      ...filteredListings.map((l) => [
        l._id,
        l.name || '',
        l.address || '',
        l.city || '',
        l.state || '',
        l.pincode || '',
        l.category || '',
        l.propertyType || '',
        l.type || '',
        l.regularPrice || 0,
        l.discountPrice || 0,
        l.offer ? 'Yes' : 'No',
        l.bedrooms || 0,
        l.bathrooms || 0,
        l.parking ? 'Yes' : 'No',
        l.furnished ? 'Yes' : 'No',
        l.createdAt ? new Date(l.createdAt).toISOString().slice(0, 10) : '',
      ]),
    ];

    downloadTextFile(`listings-${localDateString()}.csv`, toCsv(grid));
  };

  const parseCSV = (text) => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    // Parse header row
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

    // Map common header variations to standard field names
    const headerMap = {
      'name': 'name',
      'title': 'name',
      'property name': 'name',
      'description': 'description',
      'address': 'address',
      'city': 'city',
      'state': 'state',
      'pincode': 'pincode',
      'zip': 'pincode',
      'zipcode': 'pincode',
      'type': 'type',
      'listing type': 'type',
      'property type': 'propertyType',
      'propertytype': 'propertyType',
      'category': 'category',
      'price': 'regularPrice',
      'regular price': 'regularPrice',
      'regularprice': 'regularPrice',
      'discount price': 'discountPrice',
      'discountprice': 'discountPrice',
      'offer': 'offer',
      'bedrooms': 'bedrooms',
      'beds': 'bedrooms',
      'bathrooms': 'bathrooms',
      'baths': 'bathrooms',
      'parking': 'parking',
      'furnished': 'furnished',
      'latitude': 'latitude',
      'lat': 'lat',
      'longitude': 'longitude',
      'lng': 'lng',
      'floors': 'floors',
      'plot size': 'plotSize',
      'plotsize': 'plotSize',
      'area': 'areaSqFt',
      'areasqft': 'areaSqFt',
      'sq yard': 'sqYard',
      'sqyard': 'sqYard',
      'sq yard rate': 'sqYardRate',
      'sqyardrate': 'sqYardRate',
      'facing': 'facing',
      'floor': 'floor',
      'total floors': 'totalFloors',
      'totalfloors': 'totalFloors',
      'lift': 'lift',
      'balcony': 'balcony',
      'garden': 'garden',
      'area name': 'areaName',
      'areaname': 'areaName',
      'property no': 'propertyNo',
      'propertyno': 'propertyNo',
      'remarks': 'remarks',
    };

    const normalizedHeaders = headers.map(h => {
      const lower = h.toLowerCase();
      return headerMap[lower] || h;
    });

    // Parse data rows
    const data = [];
    for (let i = 1; i < lines.length; i++) {
      const values = [];
      let current = '';
      let inQuotes = false;

      for (const char of lines[i]) {
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());

      if (values.length === normalizedHeaders.length) {
        const row = {};
        normalizedHeaders.forEach((header, idx) => {
          row[header] = values[idx]?.replace(/^"|"$/g, '') || '';
        });
        data.push(row);
      }
    }

    return data;
  };

  const handleImportFile = async () => {
    if (!importFile) {
      showError('Please select a file');
      return;
    }

    setImporting(true);
    setImportResults(null);

    try {
      const text = await importFile.text();
      const listings = parseCSV(text);

      if (listings.length === 0) {
        showError('No valid data found in the file');
        setImporting(false);
        return;
      }

      const data = await apiClient.post('/listing/bulk-import', { listings });

      if (data.success) {
        setImportResults(data.data);
        // Refresh listings
        const listData = await apiClient.get('/listing/get?limit=200');
        setListings(Array.isArray(listData?.data?.listings) ? listData.data.listings : []);
      } else {
        showError(data.message || 'Import failed');
      }
    } catch (error) {
      console.error('Import error:', error);
      showError('Failed to import listings: ' + error.message);
    } finally {
      setImporting(false);
    }
  };

  const downloadSampleCSV = () => {
    const sampleData = `name,address,city,state,pincode,type,propertyType,category,price,bedrooms,bathrooms,parking,furnished,latitude,longitude
"Sample House","123 Main Street","Mumbai","Maharashtra","400001","sale","house","residential","5000000","3","2","Yes","Yes","19.0760","72.8777"
"Sample Flat","456 Park Avenue","Delhi","Delhi","110001","rent","flat","residential","25000","2","1","No","Yes","28.6139","77.2090"`;

    // Same helper as the real exports: adds the BOM and revokes the object URL,
    // which this function used to allocate and never release.
    downloadTextFile('listings-import-template.csv', sampleData);
  };


  return (
    <div className='space-y-5'>
      {isBuyerViewRestricted && (
        <div className='bg-white border border-slate-200 rounded-xl p-10 text-center shadow-sm'>
          <h1 className='text-xl font-bold text-slate-900 mb-2'>{t('admin.accessRestricted')}</h1>
          <p className='text-sm text-slate-500 mb-1'>{t('admin.adminFeaturesAreNotAvailableIn')}</p>
          <p className='text-xs text-slate-400'>{t('admin.exitBuyerViewModeToAccess')}</p>
        </div>
      )}

      {!isBuyerViewRestricted && (
        <>
          <PageHeader
            title={`${isAdmin ? 'Admin' : 'Employee'} Control Center`}
            description={t('admin.manageListingsUsersAndSystemSettings')}
            actions={
              <Button variant='primary' size='sm' icon={HiOutlinePlus} onClick={() => window.location.href = '/create-listing'}>{t('admin.newListing')}</Button>
            }
          />

          {/* Horizontal tab bar */}
          <div className='bg-white border border-slate-200 rounded-xl flex gap-1 overflow-x-auto p-1'>
            <button onClick={() => setActiveTab('dashboard')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${activeTab === 'dashboard' ? 'text-slate-900 bg-slate-50 font-semibold' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
              <HiOutlineViewGrid className='w-4 h-4' />{t('admin.dashboard')}</button>
            <button onClick={() => setActiveTab('listings')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${activeTab === 'listings' ? 'text-slate-900 bg-slate-50 font-semibold' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
              <HiOutlineCollection className='w-4 h-4' />{t('admin.listings')}</button>
            {(hasPerm('createCategory') || hasPerm('deleteCategory') || hasPerm('updateCategory')) && (
              <button onClick={() => setActiveTab('categories')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${activeTab === 'categories' ? 'text-slate-900 bg-slate-50 font-semibold' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
                <HiOutlineTag className='w-4 h-4' />{t('admin.categories')}</button>
            )}
            {isAdmin && (
              <button onClick={() => setActiveTab('property-types')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${activeTab === 'property-types' ? 'text-slate-900 bg-slate-50 font-semibold' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
                <HiOutlineTag className='w-4 h-4' />{t('admin.propertyTypes')}</button>
            )}
            {hasPerm('viewOwners') && (
              <button onClick={() => setActiveTab('owners')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${activeTab === 'owners' ? 'text-slate-900 bg-slate-50 font-semibold' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
                <HiOutlineUserGroup className='w-4 h-4' />{t('admin.owners')}</button>
            )}
            {isAdmin && (
              <button onClick={() => setActiveTab('users')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${activeTab === 'users' ? 'text-slate-900 bg-slate-50 font-semibold' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
                <HiOutlineClipboardList className='w-4 h-4' />{t('admin.users')}</button>
            )}
            {isAdmin && (
              <button onClick={() => setActiveTab('roles')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${activeTab === 'roles' ? 'text-slate-900 bg-slate-50 font-semibold' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
                <HiOutlineKey className='w-4 h-4' />{t('admin.rolesPermissions')}</button>
            )}
            {isAdmin && (
              <button onClick={() => setActiveTab('logs')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${activeTab === 'logs' ? 'text-slate-900 bg-slate-50 font-semibold' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
                <HiOutlineShieldCheck className='w-4 h-4' />{t('admin.securityLogs')}</button>
            )}
          </div>

          {/* DASHBOARD TAB */}
          {activeTab === 'dashboard' && (
            <div className='space-y-5'>
              <div className={`grid grid-cols-1 sm:grid-cols-2 ${isAdmin ? 'lg:grid-cols-3' : ''} gap-4`}>
                <div className='bg-white border border-slate-200 border-t-2 border-t-blue-500 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow'>
                  <div className='flex items-start justify-between'>
                    <div>
                      <div className='text-xs uppercase tracking-wider text-slate-500 font-medium'>{t('admin.listings')}</div>
                      <div className='text-2xl font-bold text-slate-900 mt-1'>{totalListings}</div>
                      <div className='text-xs text-slate-400 mt-0.5'>{t('admin.activeItems')}</div>
                    </div>
                    <div className='w-9 h-9 rounded-xl bg-blue-50 ring-1 ring-blue-100 flex items-center justify-center'>
                      <HiOutlineCollection className='w-5 h-5 text-blue-500' />
                    </div>
                  </div>
                </div>
                {hasPerm('viewOwners') && (
                  <div className='bg-white border border-slate-200 border-t-2 border-t-emerald-500 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow'>
                    <div className='flex items-start justify-between'>
                      <div>
                        <div className='text-xs uppercase tracking-wider text-slate-500 font-medium'>{t('admin.owners')}</div>
                        <div className='text-2xl font-bold text-slate-900 mt-1'>{totalOwners}</div>
                        <div className='text-xs text-slate-400 mt-0.5'>{t('admin.registeredPartners')}</div>
                      </div>
                      <div className='w-9 h-9 rounded-xl bg-emerald-50 ring-1 ring-emerald-100 flex items-center justify-center'>
                        <HiOutlineUserGroup className='w-5 h-5 text-emerald-500' />
                      </div>
                    </div>
                  </div>
                )}
                {isAdmin && (
                  <div className='bg-white border border-slate-200 border-t-2 border-t-purple-500 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow'>
                    <div className='flex items-start justify-between'>
                      <div>
                        <div className='text-xs uppercase tracking-wider text-slate-500 font-medium'>{t('admin.users')}</div>
                        <div className='text-2xl font-bold text-slate-900 mt-1'>{totalUsers}</div>
                        <div className='text-xs text-slate-400 mt-0.5'>{t('admin.accounts')}</div>
                      </div>
                      <div className='w-9 h-9 rounded-xl bg-purple-50 ring-1 ring-purple-100 flex items-center justify-center'>
                        <HiOutlineClipboardList className='w-5 h-5 text-purple-500' />
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {/* Portfolio Overview */}
              <div className='bg-white border border-slate-200 rounded-xl p-5 shadow-sm'>
                <div className='flex items-center justify-between mb-4'>
                  <div>
                    <h2 className='text-base font-semibold text-slate-900'>{t('admin.portfolioOverview')}</h2>
                    <div className='text-xs text-slate-500 mt-0.5'>{t('admin.listingsValueDistribution')}</div>
                  </div>
                  <div className='flex gap-4'>
                    <div className='flex items-center gap-2'><span className='inline-block w-3 h-3 rounded-full bg-purple-500'></span><span className='text-xs text-slate-600'>{t('admin.forSale')}</span></div>
                    <div className='flex items-center gap-2'><span className='inline-block w-3 h-3 rounded-full bg-blue-500'></span><span className='text-xs text-slate-600'>{t('admin.forRent')}</span></div>
                  </div>
                </div>

                {/* Stats Row */}
                {(() => {
                  const effectivePrice = (l) => {
                    if (isPlaceholderPrice(l.regularPrice)) return 0;
                    return (l.offer && l.discountPrice) ? l.discountPrice : (l.regularPrice || 0);
                  };
                  const saleListings = listings.filter(l => l.type === 'sale');
                  const rentListings = listings.filter(l => l.type === 'rent');
                  return (
                <div className='grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6'>
                  <div className='p-3 bg-purple-50 rounded-lg border border-purple-100'>
                    <div className='text-xs text-purple-600 font-medium'>{t('admin.totalSaleValue')}</div>
                    <div className='text-lg font-bold text-purple-800'>{formatListingPrice(saleListings.reduce((sum, l) => sum + effectivePrice(l), 0))}</div>
                    <div className='text-xs text-slate-500'>{saleListings.length} properties</div>
                  </div>
                  <div className='p-3 bg-blue-50 rounded-lg border border-blue-100'>
                    <div className='text-xs text-blue-600 font-medium'>{t('admin.monthlyRentValue')}</div>
                    <div className='text-lg font-bold text-blue-800'>{formatListingPrice(rentListings.reduce((sum, l) => sum + effectivePrice(l), 0))}</div>
                    <div className='text-xs text-slate-500'>{rentListings.length} properties</div>
                  </div>
                  <div className='p-3 bg-green-50 rounded-lg border border-green-100'>
                    <div className='text-xs text-green-600 font-medium'>{t('admin.withOffers')}</div>
                    <div className='text-lg font-bold text-green-800'>{listings.filter(l => l.offer).length}</div>
                    <div className='text-xs text-slate-500'>{formatListingPrice(listings.filter(l => l.offer && !isPlaceholderPrice(l.regularPrice)).reduce((sum, l) => sum + ((l.regularPrice || 0) - (l.discountPrice || 0)), 0))} discount</div>
                  </div>
                  <div className='p-3 bg-amber-50 rounded-lg border border-amber-100'>
                    <div className='text-xs text-amber-600 font-medium'>{t('admin.avgSalePrice')}</div>
                    <div className='text-lg font-bold text-amber-800'>{(() => {
                      const priced = saleListings.filter(l => !isPlaceholderPrice(l.regularPrice));
                      return priced.length > 0 ? formatListingPrice(Math.round(priced.reduce((sum, l) => sum + effectivePrice(l), 0) / priced.length)) : formatListingPrice(0);
                    })()}</div>
                    <div className='text-xs text-slate-500'>{t('admin.perProperty')}</div>
                  </div>
                </div>
                  );
                })()}

                {/* Category Distribution */}
                <div className='mb-4'>
                  <div className='text-sm font-medium text-slate-700 mb-2'>{t('admin.listingsByCategory')}</div>
                  <div className='space-y-2'>
                    {(() => {
                      const categoryData = listings.reduce((acc, l) => {
                        const cat = l.category || 'uncategorized';
                        if (!acc[cat]) acc[cat] = { count: 0, value: 0 };
                        acc[cat].count++;
                        if (!isPlaceholderPrice(l.regularPrice)) {
                          acc[cat].value += (l.offer && l.discountPrice) ? l.discountPrice : (l.regularPrice || 0);
                        }
                        return acc;
                      }, {});
                      const maxCount = Math.max(...Object.values(categoryData).map(c => c.count), 1);
                      return Object.entries(categoryData).map(([cat, data]) => (
                        <div key={cat} className='flex items-center gap-3'>
                          <div className='w-24 text-xs text-slate-600 truncate capitalize'>{cat}</div>
                          <div className='flex-1 h-6 bg-slate-100 rounded-full overflow-hidden'>
                            <div className='h-full bg-gradient-to-r from-indigo-500 to-violet-600 rounded-full flex items-center justify-end pr-2' style={{ width: `${(data.count / maxCount) * 100}%`, minWidth: '40px' }}>
                              <span className='text-xs text-white font-medium'>{data.count}</span>
                            </div>
                          </div>
                          <div className='w-28 text-xs text-slate-500 text-right'>{formatListingPrice(data.value)}</div>
                        </div>
                      ));
                    })()}
                    {listings.length === 0 && <div className='text-sm text-slate-400 text-center py-4'>{t('admin.noListingsDataAvailable')}</div>}
                  </div>
                </div>

                {/* Property Type Distribution */}
                <div>
                  <div className='text-sm font-medium text-slate-700 mb-2'>{t('admin.listingsByPropertyType')}</div>
                  <div className='flex flex-wrap gap-2'>
                    {(() => {
                      const typeData = listings.reduce((acc, l) => { const type = l.propertyType || 'other'; if (!acc[type]) acc[type] = 0; acc[type]++; return acc; }, {});
                      const variants = ['purple', 'info', 'success', 'warning', 'error', 'brand'];
                      return Object.entries(typeData).map(([type, count], idx) => (
                        <Badge key={type} variant={variants[idx % variants.length]} size='md'>{type}: {count}</Badge>
                      ));
                    })()}
                    {listings.length === 0 && <span className='text-sm text-slate-400'>{t('admin.noData')}</span>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* LISTINGS TAB */}
          {activeTab === 'listings' && (
            <div className='bg-white border border-slate-200 rounded-xl p-5 shadow-sm'>
              <div className='flex items-center justify-between mb-4'>
                <h2 className='text-base font-semibold text-slate-900'>{t('admin.allListings')}</h2>
                <div className='flex gap-2 items-center'>
                  <div className='relative'>
                    <HiOutlineSearch className='absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4' />
                    <input className='pl-8 pr-2 py-2 border border-slate-200 rounded-lg text-sm w-56 focus:outline-none focus:ring-2 focus:ring-slate-300' placeholder={t('admin.searchByNameOrAddress')} value={listSearch} onChange={(e) => setListSearch(e.target.value)} />
                  </div>
                  <button onClick={exportListingsToCSV} className='px-3 py-2 rounded-lg border border-slate-200 text-sm flex items-center gap-2 hover:bg-slate-50 transition-colors text-slate-700'><HiOutlineDownload className='w-4 h-4' />{t('admin.export')}</button>
                  <button onClick={() => setShowImportModal(true)} className='px-3 py-2 rounded-lg border border-slate-200 text-sm flex items-center gap-2 hover:bg-slate-50 transition-colors text-slate-700'><HiOutlineUpload className='w-4 h-4' />{t('admin.import')}</button>
                  <a href='/create-listing' className='px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm inline-flex items-center gap-2 font-medium'><HiOutlinePlus className='w-4 h-4' />{t('admin.addNew')}</a>
                </div>
              </div>
              <div className='overflow-auto'>
                <table className='min-w-full text-sm'>
                  <thead>
                    <tr className='border-b border-slate-200 bg-slate-50'>
                      <th className='text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide'>{t('admin.id')}</th>
                      <th className='text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide'>{t('admin.listing')}</th>
                      <th className='text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide'>{t('admin.category')}</th>
                      <th className='text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide'>{t('admin.type')}</th>
                      <th className='text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide'>{t('admin.price')}</th>
                      <th className='text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide'>{t('admin.offer')}</th>
                      <th className='text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide'>{t('admin.created')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(listingsLoading ? [] : listings).filter((l) => { if (!listSearch.trim()) return true; const q = listSearch.toLowerCase(); return String(l.name || '').toLowerCase().includes(q) || String(l.address || '').toLowerCase().includes(q); }).map((l) => {
                      const id = String(l._id).slice(-4).toUpperCase();
                      const price = (l.offer && l.discountPrice) ? l.discountPrice : l.regularPrice;
                      return (
                        <tr key={l._id} className='border-b border-slate-100 hover:bg-slate-50'>
                          <td className='px-3 py-2.5 text-xs text-slate-500'>#{id}</td>
                          <td className='px-3 py-2.5'>
                            <a href={`/listing/${l._id}`} className='text-slate-800 hover:underline font-medium text-sm'>{l.name}</a>
                            <div className='text-xs text-slate-500 truncate max-w-[360px]'>{l.address}</div>
                          </td>
                          <td className='px-3 py-2.5 text-xs text-slate-600'>{l.category || '-'}</td>
                          <td className='px-3 py-2.5'><Badge variant={l.type === 'rent' ? 'info' : 'purple'}>{l.type || '-'}</Badge></td>
                          <td className='px-3 py-2.5 text-sm text-slate-800'>{formatListingPrice(price)}{l.type === 'rent' && !isPlaceholderPrice(price) ? <span className='text-xs text-slate-500'> / month</span> : null}</td>
                          <td className='px-3 py-2.5'>{l.offer ? <Badge variant='success'>{t('admin.offer')}</Badge> : <Badge variant='slate'>—</Badge>}</td>
                          <td className='px-3 py-2.5 text-xs text-slate-500'>{l.createdAt ? new Date(l.createdAt).toLocaleDateString() : '-'}</td>
                        </tr>
                      );
                    })}
                    {!listingsLoading && listings.length === 0 && <tr><td className='px-3 py-4 text-slate-500 text-center text-sm' colSpan={7}>{t('admin.noListings')}</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {/* CATEGORIES TAB */}
          {activeTab === 'categories' && (
            <div className='bg-white border border-slate-200 rounded-xl p-5 shadow-sm'>
              <div className='flex items-center justify-between mb-4'>
                <h2 className='text-base font-semibold text-slate-900'>{t('admin.categories')}</h2>
                <div className='text-sm text-slate-500'>Total: {categories.length}</div>
              </div>
              {hasPerm('createCategory') && (
                <div className='mb-6 flex gap-3 items-center flex-wrap'>
                  <input type='text' placeholder='Create new category (e.g., DLF)' className='border border-slate-200 px-3 py-2 rounded-lg flex-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300' value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} />
                  <button
                    disabled={creating || !newCategoryName.trim()}
                    onClick={async () => {
                      if (!newCategoryName.trim()) { showError('Please enter a category name'); return; }
                      try {
                        setCreating(true);
                        const data = await apiClient.post('/category/create', { name: newCategoryName.trim() });
                        if (data && data.slug) { setCategories((prev) => [...prev, data]); setNewCategoryName(''); }
                        else { showError(data?.message || 'Failed to create category'); }
                      } catch { showError('Error creating category. Please try again.'); }
                      finally { setCreating(false); }
                    }}
                    className='px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium disabled:opacity-50 transition-colors'
                  >{creating ? 'Creating...' : 'Create Category'}</button>
                </div>
              )}
              <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4'>
                {categories.map((category) => (
                  <div key={category._id} className='border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow'>
                    <h3 className='font-semibold text-slate-800 mb-1 text-sm'>{category.name}</h3>
                    <p className='text-xs text-slate-500 mb-3 font-mono'>{category.slug}</p>
                    <div className='flex items-center justify-between'>
                      <span className='text-xs text-slate-400'>{category.fields?.length || 0} fields</span>
                      {hasPerm('deleteCategory') && (
                        <button onClick={() => setPendingDeleteCategory(category)} className='px-2 py-1 text-xs rounded-lg border border-red-200 text-red-700 hover:bg-red-50 transition-colors'>{t('admin.delete')}</button>
                      )}
                    </div>
                  </div>
                ))}
                {categories.length === 0 && <div className='col-span-full text-center py-8 text-slate-500 text-sm'>{t('admin.noCategoriesFoundCreateYourFirst')}</div>}
              </div>
            </div>
          )}

          {/* PROPERTY TYPES TAB */}
          {isAdmin && activeTab === 'property-types' && (
            <PropertyTypeManagement />
          )}

          {/* SECURITY LOGS TAB */}
          {activeTab === 'logs' && (
            <div className='bg-white border border-slate-200 rounded-xl p-5 shadow-sm'>
              <div className='flex items-center justify-between mb-4'>
                <h2 className='text-base font-semibold text-slate-900'>{t('admin.securityLogs')}</h2>
                <div className='text-sm text-slate-500'>Total: {logsTotal}</div>
              </div>
              <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 mb-3'>
                <input value={logFilters.email} onChange={(e) => setLogFilters({ ...logFilters, email: e.target.value })} placeholder={t('admin.filterEmail')} className='border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300' />
                <select value={logFilters.method} onChange={(e) => setLogFilters({ ...logFilters, method: e.target.value })} className='border border-slate-200 rounded-lg px-3 py-2 text-sm'>
                  <option value='all'>{t('admin.allMethods')}</option>
                  <option value='password'>{t('admin.password')}</option>
                  <option value='signup'>{t('admin.signup')}</option>
                  <option value='other'>{t('admin.other')}</option>
                </select>
                <select value={logFilters.status} onChange={(e) => setLogFilters({ ...logFilters, status: e.target.value })} className='border border-slate-200 rounded-lg px-3 py-2 text-sm'>
                  <option value='all'>{t('admin.allStatus')}</option>
                  <option value='blocked'>{t('admin.blocked')}</option>
                  <option value='invalid'>{t('admin.invalid')}</option>
                  <option value='success'>{t('admin.success')}</option>
                </select>
                <input type='date' value={logFilters.since} onChange={(e) => setLogFilters({ ...logFilters, since: e.target.value })} className='border border-slate-200 rounded-lg px-3 py-2 text-sm' />
                <input type='date' value={logFilters.until} onChange={(e) => setLogFilters({ ...logFilters, until: e.target.value })} className='border border-slate-200 rounded-lg px-3 py-2 text-sm' />
              </div>
              <div className='flex items-center gap-2 mb-4'>
                <button className='px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium transition-colors' onClick={async () => {
                  try {
                    const params = new URLSearchParams();
                    params.set('limit', String(pageSize)); params.set('skip', String(logPage * pageSize));
                    if (logFilters.email.trim()) params.set('email', logFilters.email.trim());
                    if (logFilters.method !== 'all') params.set('method', logFilters.method);
                    if (logFilters.status !== 'all') params.set('status', logFilters.status);
                    if (logFilters.since) params.set('since', logFilters.since);
                    if (logFilters.until) params.set('until', logFilters.until);
                    const data = await apiClient.get(`/user/security/logs?${params.toString()}`);
                    setLogs(Array.isArray(data?.logs) ? data.logs : []); setLogsTotal(Number(data?.total) || 0);
                  } catch (error) { console.error(error); }
                }}>{t('admin.applyFilters')}</button>
                <button className='px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm transition-colors' onClick={async () => {
                  try {
                    setLogFilters({ method: 'all', status: 'all', email: '', since: '', until: '' }); setLogPage(0);
                    const data = await apiClient.get(`/user/security/logs?limit=${pageSize}`);
                    setLogs(Array.isArray(data?.logs) ? data.logs : []); setLogsTotal(Number(data?.total) || 0);
                  } catch (error) { console.error(error); }
                }}>{t('admin.reset')}</button>
                <label className='flex items-center gap-2 text-sm text-slate-600 ml-2'>
                  <input type='checkbox' checked={onlyPhoneChanges} onChange={(e) => setOnlyPhoneChanges(e.target.checked)} />{t('admin.onlyPhoneChanges')}</label>
                <div className='ml-auto flex items-center gap-2'>
                  <button disabled={logPage === 0} onClick={() => setLogPage((p) => Math.max(0, p-1))} className='px-3 py-1.5 rounded-lg border border-slate-200 text-sm disabled:opacity-50 hover:bg-slate-50'>{t('admin.prev')}</button>
                  <span className='text-sm text-slate-600'>Page {logPage + 1} of {Math.max(1, Math.ceil(logsTotal / pageSize))}</span>
                  <button disabled={(logPage+1) * pageSize >= logsTotal} onClick={() => setLogPage((p) => p+1)} className='px-3 py-1.5 rounded-lg border border-slate-200 text-sm disabled:opacity-50 hover:bg-slate-50'>{t('admin.next')}</button>
                </div>
              </div>
              <div className='overflow-auto max-h-96'>
                <table className='min-w-full text-sm'>
                  <thead>
                    <tr className='border-b border-slate-200 bg-slate-50'>
                      <th className='text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide'>{t('admin.time')}</th>
                      <th className='text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide'>{t('admin.email')}</th>
                      <th className='text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide'>{t('admin.method')}</th>
                      <th className='text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide'>{t('admin.status')}</th>
                      <th className='text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide'>{t('admin.reason')}</th>
                      <th className='text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide'>{t('admin.ip')}</th>
                      <th className='text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide'>{t('admin.userAgent')}</th>
                      <th className='text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide'>{t('admin.path')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(onlyPhoneChanges ? logs.filter((l) => String(l.reason || '').startsWith('phone_changed:')) : logs).map((log) => {
                      const badgeVariant = log.status === 'blocked' ? 'error' : log.status === 'success' ? 'success' : 'warning';
                      return (
                        <tr key={log._id} className='border-b border-slate-100 hover:bg-slate-50'>
                          <td className='px-3 py-2 whitespace-nowrap text-xs text-slate-600'>{new Date(log.createdAt).toLocaleString()}</td>
                          <td className='px-3 py-2 break-all text-xs'>{log.email}</td>
                          <td className='px-3 py-2 capitalize text-xs'>{log.method}</td>
                          <td className='px-3 py-2'><Badge variant={badgeVariant}>{log.status}</Badge></td>
                          <td className='px-3 py-2 text-xs'>{log.reason}</td>
                          <td className='px-3 py-2 text-xs'>{log.ip}</td>
                          <td className='px-3 py-2 text-xs max-w-[280px] truncate' title={log.userAgent}>{log.userAgent}</td>
                          <td className='px-3 py-2 text-xs'>{log.path}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {/* OWNERS TAB */}
          {activeTab === 'owners' && (
            <div className='bg-white border border-slate-200 rounded-xl p-5 shadow-sm'>
              <div className='flex items-center justify-between mb-4'>
                <h2 className='text-base font-semibold text-slate-900'>{t('admin.owners')}</h2>
                {ownersLoading && <span className='text-sm text-slate-400'>{t('admin.loading')}</span>}
              </div>
              {hasPerm('createOwner') && (
                <>
                  <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3'>
                    <input className='border border-slate-200 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-300' placeholder={t('admin.ownerName')} value={newOwner.name} onChange={(e) => setNewOwner({ ...newOwner, name: e.target.value })} />
                    <input className='border border-slate-200 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-300' placeholder={t('admin.email')} value={newOwner.email} onChange={(e) => setNewOwner({ ...newOwner, email: e.target.value })} />
                    <input className='border border-slate-200 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-300' placeholder={t('admin.phone')} value={newOwner.phone} onChange={(e) => setNewOwner({ ...newOwner, phone: e.target.value })} />
                    <input className='border border-slate-200 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-300' placeholder={t('admin.company')} value={newOwner.companyName} onChange={(e) => setNewOwner({ ...newOwner, companyName: e.target.value })} />
                  </div>
                  <div className='mb-4'>
                    <button onClick={createOwner} className='px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium transition-colors'>{t('admin.createOwner')}</button>
                  </div>
                </>
              )}
              <div className='mb-4 flex justify-end'>
                <input className='border border-slate-200 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-300' placeholder={t('admin.searchOwners')} value={ownersQuery} onChange={(e) => setOwnersQuery(e.target.value)} />
              </div>
              <div className='overflow-auto'>
                <table className='min-w-full text-sm'>
                  <thead>
                    <tr className='border-b border-slate-200 bg-slate-50'>
                      <th className='text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide'>{t('admin.name')}</th>
                      <th className='text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide'>{t('admin.company')}</th>
                      <th className='text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide'>{t('admin.email')}</th>
                      <th className='text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide'>{t('admin.phone')}</th>
                      <th className='text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide'>{t('admin.active')}</th>
                      <th className='text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide'>{t('admin.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {owners.filter((o) => { if (!ownersQuery.trim()) return true; const q = ownersQuery.toLowerCase(); return String(o.name || '').toLowerCase().includes(q) || String(o.email || '').toLowerCase().includes(q) || String(o.companyName || '').toLowerCase().includes(q); }).map((o) => (
                      <tr key={o._id} className='border-b border-slate-100 hover:bg-slate-50'>
                        <td className='px-3 py-2.5 text-sm font-medium text-slate-900'>{o.name}</td>
                        <td className='px-3 py-2.5 text-sm text-slate-600'>{o.companyName || '-'}</td>
                        <td className='px-3 py-2.5 text-sm text-slate-600'>{o.email || '-'}</td>
                        <td className='px-3 py-2.5 text-sm text-slate-600'>{o.phone || '-'}</td>
                        <td className='px-3 py-2.5'><Badge variant={o.active ? 'success' : 'slate'}>{o.active ? 'Active' : 'Inactive'}</Badge></td>
                        <td className='px-3 py-2.5'>
                          <div className='flex items-center gap-2'>
                            {hasPerm('updateOwner') && <button onClick={() => toggleOwnerActive(o)} className='px-2 py-1 text-xs rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 transition-colors'>{o.active ? 'Deactivate' : 'Activate'}</button>}
                            {hasPerm('deleteOwner') && <button onClick={() => deleteOwnerById(o._id)} className='px-2 py-1 text-xs rounded-lg border border-red-200 text-red-700 hover:bg-red-50 transition-colors'>{t('admin.delete')}</button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {owners.length === 0 && <tr><td className='px-3 py-4 text-slate-500 text-center text-sm' colSpan={6}>{t('admin.noOwnersYet')}</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {/* USERS TAB */}
          {activeTab === 'users' && (
            <div className='space-y-5'>
              <div className='bg-white border border-slate-200 rounded-xl p-5 shadow-sm'>
                <h2 className='text-base font-semibold text-slate-900 mb-4'>{t('admin.createEmployee')}</h2>
                <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                  <input className='border border-slate-200 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-300' placeholder={t('admin.username')} autoComplete='off' value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} />
                  <input className='border border-slate-200 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-300' placeholder={t('admin.email')} type='email' autoComplete='off' value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
                  {/* No password field: the new employee receives a single-use
                      invite link and chooses their own. An admin typing a
                      password meant the product had to transmit it to them. */}
                  <input className='border border-slate-200 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-300' placeholder={t('admin.phoneMobileNumber')} type='tel' autoComplete='off' value={newUser.phone} onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })} />
                  <div className='flex flex-wrap gap-2 items-center col-span-full'>
                    {categories.map((c) => (
                      <label key={c._id} className='flex items-center gap-2 text-sm text-slate-700'>
                        <input type='checkbox' checked={newUser.assignedCategories.includes(c.slug)} onChange={(e) => { const next = new Set(newUser.assignedCategories); if (e.target.checked) next.add(c.slug); else next.delete(c.slug); setNewUser({ ...newUser, assignedCategories: Array.from(next) }); }} />
                        {c.name}
                      </label>
                    ))}
                  </div>
                </div>
                <div className='mt-4'>
                  <button disabled={creating} onClick={async () => { try { setCreating(true); const data = await apiClient.post('/user/employee', newUser); if (data && data._id) { setUsers((prev) => [data, ...prev]); setNewUser({ username: '', email: '', phone: '', assignedCategories: [] }); } } catch (error) { console.error(error); } finally { setCreating(false); } }} className='px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium disabled:opacity-50 transition-colors'>
                    {creating ? 'Creating...' : 'Create Employee'}
                  </button>
                </div>
              </div>

              <div className='bg-white border border-slate-200 rounded-xl p-5 shadow-sm'>
                <div className='flex items-center justify-between mb-4'>
                  <h2 className='text-base font-semibold text-slate-900'>{t('admin.allUsers')}</h2>
                  <div className='flex items-center gap-4'>
                    <div className='relative'>
                      <HiOutlineSearch className='absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4' />
                      <input className='pl-8 pr-2 py-2 border border-slate-200 rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-slate-300' placeholder={t('admin.searchUsersByNameOrEmail')} value={usersQuery} onChange={(e) => setUsersQuery(e.target.value)} />
                    </div>
                    <div className='text-sm text-slate-500'>Total: {users.length} users</div>
                  </div>
                </div>
                <div className='overflow-auto'>
                  <table className='min-w-full text-sm'>
                    <thead>
                      <tr className='border-b border-slate-200 bg-slate-50'>
                        <th className='text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide'>{t('admin.user')}</th>
                        <th className='text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide'>{t('admin.email')}</th>
                        <th className='text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide'>{t('admin.role')}</th>
                        <th className='text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide'>{t('admin.categories')}</th>
                        <th className='text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide'>{t('admin.status')}</th>
                        <th className='text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide'>{t('admin.created')}</th>
                        <th className='text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide'>{t('admin.actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.filter((user) => { if (!usersQuery.trim()) return true; const q = usersQuery.toLowerCase(); return String(user.username || '').toLowerCase().includes(q) || String(user.email || '').toLowerCase().includes(q) || String(user.phone || '').toLowerCase().includes(q); }).map((user) => (
                        <tr key={user._id} className='border-b border-slate-100 hover:bg-slate-50'>
                          <td className='px-3 py-3'>
                            <div className='flex items-center gap-3'>
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${user.role === 'admin' ? 'bg-rose-100' : user.role === 'employee' ? 'bg-indigo-100' : user.role === 'seller' ? 'bg-emerald-100' : 'bg-slate-200'}`}>
                                <span className={`text-sm font-medium ${user.role === 'admin' ? 'text-rose-600' : user.role === 'employee' ? 'text-indigo-600' : user.role === 'seller' ? 'text-emerald-600' : 'text-slate-600'}`}>{user.username ? user.username.charAt(0).toUpperCase() : 'U'}</span>
                              </div>
                              <div>
                                <div className='font-medium text-slate-900 text-sm'>{user.username || 'N/A'}</div>
                                <div className='text-xs text-slate-400'>ID: {String(user._id).slice(-6)}</div>
                              </div>
                            </div>
                          </td>
                          <td className='px-3 py-3'>
                            <div className='text-sm text-slate-900'>{user.email}</div>
                            {user.phone && <div className='text-xs text-slate-500'>{user.phone}</div>}
                          </td>
                          <td className='px-3 py-3'><Badge variant={user.role === 'admin' ? 'error' : user.role === 'employee' ? 'brand' : user.role === 'seller' ? 'success' : 'default'}>{user.role || 'buyer'}</Badge></td>
                          <td className='px-3 py-3'>
                            <div className='flex flex-wrap gap-1'>
                              {(user.assignedCategories || []).map((cat) => <Badge key={cat} variant='brand'>{cat}</Badge>)}
                              {(!user.assignedCategories || user.assignedCategories.length === 0) && <span className='text-xs text-slate-400'>{t('admin.none')}</span>}
                            </div>
                          </td>
                          <td className='px-3 py-3'><Badge variant={user.status === 'active' ? 'success' : user.status === 'suspended' ? 'warning' : 'error'}>{user.status || 'active'}</Badge></td>
                          <td className='px-3 py-3 text-xs text-slate-500'>{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}</td>
                          <td className='px-3 py-3'>
                            <div className='flex items-center gap-2'>
                              <button onClick={() => openUserManageModal(user)} className='px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors'>{t('admin.manage')}</button>
                              {user.role !== 'admin' && (
                                <button onClick={() => toggleUserStatus(user._id, user.status || 'active')} className={`px-2 py-1 text-xs rounded-lg border transition-colors ${(user.status || 'active') === 'active' ? 'border-orange-200 text-orange-600 hover:bg-orange-50' : 'border-green-200 text-green-600 hover:bg-green-50'}`}>
                                  {(user.status || 'active') === 'active' ? 'Deactivate' : 'Reactivate'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {users.length === 0 && <tr><td className='px-3 py-4 text-slate-500 text-center text-sm' colSpan={7}>{t('admin.noUsersFound')}</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ROLES TAB */}
          {activeTab === 'roles' && isAdmin && (
            <RoleManagement />
          )}
        </>
      )}

      {/* User Manage Modal */}
      {showUserManageModal && managingUser && (
        <div className='fixed inset-0 !mt-0 bg-black/50 flex items-center justify-center z-50'>
          <div className='bg-white rounded-2xl shadow-xl w-full max-w-3xl mx-4 max-h-[85vh] overflow-hidden'>
            <div className='p-6 border-b flex items-start justify-between gap-4'>
              <div>
                <div className='text-xs uppercase tracking-wide text-slate-500'>{t('admin.userDetails')}</div>
                <div className='text-xl font-semibold text-slate-900'>{managingUser.username || 'N/A'}</div>
                <div className='text-sm text-slate-500'>{managingUser.email}</div>
              </div>
              <button onClick={closeUserManageModal} disabled={saving} className='px-3 py-2 rounded-lg border border-slate-200 text-sm hover:bg-slate-50 disabled:opacity-50 text-slate-700'>{t('admin.close')}</button>
            </div>

            <div className='p-6 overflow-auto'>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                <div className='rounded-xl border border-slate-200 p-4'>
                  <div className='text-sm font-semibold text-slate-800 mb-3'>{t('admin.overview')}</div>
                  <div className='space-y-2 text-sm'>
                    <div className='flex items-center justify-between gap-3'><div className='text-slate-500'>{t('admin.userId')}</div><div className='font-mono text-xs text-slate-800'>{managingUser._id}</div></div>
                    <div className='flex items-center justify-between gap-3'><div className='text-slate-500'>{t('admin.phone')}</div><div className='text-slate-800'>{managingUser.phone || '-'}</div></div>
                    <div className='flex items-center justify-between gap-3'><div className='text-slate-500'>{t('admin.status')}</div><div className='text-slate-800'>{managingUser.status || 'active'}</div></div>
                    <div className='flex items-center justify-between gap-3'><div className='text-slate-500'>{t('admin.created')}</div><div className='text-xs text-slate-800'>{managingUser.createdAt ? new Date(managingUser.createdAt).toLocaleString() : 'N/A'}</div></div>
                    <div className='flex items-center justify-between gap-3'><div className='text-slate-500'>{t('admin.role')}</div><div className='text-slate-800'>{managingUser.role || 'buyer'}</div></div>
                  </div>
                  <div className='mt-4'>
                    {managingUser.role !== 'admin' && (
                      <button onClick={async () => { await toggleUserStatus(managingUser._id, managingUser.status || 'active'); const nextStatus = (managingUser.status || 'active') === 'active' ? 'inactive' : 'active'; setManagingUser((prev) => (prev ? { ...prev, status: nextStatus } : prev)); }} disabled={saving} className={`px-3 py-2 rounded-lg border text-sm disabled:opacity-50 transition-colors ${(managingUser.status || 'active') === 'active' ? 'border-orange-200 text-orange-700 hover:bg-orange-50' : 'border-green-200 text-green-700 hover:bg-green-50'}`}>
                        {(managingUser.status || 'active') === 'active' ? 'Deactivate' : 'Reactivate'}
                      </button>
                    )}
                  </div>
                </div>

                <div className='rounded-xl border border-slate-200 p-4'>
                  <div className='text-sm font-semibold text-slate-800 mb-3'>{t('admin.updateProperties')}</div>
                  <div className='space-y-4'>
                    <div>
                      <div className='text-xs font-medium text-slate-600 mb-1'>{t('admin.role')}</div>
                      {managingUser.role === 'admin' ? (
                        <div>
                          <div className='w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-slate-100 text-slate-500 cursor-not-allowed'>{t('admin.admin')}</div>
                          <p className='text-xs text-amber-600 mt-1'>{t('admin.adminRolesCannotBeChanged')}</p>
                        </div>
                      ) : (
                        <select value={manageRole} onChange={(e) => setManageRole(e.target.value)} disabled={saving} className='w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300'>

                          <option value='buyer'>{t('admin.buyer')}</option>
                          <option value='seller'>{t('admin.seller')}</option>
                          <option value='employee'>{t('admin.employee')}</option>
                        </select>
                      )}
                    </div>
                    <div>
                      <div className='text-xs font-medium text-slate-600 mb-2'>{t('admin.assignedCategories')}</div>
                      <div className='grid grid-cols-2 sm:grid-cols-3 gap-2'>
                        {categories.map((c) => (
                          <label key={c._id} className='flex items-center gap-2 text-sm text-slate-700'>
                            <input type='checkbox' checked={manageCategories.includes(c.slug)} onChange={() => toggleManageCategory(c.slug)} disabled={saving} />
                            <span>{c.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className='flex justify-end gap-3'>
                      <button onClick={closeUserManageModal} disabled={saving} className='px-4 py-2 rounded-lg border border-slate-200 text-sm hover:bg-slate-50 disabled:opacity-50 text-slate-700'>{t('admin.cancel')}</button>
                      <button onClick={saveManagedUser} disabled={saving} className='px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium disabled:opacity-50 transition-colors'>{saving ? 'Saving…' : 'Save Changes'}</button>
                    </div>
                  </div>
                </div>
              </div>

              {isAdmin && managingUser.role === 'employee' && (
                <div className='mt-6 rounded-xl border border-slate-200 p-4'>
                  <div className='text-sm font-semibold text-slate-800 mb-3'>{t('admin.resetPassword')}</div>
                  <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                    <input className='px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300' type='password' placeholder={t('admin.newPassword')} value={managePassword} onChange={(e) => setManagePassword(e.target.value)} disabled={saving} />
                    <input className='px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300' type='password' placeholder={t('admin.confirmNewPassword')} value={managePasswordConfirm} onChange={(e) => setManagePasswordConfirm(e.target.value)} disabled={saving} />
                  </div>
                  <div className='mt-3 flex justify-end'>
                    <button onClick={saveManagedPassword} disabled={saving || !managePassword} className='px-4 py-2 rounded-lg border border-slate-200 text-sm hover:bg-slate-50 disabled:opacity-50 text-slate-700 transition-colors'>{saving ? 'Updating…' : 'Update Password'}</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Import Listings Modal */}
      {showImportModal && (
        <div className='fixed inset-0 !mt-0 bg-black/50 flex items-center justify-center z-50'>
          <div className='bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden'>
            <div className='p-6 border-b'>
              <div className='flex items-start justify-between gap-4'>
                <div>
                  <h3 className='text-base font-semibold text-slate-900'>{t('admin.importListingsFromCsv')}</h3>
                  <p className='text-sm text-slate-500 mt-0.5'>{t('admin.uploadACsvFileToBulk')}</p>
                </div>
                <button onClick={() => { setShowImportModal(false); setImportFile(null); setImportResults(null); }} className='p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors'>
                  <HiX className='w-5 h-5' />
                </button>
              </div>
            </div>

            <div className='p-6'>
              <div className='mb-4 p-4 bg-slate-50 rounded-lg border border-slate-200'>
                <p className='text-sm text-slate-600 mb-2'>{t('admin.downloadASampleCsvTemplateTo')}</p>
                <button onClick={downloadSampleCSV} className='text-sm text-slate-700 hover:text-slate-900 font-medium flex items-center gap-1.5 transition-colors'>
                  <HiOutlineDownload className='w-4 h-4' />{t('admin.downloadSampleTemplate')}</button>
              </div>

              <div className='mb-4'>
                <label className='block text-sm font-medium text-slate-700 mb-2'>{t('admin.selectCsvFile')}</label>
                <input type='file' accept='.csv' onChange={(e) => setImportFile(e.target.files[0])} className='block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200' />
                {importFile && <p className='mt-2 text-sm text-slate-500'>Selected: {importFile.name}</p>}
              </div>

              {importResults && (
                <div className='mt-4 p-4 rounded-lg border border-slate-200'>
                  <h4 className='font-medium text-slate-800 mb-2 text-sm'>{t('admin.importResults')}</h4>
                  <div className='grid grid-cols-2 gap-4'>
                    <div className='p-3 bg-green-50 rounded-lg border border-green-100'>
                      <div className='text-green-800 font-medium'>{importResults.success?.length || 0}</div>
                      <div className='text-green-600 text-xs'>{t('admin.successfullyImported')}</div>
                    </div>
                    <div className='p-3 bg-red-50 rounded-lg border border-red-100'>
                      <div className='text-red-800 font-medium'>{importResults.failed?.length || 0}</div>
                      <div className='text-red-600 text-xs'>{t('admin.failedToImport')}</div>
                    </div>
                  </div>
                  {importResults.failed && importResults.failed.length > 0 && (
                    <div className='mt-3'>
                      <p className='text-sm font-medium text-slate-700 mb-1'>{t('admin.errors')}</p>
                      <div className='max-h-32 overflow-y-auto text-xs text-red-600 bg-red-50 rounded p-2'>
                        {importResults.failed.map((err, idx) => <div key={idx} className='mb-1'>Row {err.row}: {err.error}</div>)}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className='p-6 border-t bg-slate-50 flex justify-end gap-3'>
              <button onClick={() => { setShowImportModal(false); setImportFile(null); setImportResults(null); }} disabled={importing} className='px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-50 transition-colors'>
                {importResults ? 'Close' : 'Cancel'}
              </button>
              {!importResults && (
                <button onClick={handleImportFile} disabled={importing || !importFile} className='px-4 py-2 text-sm rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium disabled:opacity-50 flex items-center gap-2 transition-colors'>
                  {importing ? (
                    <>
                      <svg className='animate-spin w-4 h-4' fill='none' viewBox='0 0 24 24'>
                        <circle className='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' strokeWidth='4'></circle>
                        <path className='opacity-75' fill='currentColor' d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'></path>
                      </svg>{t('admin.importing')}</>
                  ) : (
                    <><HiOutlineUpload className='w-4 h-4' />{t('admin.importListings')}</>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDeleteCategory}
        title={t('admin.deleteThisCategory')}
        description={t('admin.thisCannotBeUndone')}
        confirmLabel={t('admin.delete')}
        onConfirm={async () => {
          if (!pendingDeleteCategory) return;
          const cat = pendingDeleteCategory;
          setPendingDeleteCategory(null);
          try {
            await apiClient.delete(`/category/delete/${cat._id}`);
            setCategories((prev) => prev.filter((c) => c._id !== cat._id));
          } catch (error) {
            console.error('Error deleting category:', error);
          }
        }}
        onCancel={() => setPendingDeleteCategory(null)}
      />
    </div>
  );
}

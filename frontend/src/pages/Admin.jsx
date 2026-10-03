import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { io } from 'socket.io-client';
import {
  HiViewGrid, HiCollection, HiTag, HiTemplate, HiUserGroup, HiUsers, HiKey, HiShieldCheck,
} from 'react-icons/hi';
import { SOCKET_URL } from '../config/socket';
import { apiClient } from '../utils/http';
import { PageHeader, Tabs, TabPanel } from '../design-system';
import { useBuyerView } from '../contexts/BuyerViewContext';
import { usePermissions } from '../contexts/PermissionsContext';
import { useTranslation } from 'react-i18next';
import RoleManagement from '../components/RoleManagement';
import PropertyTypeManagement from './PropertyTypeManagement';
import AdminOverview from '../components/admin/AdminOverview';
import AdminListings from '../components/admin/AdminListings';
import AdminCategories from '../components/admin/AdminCategories';
import AdminOwners from '../components/admin/AdminOwners';
import AdminUsers from '../components/admin/AdminUsers';
import AdminLogs from '../components/admin/AdminLogs';

/**
 * The admin area: overview, properties, catalogue, owners, team, roles and the
 * sign-in log. This file owns what several sections share — the tab (kept in the
 * URL, so a reload or a pasted link lands on the same section), and the lists the
 * overview also counts. Each section owns its own filters, table and dialogs.
 */
export default function Admin() {
  const { t } = useTranslation();
  const { currentUser } = useSelector((state) => state.user);
  const { isBuyerViewMode } = useBuyerView();
  const { can: hasPerm, ready: permReady } = usePermissions();
  const [searchParams, setSearchParams] = useSearchParams();

  const isAdmin = currentUser?.role === 'admin';
  const restricted = Boolean(isBuyerViewMode);
  const canViewOwners = hasPerm('viewOwners');
  const canManageCategories = hasPerm('createCategory') || hasPerm('deleteCategory') || hasPerm('updateCategory');

  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [owners, setOwners] = useState([]);
  const [ownersLoading, setOwnersLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);

  // Core lists, once permissions are known.
  useEffect(() => {
    if (restricted || !permReady) return undefined;
    let cancelled = false;
    (async () => {
      const [cats, own, usr] = await Promise.allSettled([
        apiClient.get('/category/list', { silent: true }),
        canViewOwners ? apiClient.get('/owner/list', { silent: true }) : Promise.resolve([]),
        isAdmin ? apiClient.get('/user/list', { silent: true }) : Promise.resolve([]),
      ]);
      if (cancelled) return;
      const list = (r) => (r.status === 'fulfilled' && Array.isArray(r.value) ? r.value : []);
      setCategories(list(cats));
      setOwners(list(own));
      setUsers(list(usr));
      setOwnersLoading(false);
      setUsersLoading(false);
    })();
    return () => { cancelled = true; };
  }, [restricted, permReady, canViewOwners, isAdmin]);

  // Owners can change from anywhere (another admin, an import); follow along.
  useEffect(() => {
    if (restricted || !canViewOwners) return undefined;
    const socket = io(SOCKET_URL, { withCredentials: true, transports: ['websocket', 'polling'] });
    const refresh = async () => {
      try {
        const res = await apiClient.get('/owner/list', { silent: true });
        setOwners(Array.isArray(res) ? res : []);
      } catch (_) { /* the list simply stays as it was */ }
    };
    socket.on('owners:changed', refresh);
    return () => { socket.off('owners:changed', refresh); socket.close(); };
  }, [restricted, canViewOwners]);

  const tabs = useMemo(() => [
    { value: 'overview', label: 'Overview', icon: HiViewGrid },
    { value: 'listings', label: 'Properties', icon: HiCollection },
    canManageCategories && { value: 'categories', label: 'Categories', icon: HiTag, count: categories.length },
    isAdmin && { value: 'property-types', label: 'Property types', icon: HiTemplate },
    canViewOwners && { value: 'owners', label: 'Owners', icon: HiUserGroup, count: owners.length },
    isAdmin && { value: 'users', label: 'Team', icon: HiUsers, count: users.length },
    isAdmin && { value: 'roles', label: 'Roles & permissions', icon: HiKey },
    isAdmin && { value: 'logs', label: 'Security log', icon: HiShieldCheck },
  ].filter(Boolean), [canManageCategories, isAdmin, canViewOwners, categories.length, owners.length, users.length]);

  const requested = searchParams.get('tab') || 'overview';
  // A tab the person cannot see (or a mistyped one) falls back instead of rendering nothing.
  const tab = tabs.some((x) => x.value === requested) ? requested : 'overview';

  // `?invite=1` — the overview's quick action — opens the invite dialog once.
  useEffect(() => {
    if (searchParams.get('invite') !== '1') return;
    if (isAdmin) setInviteOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('invite');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, isAdmin]);

  const goTo = useCallback((next, extra = {}) => {
    setSearchParams({ tab: next, ...extra });
  }, [setSearchParams]);

  if (restricted) {
    return (
      <div className='bg-white border border-slate-200 rounded-xl p-10 text-center shadow-sm'>
        <h1 className='text-xl font-bold text-slate-900 mb-2'>{t('admin.accessRestricted')}</h1>
        <p className='text-sm text-slate-500 mb-1'>{t('admin.adminFeaturesAreNotAvailableIn')}</p>
        <p className='text-xs text-slate-500'>{t('admin.exitBuyerViewModeToAccess')}</p>
      </div>
    );
  }

  return (
    <div className='space-y-5'>
      <PageHeader
        title={isAdmin ? 'Administration' : 'Workspace'}
        description={isAdmin ? 'Your team, catalogue and security, in one place.' : 'Properties, categories and owners.'}
      />

      <Tabs id='admin' items={tabs} value={tab} onChange={(v) => goTo(v)} />

      <TabPanel tabsId='admin' value='overview' active={tab}>
        <AdminOverview users={users} owners={owners} isAdmin={isAdmin} canViewOwners={canViewOwners} goTo={goTo} />
      </TabPanel>

      <TabPanel tabsId='admin' value='listings' active={tab}>
        <AdminListings canCreate={hasPerm('createListing') || isAdmin} />
      </TabPanel>

      <TabPanel tabsId='admin' value='categories' active={tab}>
        <AdminCategories
          categories={categories}
          setCategories={setCategories}
          canCreate={hasPerm('createCategory')}
          canUpdate={hasPerm('updateCategory') || isAdmin}
          canDelete={hasPerm('deleteCategory')}
        />
      </TabPanel>

      <TabPanel tabsId='admin' value='property-types' active={tab}>
        <PropertyTypeManagement embedded />
      </TabPanel>

      <TabPanel tabsId='admin' value='owners' active={tab}>
        <AdminOwners
          owners={owners}
          setOwners={setOwners}
          loading={ownersLoading}
          canCreate={hasPerm('createOwner')}
          canUpdate={hasPerm('updateOwner')}
          canDelete={hasPerm('deleteOwner')}
        />
      </TabPanel>

      <TabPanel tabsId='admin' value='users' active={tab}>
        <AdminUsers
          users={users}
          setUsers={setUsers}
          categories={categories}
          currentUser={currentUser}
          loading={usersLoading}
          inviteOpen={inviteOpen}
          setInviteOpen={setInviteOpen}
        />
      </TabPanel>

      <TabPanel tabsId='admin' value='roles' active={tab}>
        <RoleManagement />
      </TabPanel>

      <TabPanel tabsId='admin' value='logs' active={tab}>
        <AdminLogs />
      </TabPanel>
    </div>
  );
}

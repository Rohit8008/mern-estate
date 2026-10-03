import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  HiCollection, HiUserGroup, HiUsers, HiShieldCheck, HiCheckCircle, HiExclamation,
  HiMail, HiBan, HiPlus, HiUserAdd, HiUpload, HiKey, HiDocumentText, HiCog, HiArrowRight,
} from 'react-icons/hi';
import { apiClient } from '../../utils/http';
import { formatCompactCurrency } from '../../utils/currency';
import { listingStatusLabel } from '../../utils/listingStatus';
import { KpiCard, Badge, Skeleton } from '../../design-system';
import { LOG_STATUS, describeReason, timeAgo } from './adminFormat';

const unwrap = (res) => res?.data ?? res ?? {};

// Complete literal classes — Tailwind cannot see an interpolated colour.
const STATUS_BAR = {
  available: 'bg-emerald-500',
  under_negotiation: 'bg-amber-500',
  sold: 'bg-slate-500',
  rented: 'bg-blue-500',
};

function Panel({ title, description, action, children, className = '' }) {
  return (
    <section className={`bg-white border border-slate-200 rounded-xl shadow-sm p-5 ${className}`}>
      <div className='flex items-start justify-between gap-3 mb-4'>
        <div className='min-w-0'>
          <h2 className='text-sm font-semibold text-slate-900'>{title}</h2>
          {description && <p className='text-xs text-slate-500 mt-0.5'>{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * The landing view of the admin area: how big the workspace is, what needs a
 * person's attention, where to go next. Counts come from the facets endpoint
 * (the whole portfolio), never from a page of listings.
 */
export default function AdminOverview({ users, owners, isAdmin, canViewOwners, goTo }) {
  const [facets, setFacets] = useState(null);
  const [sale, setSale] = useState(null);
  const [rent, setRent] = useState(null);
  const [blocked24h, setBlocked24h] = useState(null);
  const [recent, setRecent] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const day = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const [all, s, r, blocked, logs] = await Promise.allSettled([
        apiClient.get('/listing/facets', { silent: true }),
        apiClient.get('/listing/facets?type=sale', { silent: true }),
        apiClient.get('/listing/facets?type=rent', { silent: true }),
        isAdmin ? apiClient.get(`/user/security/logs?status=blocked&since=${encodeURIComponent(day)}&limit=1`, { silent: true }) : Promise.resolve(null),
        isAdmin ? apiClient.get('/user/security/logs?limit=6', { silent: true }) : Promise.resolve(null),
      ]);
      if (!alive) return;
      const ok = (x) => (x.status === 'fulfilled' ? x.value : null);
      setFacets(unwrap(ok(all)));
      setSale(unwrap(ok(s)));
      setRent(unwrap(ok(r)));
      setBlocked24h(ok(blocked) ? Number(ok(blocked).total) || 0 : null);
      setRecent(ok(logs) ? ok(logs).logs || [] : null);
    })();
    return () => { alive = false; };
  }, [isAdmin]);

  const loading = facets === null;
  const totalListings = facets?.totals?.count ?? 0;
  const saleCount = facets?.type?.sale ?? 0;
  const rentCount = facets?.type?.rent ?? 0;
  const activeUsers = users.filter((u) => (u.status || 'active') === 'active').length;
  const pendingInvites = users.filter((u) => u.invitePending).length;
  const inactiveUsers = users.filter((u) => u.status && u.status !== 'active').length;

  const attention = [
    pendingInvites > 0 && { icon: HiMail, tone: 'amber', text: `${pendingInvites} invitation${pendingInvites === 1 ? '' : 's'} not accepted yet`, tab: 'users', cta: 'Review' },
    blocked24h > 0 && { icon: HiExclamation, tone: 'rose', text: `${blocked24h} blocked sign-in attempt${blocked24h === 1 ? '' : 's'} in the last 24 hours`, tab: 'logs', cta: 'Investigate' },
    inactiveUsers > 0 && { icon: HiBan, tone: 'slate', text: `${inactiveUsers} deactivated account${inactiveUsers === 1 ? '' : 's'}`, tab: 'users', cta: 'View' },
  ].filter(Boolean);
  const TONE = {
    amber: 'bg-amber-50 text-amber-600 ring-amber-100',
    rose: 'bg-rose-50 text-rose-600 ring-rose-100',
    slate: 'bg-slate-100 text-slate-600 ring-slate-200',
  };

  const statusEntries = Object.entries(facets?.status || {});
  const statusTotal = statusEntries.reduce((n, [, c]) => n + c, 0) || 1;
  const categoryEntries = Object.entries(facets?.category || {}).slice(0, 6);
  const maxCategory = Math.max(1, ...categoryEntries.map(([, c]) => c));

  const actions = [
    isAdmin && { icon: HiUserAdd, label: 'Invite an employee', onClick: () => goTo('users', { invite: '1' }) },
    { icon: HiPlus, label: 'Add a property', to: '/create-listing' },
    { icon: HiUpload, label: 'Import from Excel', to: '/admin/import' },
    isAdmin && { icon: HiKey, label: 'Roles & permissions', onClick: () => goTo('roles') },
    isAdmin && { icon: HiDocumentText, label: 'Audit log', to: '/admin/audit-log' },
    { icon: HiCog, label: 'Workspace settings', to: '/settings' },
  ].filter(Boolean);
  const actionClass = 'flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500';

  return (
    <div className='space-y-5'>
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${isAdmin ? 'xl:grid-cols-4' : 'xl:grid-cols-2'} gap-4`}>
        <KpiCard
          title='Properties'
          icon={HiCollection}
          color='blue'
          value={loading ? '…' : totalListings}
          sub={loading ? undefined : `${saleCount} for sale · ${rentCount} for rent`}
          onClick={() => goTo('listings')}
        />
        {canViewOwners && (
          <KpiCard title='Owners' icon={HiUserGroup} color='emerald' value={owners.length} sub={owners.length ? `${owners.filter((o) => o.active).length} active` : 'None added yet'} onClick={() => goTo('owners')} />
        )}
        {isAdmin && (
          <KpiCard
            title='Team'
            icon={HiUsers}
            color='purple'
            value={users.length}
            sub={`${activeUsers} active${pendingInvites ? ` · ${pendingInvites} invited` : ''}`}
            onClick={() => goTo('users')}
          />
        )}
        {isAdmin && (
          <KpiCard
            title='Sign-in alerts'
            icon={HiShieldCheck}
            color={blocked24h > 0 ? 'rose' : 'emerald'}
            value={blocked24h === null ? '—' : blocked24h}
            sub='blocked in the last 24 hours'
            onClick={() => goTo('logs')}
          />
        )}
      </div>

      <div className='grid grid-cols-1 lg:grid-cols-3 gap-5 items-start'>
        {isAdmin && (
          <div className='lg:col-span-2 space-y-5'>
            <Panel title='Needs attention' description='Things a person should look at'>
              {attention.length === 0 ? (
                <div className='flex items-center gap-3 rounded-lg bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm text-emerald-900'>
                  <HiCheckCircle className='w-5 h-5 text-emerald-600 flex-shrink-0' aria-hidden='true' />
                  Nothing needs attention right now.
                </div>
              ) : (
                <ul className='divide-y divide-slate-100'>
                  {attention.map((item) => (
                    <li key={item.text} className='flex items-center gap-3 py-3 first:pt-0 last:pb-0'>
                      <span className={`w-9 h-9 rounded-xl ring-1 flex items-center justify-center flex-shrink-0 ${TONE[item.tone]}`}>
                        <item.icon className='w-5 h-5' aria-hidden='true' />
                      </span>
                      <span className='flex-1 text-sm text-slate-800'>{item.text}</span>
                      <button type='button' onClick={() => goTo(item.tab)} className='inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded'>
                        {item.cta}<HiArrowRight className='w-4 h-4' aria-hidden='true' />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel
              title='Recent sign-in activity'
              action={<button type='button' onClick={() => goTo('logs')} className='text-sm font-medium text-brand-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded'>View all</button>}
            >
              {recent === null ? <Skeleton className='h-24 w-full' /> : recent.length === 0 ? (
                <p className='text-sm text-slate-500'>No sign-in activity yet.</p>
              ) : (
                <ul className='divide-y divide-slate-100'>
                  {recent.map((log) => {
                    const meta = LOG_STATUS[log.status] || { label: log.status, variant: 'default' };
                    return (
                      <li key={log._id} className='flex items-center gap-3 py-2.5 first:pt-0 last:pb-0 text-sm'>
                        <Badge variant={meta.variant} dot className='flex-shrink-0'>{meta.label}</Badge>
                        <span className='flex-1 min-w-0 truncate text-slate-800'>{log.email || 'Unknown'}</span>
                        <span className='hidden sm:block text-slate-500 truncate max-w-[14rem]'>{describeReason(log.reason)}</span>
                        <span className='text-xs text-slate-500 flex-shrink-0 tabular-nums'>{timeAgo(log.createdAt)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>

          </div>
        )}

        <Panel title='Quick actions' className={isAdmin ? '' : 'lg:col-span-3'}>
          <div className={`grid gap-2 ${isAdmin ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-3'}`}>
            {actions.map((a) => {
              const inner = (<><a.icon className='w-5 h-5 text-slate-500 flex-shrink-0' aria-hidden='true' />{a.label}</>);
              return a.to
                ? <Link key={a.label} to={a.to} className={actionClass}>{inner}</Link>
                : <button key={a.label} type='button' onClick={a.onClick} className={actionClass}>{inner}</button>;
            })}
          </div>
        </Panel>
      </div>

      <Panel title='Portfolio' description='Across every property in the workspace'>
        {loading ? (
          <Skeleton className='h-40 w-full' />
        ) : totalListings === 0 ? (
          <p className='text-sm text-slate-500'>No properties yet. <Link to='/create-listing' className='text-brand-700 font-medium hover:underline'>Add the first one</Link>.</p>
        ) : (
          <div className='space-y-6'>
            <dl className='grid grid-cols-2 lg:grid-cols-4 gap-4'>
              {[
                { label: 'Sale inventory value', value: formatCompactCurrency(sale?.totals?.totalValue || 0), sub: `${saleCount} for sale` },
                { label: 'Monthly rent roll', value: formatCompactCurrency(rent?.totals?.totalValue || 0), sub: `${rentCount} for rent` },
                { label: 'Average sale price', value: sale?.totals?.avgPrice ? formatCompactCurrency(sale.totals.avgPrice) : '—', sub: 'priced listings only' },
                { label: 'Categories in use', value: Object.keys(facets?.category || {}).filter((k) => k !== '(none)').length, sub: facets?.category?.['(none)'] ? `${facets.category['(none)']} uncategorised` : 'all categorised' },
              ].map((s) => (
                <div key={s.label} className='rounded-lg bg-slate-50 border border-slate-100 px-4 py-3'>
                  <dt className='text-xs font-medium text-slate-500'>{s.label}</dt>
                  <dd className='text-xl font-bold text-slate-900 tabular-nums mt-0.5'>{s.value}</dd>
                  <dd className='text-xs text-slate-500'>{s.sub}</dd>
                </div>
              ))}
            </dl>

            <div className='grid grid-cols-1 lg:grid-cols-2 gap-8'>
              <div>
                <h3 className='text-sm font-medium text-slate-700 mb-2'>By status</h3>
                <div className='flex h-3 rounded-full overflow-hidden bg-slate-100' role='img' aria-label={statusEntries.map(([k, c]) => `${listingStatusLabel(k)}: ${c}`).join(', ')}>
                  {statusEntries.map(([k, c]) => (
                    <span key={k} className={`${STATUS_BAR[k] || 'bg-slate-400'} h-full`} style={{ width: `${(c / statusTotal) * 100}%` }} />
                  ))}
                </div>
                <ul className='mt-3 grid grid-cols-1 gap-y-1.5 text-sm max-w-sm'>
                  {statusEntries.map(([k, c]) => (
                    <li key={k} className='flex items-center gap-2 text-slate-600'>
                      <span className={`w-2.5 h-2.5 rounded-full ${STATUS_BAR[k] || 'bg-slate-400'}`} aria-hidden='true' />
                      <span className='flex-1 truncate'>{listingStatusLabel(k)}</span>
                      <span className='tabular-nums text-slate-900 font-medium'>{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className='text-sm font-medium text-slate-700 mb-2'>By category</h3>
                <ul className='space-y-2'>
                  {categoryEntries.map(([k, c]) => (
                    <li key={k} className='flex items-center gap-3 text-sm'>
                      <span className='w-28 truncate text-slate-600 capitalize'>{k === '(none)' ? 'Uncategorised' : k}</span>
                      <span className='flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden'>
                        <span className='block h-full rounded-full bg-brand-600' style={{ width: `${(c / maxCategory) * 100}%` }} />
                      </span>
                      <span className='w-8 text-right tabular-nums text-slate-900 font-medium'>{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </Panel>

    </div>
  );
}

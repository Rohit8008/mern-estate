import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useSelector } from 'react-redux';
import { Link, useNavigate } from 'react-router-dom';
import { useBuyerView } from '../contexts/BuyerViewContext';
import { useAppearance } from '../contexts/useAppearance';
import { apiClient } from '../utils/http';
import Chart from 'react-apexcharts';
import {
  HiPlus, HiSearch, HiUsers, HiStar,
  HiClock, HiX, HiCheck, HiMail,
  HiHome, HiUserGroup, HiClipboardList, HiRefresh,
  HiSwitchHorizontal, HiOutlineLockClosed,
  HiHashtag, HiChartBar, HiLightningBolt, HiViewList, HiTable, HiTemplate,
} from 'react-icons/hi';
import { KpiCard, PageHeader, Button, Badge, Input, Select, Textarea } from '../design-system';
import OnboardingChecklist from '../components/OnboardingChecklist';
import DashboardCrmSearch from '../components/DashboardCrmSearch';
import { formatDate, formatNumber, formatCompactCurrency } from '../utils/currency';
import { listingStatusLabel } from '../utils/listingStatus';
import { useTranslation } from 'react-i18next';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const STATUS_COLORS = {
  available: '#f59e0b',
  under_negotiation: '#3b82f6',
  sold: '#10b981',
  rented: '#8b5cf6',
};

const WIDGET_TYPES = [
  { id: 'number',   label: 'Metric',    icon: HiHashtag,      description: 'Display a single number metric' },
  { id: 'chart',    label: 'Chart',     icon: HiChartBar,     description: 'Bar, line, or pie chart' },
  { id: 'battery',  label: 'Progress',  icon: HiLightningBolt,description: 'Progress / rate indicator' },
  { id: 'timeline', label: 'Timeline',  icon: HiViewList,     description: 'Recent activity feed' },
  { id: 'table',    label: 'Table',     icon: HiTable,        description: 'Data table view' },
  { id: 'workload', label: 'Team',      icon: HiTemplate,     description: 'Team workload view' },
];

const WIDGET_PRESETS = {
  number: [
    { key: 'total_properties', label: 'Total Properties', dataPath: 'properties.total' },
    { key: 'available', label: 'Available Properties', dataPath: 'properties.available' },
    { key: 'sold', label: 'Sold Properties', dataPath: 'properties.sold' },
    { key: 'rented', label: 'Rented Properties', dataPath: 'properties.rented' },
    { key: 'under_negotiation', label: 'Under Negotiation', dataPath: 'properties.underNegotiation' },
    { key: 'total_buyers', label: 'Total Buyers', dataPath: 'buyers.total' },
    { key: 'active_buyers', label: 'Active Buyers', dataPath: 'buyers.active' },
    { key: 'matched_buyers', label: 'Matched Buyers', dataPath: 'buyers.matched' },
    { key: 'closed_buyers', label: 'Closed Buyers', dataPath: 'buyers.closed' },
    // CRM figures (from /analytics/dashboard, last 30 days where it says so).
    { key: 'open_deals', label: 'Open Deals', dataPath: 'crm.deals.activeDeals' },
    { key: 'pipeline_value', label: 'Pipeline Value', dataPath: 'crm.deals.pipelineValue', format: 'currency' },
    { key: 'followups_todo', label: 'Follow-ups To Do', dataPath: 'crm.followUps.total' },
    { key: 'won_30d', label: 'Deals Won (30 days)', dataPath: 'crm.deals.closedWon' },
    { key: 'commission_30d', label: 'Commission (30 days)', dataPath: 'crm.deals.totalCommission', format: 'currency' },
    { key: 'new_clients_30d', label: 'New Clients (30 days)', dataPath: 'crm.clients.new' },
  ],
  chart: [
    { key: 'status_bar', label: 'Listing Status (Bar)' },
    { key: 'category_bar', label: 'Properties by Category (Bar)' },
    { key: 'monthly_line', label: 'Monthly Trend (Line)' },
    { key: 'city_bar', label: 'Top Cities (Bar)' },
  ],
  battery: [
    { key: 'availability_rate', label: 'Availability Rate' },
    { key: 'sold_rate', label: 'Sold Rate' },
    { key: 'buyer_match_rate', label: 'Buyer Match Rate' },
    { key: 'negotiation_rate', label: 'Negotiation Rate' },
  ],
  timeline: [
    { key: 'recent_all', label: 'All Recent Activity' },
  ],
  table: [
    { key: 'recent_listings', label: 'Recent Listings' },
    { key: 'recent_buyers', label: 'Recent Buyers' },
    { key: 'top_cities', label: 'Top Cities' },
  ],
  workload: [
    { key: 'team_overview', label: 'Team Overview' },
  ],
};

// size: 'sm' = 1 col, 'lg' = 2 cols (col-span-2)
const WIDGET_DEFAULT_SPAN = {
  number: 'sm',
  chart: 'lg',
  battery: 'sm',
  timeline: 'sm',
  table: 'lg',
  workload: 'sm',
};

const STORAGE_KEY = 'agency_dashboard_widgets';

// Icon components cannot be serialized to JSON. Store the widget type ID and
// resolve the icon component at render time from WIDGET_TYPES.
const WIDGET_TYPE_MAP = Object.fromEntries(WIDGET_TYPES.map((wt) => [wt.id, wt]));

function loadWidgetsFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw).map((w) => ({
      ...w,
      span: w.span || WIDGET_DEFAULT_SPAN[w.type] || 'sm',
    }));
  } catch { return []; }
}

const CURRENCY_PRESETS = new Set(
  Object.values(WIDGET_PRESETS).flat().filter((p) => p.format === 'currency').map((p) => p.key)
);

/** Just the fields the API stores (and no icon component). */
const widgetForSaving = ({ id, type, preset, label, dataPath, span }) => ({
  id, type, preset: preset || '', label: label || '', dataPath: dataPath || '', span: span === 'lg' ? 'lg' : 'sm',
});

// Widgets are saved on the account (/api/user/dashboard-widgets) so they
// follow the user to another browser; localStorage stays as the offline copy.
function saveWidgetsToStorage(widgets) {
  const safe = widgets.map(widgetForSaving);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(safe)); } catch { }
  apiClient.put('/user/preferences/dashboard-widgets', { items: safe.slice(0, 30) }, { silent: true }).catch(() => {});
}

// The two bespoke overlays on this page get the keyboard contract the shared
// Modal has: Escape closes, focus moves into the panel on open and back to the
// opener on close.
function useDialog(open, onEscape, panelRef) {
  const escRef = useRef(onEscape);
  escRef.current = onEscape;
  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    const onKey = (e) => { if (e.key === 'Escape') escRef.current?.(); };
    document.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus();
    };
  }, [open, panelRef]);
}

function CustomWidget({ widget, onRemove, onToggleSize, analytics, propertyStats, teamMembers, fmt, resolveData, statusBreakdown, monthlyTrend, isDragOver, onDragStart, onDragOver, onDragLeave, onDrop }) {
  const { t } = useTranslation();
  const props = analytics?.properties || {};
  const buyers = analytics?.buyers || {};
  const recentListings = analytics?.recent?.listings || [];
  const recentBuyers = analytics?.recent?.buyers || [];

  const renderContent = () => {
    // --- Number ---
    if (widget.type === 'number') {
      const value = resolveData(widget.dataPath);
      const shown = CURRENCY_PRESETS.has(widget.preset) ? formatCompactCurrency(value) : fmt(value);
      return <div className='text-3xl font-bold text-slate-900 whitespace-nowrap'>{shown}</div>;
    }

    // --- Chart ---
    if (widget.type === 'chart') {
      if (widget.preset === 'status_bar') {
        if (!statusBreakdown.length) return <p className='text-slate-500 text-sm'>{t('agencyDashboard.noData')}</p>;
        const max = Math.max(...statusBreakdown.map((s) => s.count), 1);
        return (
          <div className='h-36 flex items-end justify-center gap-6'>
            {statusBreakdown.map((s, i) => (
              <div key={i} className='flex flex-col items-center'>
                <span className='text-xs font-bold text-slate-700 mb-1'>{s.count}</span>
                <div className='w-12 rounded-t' style={{ height: `${Math.max((s.count / max) * 100, 6)}px`, backgroundColor: s.color }} />
                <span className='text-[10px] text-slate-500 mt-1 capitalize'>{s.label}</span>
              </div>
            ))}
          </div>
        );
      }
      if (widget.preset === 'category_bar') {
        const cats = props.byCategory || [];
        if (!cats.length) return <p className='text-slate-500 text-sm'>{t('agencyDashboard.noData')}</p>;
        const max = Math.max(...cats.map((c) => c.count), 1);
        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];
        return (
          <div className='h-36 flex items-end justify-center gap-6'>
            {cats.map((c, i) => (
              <div key={i} className='flex flex-col items-center'>
                <span className='text-xs font-bold text-slate-700 mb-1'>{c.count}</span>
                <div className='w-12 rounded-t' style={{ height: `${Math.max((c.count / max) * 100, 6)}px`, backgroundColor: colors[i % colors.length] }} />
                <span className='text-[10px] text-slate-500 mt-1 capitalize'>{c.categoryName || 'Other'}</span>
              </div>
            ))}
          </div>
        );
      }
      if (widget.preset === 'monthly_line') {
        if (monthlyTrend.length < 2) return <p className='text-slate-500 text-sm'>{t('agencyDashboard.notEnoughData')}</p>;
        const max = Math.max(...monthlyTrend.map((d) => d.count), 1);
        return (
          <div className='h-36 relative'>
            <svg className='w-full h-full' preserveAspectRatio='none' viewBox='0 0 100 100'>
              <polyline fill='none' stroke='#3b82f6' strokeWidth='2.5'
                points={monthlyTrend.map((d, i) => `${(i / (monthlyTrend.length - 1)) * 100},${100 - (d.count / (max + 1)) * 100}`).join(' ')}
              />
              {monthlyTrend.map((d, i) => (
                <circle key={i} cx={(i / (monthlyTrend.length - 1)) * 100} cy={100 - (d.count / (max + 1)) * 100} r='3' fill='#3b82f6' />
              ))}
            </svg>
            <div className='flex justify-between text-[10px] text-slate-500 mt-1'>
              {monthlyTrend.map((d, i) => <span key={i}>{d.month}</span>)}
            </div>
          </div>
        );
      }
      if (widget.preset === 'city_bar') {
        const cities = (props.byCity || []).slice(0, 5);
        if (!cities.length) return <p className='text-slate-500 text-sm'>{t('agencyDashboard.noData')}</p>;
        const max = Math.max(...cities.map((c) => c.count), 1);
        return (
          <div className='space-y-2'>
            {cities.map((city) => (
              <div key={city._id} className='flex items-center gap-2'>
                <span className='text-xs text-slate-600 w-20 truncate'>{city._id}</span>
                <div className='flex-1 bg-slate-100 rounded-full h-4'>
                  <div className='bg-slate-700 h-4 rounded-full text-[10px] text-white flex items-center justify-end pr-1.5 font-medium' style={{ width: `${Math.max((city.count / max) * 100, 10)}%` }}>{city.count}</div>
                </div>
              </div>
            ))}
          </div>
        );
      }
    }

    // --- Battery / Progress ---
    if (widget.type === 'battery') {
      let pct = 0, label = '', color = '#3b82f6';
      const total = props.total || 1;
      if (widget.preset === 'availability_rate') { pct = ((props.available || 0) / total) * 100; label = `${props.available || 0} of ${total} available`; color = '#10b981'; }
      else if (widget.preset === 'sold_rate') { pct = ((props.sold || 0) / total) * 100; label = `${props.sold || 0} of ${total} sold`; color = '#3b82f6'; }
      else if (widget.preset === 'buyer_match_rate') { const bt = buyers.total || 1; pct = ((buyers.matched || 0) / bt) * 100; label = `${buyers.matched || 0} of ${bt} matched`; color = '#8b5cf6'; }
      else if (widget.preset === 'negotiation_rate') { pct = ((props.underNegotiation || 0) / total) * 100; label = `${props.underNegotiation || 0} of ${total} in negotiation`; color = '#f59e0b'; }
      pct = Math.min(pct, 100);
      return (
        <div className='space-y-3'>
          <div className='text-3xl font-bold text-slate-900'>{Math.round(pct)}%</div>
          <div className='w-full bg-slate-100 rounded-full h-4'>
            <div className='h-4 rounded-full transition-all' style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: color }} />
          </div>
          <p className='text-xs text-slate-500'>{label}</p>
        </div>
      );
    }

    // --- Timeline ---
    if (widget.type === 'timeline') {
      const items = [
        ...recentListings.map((l) => ({ type: 'listing', name: l.name, status: l.status, date: l.createdAt })),
        ...recentBuyers.map((b) => ({ type: 'buyer', name: b.buyerName, status: b.status, date: b.createdAt })),
      ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);
      if (!items.length) return <p className='text-slate-500 text-sm'>{t('agencyDashboard.noRecentActivity')}</p>;
      return (
        <div className='space-y-3'>
          {items.map((item, i) => (
            <div key={i} className='flex items-start gap-3'>
              <div className={`w-2 h-2 mt-1.5 rounded-full flex-shrink-0 ${item.type === 'listing' ? 'bg-blue-500' : 'bg-purple-500'}`} />
              <div className='min-w-0 flex-1'>
                <p className='text-sm text-slate-800 truncate'>{item.name}</p>
                <p className='text-[10px] text-slate-500'>{item.type === 'listing' ? 'Property' : 'Buyer'} - <span className='capitalize'>{(item.status || '').replace('_', ' ')}</span> - {formatDate(item.date, { day: 'numeric', year: undefined })}</p>
              </div>
            </div>
          ))}
        </div>
      );
    }

    // --- Table ---
    if (widget.type === 'table') {
      if (widget.preset === 'recent_listings') {
        if (!recentListings.length) return <p className='text-slate-500 text-sm'>{t('agencyDashboard.noListings')}</p>;
        return (
          <div className='overflow-x-auto'>
            <table className='w-full text-xs'>
              <thead><tr className='border-b border-slate-200'><th className='text-left py-1.5 text-slate-500 font-medium'>{t('agencyDashboard.name')}</th><th className='text-left py-1.5 text-slate-500 font-medium'>{t('agencyDashboard.city')}</th><th className='text-left py-1.5 text-slate-500 font-medium'>{t('agencyDashboard.status')}</th></tr></thead>
              <tbody>
                {recentListings.slice(0, 5).map((l) => (
                  <tr key={l._id} className='border-b border-slate-50'>
                    <td className='py-1.5 text-slate-800 truncate max-w-[120px]'>{l.name}</td>
                    <td className='py-1.5 text-slate-600'>{l.city || '-'}</td>
                    <td className='py-1.5'>
                      <Badge size='xs' variant={l.status === 'available' ? 'success' : l.status === 'sold' ? 'info' : l.status === 'rented' ? 'purple' : 'warning'}>
                        {(l.status || '').replace('_', ' ')}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      if (widget.preset === 'recent_buyers') {
        if (!recentBuyers.length) return <p className='text-slate-500 text-sm'>{t('agencyDashboard.noBuyers')}</p>;
        return (
          <div className='overflow-x-auto'>
            <table className='w-full text-xs'>
              <thead><tr className='border-b border-slate-200'><th className='text-left py-1.5 text-slate-500 font-medium'>{t('agencyDashboard.name')}</th><th className='text-left py-1.5 text-slate-500 font-medium'>{t('agencyDashboard.phone')}</th><th className='text-left py-1.5 text-slate-500 font-medium'>{t('agencyDashboard.status')}</th></tr></thead>
              <tbody>
                {recentBuyers.slice(0, 5).map((b) => (
                  <tr key={b._id} className='border-b border-slate-50'>
                    <td className='py-1.5 text-slate-800 truncate max-w-[120px]'>{b.buyerName}</td>
                    <td className='py-1.5 text-slate-600'>{b.buyerPhone || '-'}</td>
                    <td className='py-1.5'>
                      <Badge size='xs' variant={b.status === 'active' ? 'success' : b.status === 'matched' ? 'info' : 'default'}>
                        {b.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      if (widget.preset === 'top_cities') {
        const cities = (props.byCity || []).slice(0, 6);
        if (!cities.length) return <p className='text-slate-500 text-sm'>{t('agencyDashboard.noData')}</p>;
        return (
          <div className='overflow-x-auto'>
            <table className='w-full text-xs'>
              <thead><tr className='border-b border-slate-200'><th className='text-left py-1.5 text-slate-500 font-medium'>{t('agencyDashboard.city')}</th><th className='text-right py-1.5 text-slate-500 font-medium'>{t('agencyDashboard.properties')}</th></tr></thead>
              <tbody>
                {cities.map((c) => (
                  <tr key={c._id} className='border-b border-slate-50'>
                    <td className='py-1.5 text-slate-800'>{c._id}</td>
                    <td className='py-1.5 text-slate-900 font-semibold text-right'>{c.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
    }

    // --- Workload ---
    if (widget.type === 'workload') {
      if (!teamMembers.length) return <p className='text-slate-500 text-sm'>{t('agencyDashboard.noTeamMembersFound')}</p>;
      return (
        <div className='space-y-3'>
          {teamMembers.slice(0, 6).map((m) => (
            <div key={m.id} className='flex items-center gap-3'>
              <div className='w-7 h-7 rounded-full bg-slate-900 flex items-center justify-center text-white text-xs font-medium flex-shrink-0'>{m.avatar}</div>
              <div className='flex-1 min-w-0'>
                <p className='text-sm text-slate-800 truncate'>{m.name}</p>
                <p className='text-[10px] text-slate-500 capitalize'>{m.role}</p>
              </div>
            </div>
          ))}
        </div>
      );
    }

    return <p className='text-slate-500 text-sm'>{t('agencyDashboard.widgetNotConfigured')}</p>;
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`bg-white border-2 rounded-xl p-5 flex flex-col overflow-hidden transition-all ${isDragOver ? 'border-blue-400 bg-blue-50/40 scale-[1.02]' : 'border-slate-200'
        } ${widget.span === 'lg' ? 'col-span-1 lg:col-span-2' : 'col-span-1'}`}
    >
      <div className='flex items-center justify-between mb-3 flex-shrink-0'>
        <div className='flex items-center gap-2 cursor-grab active:cursor-grabbing flex-1 min-w-0'>
          {(() => { const Icon = WIDGET_TYPE_MAP[widget.type]?.icon; return Icon ? <Icon className='w-4 h-4 text-slate-500 flex-shrink-0' /> : null; })()}
          <span className='text-sm font-semibold text-slate-700 truncate'>{widget.label}</span>
        </div>
        <div className='flex items-center gap-1 flex-shrink-0'>
          <button onClick={() => onToggleSize(widget.id)} title={widget.span === 'lg' ? 'Make smaller' : 'Make wider'} aria-label={widget.span === 'lg' ? `Make ${widget.label} smaller` : `Make ${widget.label} wider`} className='text-slate-500 hover:text-slate-700 p-1 rounded transition-colors'>
            <HiSwitchHorizontal className='w-4 h-4' aria-hidden='true' />
          </button>
          <button onClick={() => onRemove(widget.id)} aria-label={`Remove ${widget.label} widget`} className='text-slate-500 hover:text-rose-500 p-1 rounded transition-colors'>
            <HiX className='w-4 h-4' aria-hidden='true' />
          </button>
        </div>
      </div>
      <div className='flex-1 overflow-auto'>{renderContent()}</div>
    </div>
  );
}

export default function AgencyDashboard() {
  const { t } = useTranslation();
  const { currentUser } = useSelector((state) => state.user);
  const { isBuyerViewMode } = useBuyerView();
  const { resolvedTheme } = useAppearance();

  const [analytics, setAnalytics] = useState(null);
  const [propertyStats, setPropertyStats] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [crm, setCrm] = useState(null);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // UI states
  const [crmSearchQuery, setCrmSearchQuery] = useState('');
  const [showAddWidgetModal, setShowAddWidgetModal] = useState(false);
  const [widgetStep, setWidgetStep] = useState('type'); // 'type' | 'preset'
  const [selectedWidgetType, setSelectedWidgetType] = useState(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [showPeopleDropdown, setShowPeopleDropdown] = useState(false);
  const [selectedPeople, setSelectedPeople] = useState([]);
  const [customWidgets, setCustomWidgets] = useState(() => loadWidgetsFromStorage());
  const [isFavorite, setIsFavorite] = useState(false);
  const dragItem = useRef(null);
  const [dragOverId, setDragOverId] = useState(null);

  // Invite states
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('employee');
  const [inviteMessage, setInviteMessage] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');

  const canAccess = useMemo(() => {
    if (!currentUser) return false;
    if (isBuyerViewMode) return false;
    return currentUser.role === 'admin' || currentUser.role === 'employee';
  }, [currentUser, isBuyerViewMode]);

  const isAdmin = currentUser?.role === 'admin';

  const fetchData = useCallback(async () => {
    if (!canAccess) return;
    setLoading(true);
    setError(null);
    try {
      const agentParam = selectedPeople.length > 0 ? `?agentIds=${selectedPeople.join(',')}` : '';
      const requests = [
        apiClient.get(`/dashboard/analytics${agentParam}`),
        apiClient.get(`/dashboard/property-stats${agentParam}`),
        // CRM figures: the dashboard had none (no leads, pipeline, follow-ups
        // or commission). Last 30 days, scoped to the caller like Analytics.
        apiClient.get('/analytics/dashboard', { silent: true }).catch(() => null),
      ];
      if (isAdmin) {
        requests.push(apiClient.get('/user/list'));
      }
      const results = await Promise.all(requests);
      const crmData = results[2]?.data || null;
      setCrm(crmData ? {
        ...crmData,
        followUps: { ...crmData.followUps, total: (crmData.followUps?.overdue || 0) + (crmData.followUps?.upcoming || 0) },
      } : null);
      const analyticsData = results[0]?.data || results[0];
      setAnalytics(analyticsData);

      const statsData = results[1]?.data || results[1];
      setPropertyStats(statsData);

      if (isAdmin && results[3]) {
        const users = Array.isArray(results[3]) ? results[3] : results[3]?.data || [];
        setTeamMembers(
          users
            .filter((u) => u.role === 'employee' || u.role === 'admin')
            .map((u) => ({
              id: u._id,
              name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.username,
              role: u.role,
              avatar: (u.firstName?.[0] || u.username?.[0] || '?').toUpperCase(),
              email: u.email,
            }))
        );
      }
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, [canAccess, isAdmin, selectedPeople]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Widgets from the account; the first time, the browser's old ones go up.
  useEffect(() => {
    let alive = true;
    apiClient.get('/user/preferences/dashboard-widgets', { silent: true }).then((res) => {
      if (!alive) return;
      const remote = res?.data;
      if (Array.isArray(remote)) {
        setCustomWidgets(remote.map((w) => ({ ...w, span: w.span || WIDGET_DEFAULT_SPAN[w.type] || 'sm' })));
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(remote)); } catch { }
      } else {
        const local = loadWidgetsFromStorage();
        if (local.length) saveWidgetsToStorage(local);
      }
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Derived data
  const props = analytics?.properties || {};
  const buyers = analytics?.buyers || {};
  const employees = analytics?.employees || {};
  const recentListings = analytics?.recent?.listings || [];
  const recentBuyers = analytics?.recent?.buyers || [];

  const statusBreakdown = useMemo(() => {
    const raw = propertyStats?.statusBreakdown || [];
    return raw.map((s) => ({
      label: listingStatusLabel(s._id),
      count: s.count,
      color: STATUS_COLORS[s._id] || '#94a3b8',
    }));
  }, [propertyStats]);

  const monthlyTrend = useMemo(() => {
    const raw = propertyStats?.monthlyTrend || [];
    return [...raw]
      .sort((a, b) => a._id.year - b._id.year || a._id.month - b._id.month)
      .slice(-6)
      .map((m) => ({ month: MONTH_NAMES[m._id.month - 1], count: m.count }));
  }, [propertyStats]);

  const maxBarCount = Math.max(...(statusBreakdown.length ? statusBreakdown.map((s) => s.count) : [1]), 1);
  const maxLineCount = Math.max(...(monthlyTrend.length ? monthlyTrend.map((d) => d.count) : [1]), 1);

  // Helpers
  const fmt = formatNumber;

  const togglePerson = (id) => {
    setSelectedPeople((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const openWidgetModal = () => {
    setWidgetStep('type');
    setSelectedWidgetType(null);
    setShowAddWidgetModal(true);
  };

  const selectWidgetType = (wt) => {
    setSelectedWidgetType(wt);
    const presets = WIDGET_PRESETS[wt.id] || [];
    if (presets.length === 1) {
      addWidget(wt, presets[0]);
    } else {
      setWidgetStep('preset');
    }
  };

  const addWidget = (wt, preset) => {
    const span = WIDGET_DEFAULT_SPAN[wt.id] || 'sm';
    // Do NOT store icon (React component) — it can't be serialized to localStorage.
    // Icon is resolved at render time from WIDGET_TYPE_MAP[widget.type].icon.
    const newWidget = { id: `w-${Date.now()}`, type: wt.id, label: preset.label, preset: preset.key, dataPath: preset.dataPath, span };
    setCustomWidgets((prev) => {
      const next = [...prev, newWidget];
      saveWidgetsToStorage(next);
      return next;
    });
    setShowAddWidgetModal(false);
  };

  const removeWidget = (id) => {
    setCustomWidgets((prev) => {
      const next = prev.filter((w) => w.id !== id);
      saveWidgetsToStorage(next);
      return next;
    });
  };

  const toggleWidgetSize = (id) => {
    setCustomWidgets((prev) => {
      const next = prev.map((w) => w.id === id ? { ...w, span: w.span === 'lg' ? 'sm' : 'lg' } : w);
      saveWidgetsToStorage(next);
      return next;
    });
  };

  // Drag-and-drop reorder
  const handleDragStart = (id) => { dragItem.current = id; };
  const handleDragOver = (e, id) => { e.preventDefault(); if (dragItem.current !== id) setDragOverId(id); };
  const handleDragLeave = () => { setDragOverId(null); };
  const handleDrop = (targetId) => {
    setDragOverId(null);
    const srcId = dragItem.current;
    if (!srcId || srcId === targetId) return;
    setCustomWidgets((prev) => {
      const arr = [...prev];
      const srcIdx = arr.findIndex((w) => w.id === srcId);
      const tgtIdx = arr.findIndex((w) => w.id === targetId);
      if (srcIdx < 0 || tgtIdx < 0) return prev;
      const [moved] = arr.splice(srcIdx, 1);
      arr.splice(tgtIdx, 0, moved);
      saveWidgetsToStorage(arr);
      return arr;
    });
    dragItem.current = null;
  };

  // Resolve a dot-path like 'properties.total' from analytics
  const resolveData = (path) => {
    if (!path || !analytics) return 0;
    const source = { ...analytics, crm: crm || {} };
    return path.split('.').reduce((obj, key) => obj?.[key], source) || 0;
  };

  // Invite handler
  const handleSendInvite = async () => {
    if (!inviteEmail.trim()) {
      setInviteError('Email is required');
      return;
    }
    setInviteLoading(true);
    setInviteError('');
    setInviteSuccess('');
    try {
      // Generate a username that always satisfies min(3) + alphanum + stays unique
      const prefix = inviteEmail.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').slice(0, 15);
      const suffix = Math.random().toString(36).slice(2, 5); // 3 alphanum chars
      const username = prefix.length >= 3 ? `${prefix}${suffix}` : `user${suffix}`;

      // No password: the API creates the account unusable and emails a
      // single-use link to set one. This used to show a made-up "temp
      // password" the server had discarded, which could never sign anyone in.
      await apiClient.post('/user/employee', {
        username,
        email: inviteEmail.trim(),
        firstName: '',
        lastName: '',
        message: inviteMessage.trim(),
      });
      setInviteSuccess(t('agencyDashboard.inviteSent', { email: inviteEmail.trim() }));
      setInviteEmail('');
      setInviteMessage('');
      if (isAdmin) fetchData();
    } catch (err) {
      setInviteError(err?.message || 'Failed to send invite');
    } finally {
      setInviteLoading(false);
    }
  };

  const closeInviteModal = () => {
    setShowInviteModal(false);
    setInviteEmail('');
    setInviteMessage('');
    setInviteError('');
    setInviteSuccess('');
  };

  const widgetModalRef = useRef(null);
  useDialog(showAddWidgetModal, () => setShowAddWidgetModal(false), widgetModalRef);
  const inviteModalRef = useRef(null);
  useDialog(showInviteModal, closeInviteModal, inviteModalRef);

  if (!canAccess) {
    return (
      <div className='min-h-[60vh] flex items-center justify-center'>
        <div className='text-center max-w-sm px-6'>
          <div className='mx-auto mb-4 w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 ring-1 ring-rose-100 flex items-center justify-center'>
            <HiOutlineLockClosed className='w-7 h-7' aria-hidden='true' />
          </div>
          <h2 className='text-lg font-semibold text-slate-900 mb-1'>{t('agencyDashboard.accessDenied')}</h2>
          <p className='text-sm text-slate-500'>You don&apos;t have permission to view the agency dashboard.</p>
        </div>
      </div>
    );
  }

  const isSearching = crmSearchQuery.trim().length >= 2;

  // Chart colors adapt to dark/light mode
  const isDark = resolvedTheme === 'dark';
  const chartAxisColor  = isDark ? '#94a3b8' : '#64748b';
  const chartGridColor  = isDark ? '#1e293b' : '#e2e8f0';
  const chartTooltipTheme = isDark ? 'dark' : 'light';
  const chartStrokeColor  = isDark ? '#0f172a' : '#fff';

  const hour = new Date().getHours();
  const greeting = hour < 12 ? t('agencyDashboard.goodMorning') : hour < 17 ? t('agencyDashboard.goodAfternoon') : t('agencyDashboard.goodEvening');
  const displayName = (currentUser?.username || 'there').split(/[\s_]+/)[0];
  // The workspace's date format, not the browser's US default.
  const todayString = formatDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className='space-y-6'>
      {/* Greeting Header */}
      <PageHeader
        dark
        title={`${greeting}, ${displayName}!`}
        description={`${todayString}. ${t('agencyDashboard.overviewSubtitle')}`}
        actions={
          <>
            <Button
              variant='dark'
              size='sm'
              icon={HiRefresh}
              onClick={fetchData}
              className={loading ? '[&>svg]:animate-spin' : ''}
            >{t('agencyDashboard.refresh')}</Button>
            {isAdmin && (
              <Button variant='darkBrand' size='sm' icon={HiMail} onClick={() => setShowInviteModal(true)}>{t('agencyDashboard.inviteMember')}</Button>
            )}
          </>
        }
      />

      {/* Renders nothing once the workspace is set up, or once dismissed. */}
      <OnboardingChecklist />

      {/* Toolbar */}
      <div className='flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-xl p-2.5 shadow-sm'>
        <button onClick={() => openWidgetModal()} className='px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm font-medium flex items-center gap-1.5 hover:bg-slate-800 transition-colors'>
          <HiPlus className='w-4 h-4' aria-hidden='true' />{t('agencyDashboard.addWidget')}</button>
        <div className='h-5 w-px bg-slate-200' />
        <div className='flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-sm flex-1 max-w-md focus-within:bg-white focus-within:border-slate-300 focus-within:ring-2 focus-within:ring-brand-500 transition-colors'>
          <HiSearch className='w-4 h-4 text-slate-400 flex-shrink-0' aria-hidden='true' />
          <input
            className='bg-transparent outline-none flex-1 text-slate-700 placeholder:text-slate-500 text-sm'
            aria-label='Search properties, leads, owners, buyers and tasks'
            placeholder={t('agencyDashboard.searchPropertiesLeadsOwnersBuyersTasks')}
            value={crmSearchQuery}
            onChange={(e) => setCrmSearchQuery(e.target.value)}
          />
          {crmSearchQuery && (<button onClick={() => setCrmSearchQuery('')} aria-label='Clear search' className='text-slate-500 hover:text-slate-700'><HiX className='w-4 h-4' aria-hidden='true' /></button>)}
        </div>

        {/* People dropdown */}
        {isAdmin && teamMembers.length > 0 && (
          <div className='relative'>
            <button onClick={() => { setShowPeopleDropdown(!showPeopleDropdown); setShowFilterDropdown(false); }} aria-expanded={showPeopleDropdown} className={`px-3 py-1.5 rounded-md border text-sm font-medium flex items-center gap-1.5 transition-colors ${selectedPeople.length > 0 ? 'border-slate-900 bg-slate-100 text-slate-900' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
              <HiUsers className='w-4 h-4' aria-hidden='true' />
              People
              {selectedPeople.length > 0 && (<span className='bg-slate-900 text-white text-xs px-1.5 rounded-full'>{selectedPeople.length}</span>)}
            </button>
            {showPeopleDropdown && (
              <div className='absolute top-full left-0 mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-lg z-20'>
                <div className='p-2'>
                  <div className='text-xs font-medium text-slate-500 px-2 py-1 mb-1'>{t('agencyDashboard.teamMembers')}</div>
                  {teamMembers.map((person) => (
                    <button key={person.id} onClick={() => togglePerson(person.id)} aria-pressed={selectedPeople.includes(person.id)} className={`w-full text-left px-2 py-2 rounded text-sm flex items-center gap-3 ${selectedPeople.includes(person.id) ? 'bg-slate-100' : 'hover:bg-slate-50'}`}>
                      <div className='w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-white text-sm font-medium'>{person.avatar}</div>
                      <div className='flex-1'>
                        <div className='font-medium text-slate-900'>{person.name}</div>
                        <div className='text-xs text-slate-500 capitalize'>{person.role}</div>
                      </div>
                      {selectedPeople.includes(person.id) && <HiCheck className='w-5 h-5 text-slate-900' aria-hidden='true' />}
                    </button>
                  ))}
                  {selectedPeople.length > 0 && (
                    <button onClick={() => { setSelectedPeople([]); setShowPeopleDropdown(false); }} className='w-full text-left px-2 py-1.5 rounded text-sm text-rose-600 hover:bg-rose-50 mt-1'>{t('agencyDashboard.clearSelection')}</button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className='bg-rose-50 border border-rose-200 rounded-lg p-4 flex items-center justify-between'>
          <p className='text-rose-800 text-sm'>{error}</p>
          <button onClick={fetchData} className='text-rose-700 hover:underline text-sm font-medium'>{t('agencyDashboard.retry')}</button>
        </div>
      )}

      {/* Full CRM search results — replaces the widget/analytics view while searching */}
      {isSearching && <DashboardCrmSearch query={crmSearchQuery.trim()} />}

      {!isSearching && (
        <>
      {/* Loading skeleton */}
      {loading && (
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className='bg-white border border-slate-200 rounded-xl p-5 animate-pulse'>
              <div className='h-4 bg-slate-200 rounded w-2/3 mb-3'></div>
              <div className='h-8 bg-slate-200 rounded w-1/2 mb-2'></div>
              <div className='h-3 bg-slate-100 rounded w-1/3'></div>
            </div>
          ))}
        </div>
      )}

      {!loading && analytics && (
        <>
          {/* Section title */}
          <div className='flex items-center justify-between'>
            <div>
              <h2 className='text-base font-semibold text-slate-900'>{t('agencyDashboard.propertiesOverview')}</h2>
              <p className='text-slate-500 text-xs mt-0.5'>{t('agencyDashboard.realTimeMetricsFromYourPortfolio')}</p>
            </div>
          </div>

          {/* KPI Cards */}
          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'>
            {(
              <KpiCard
                title={t('agencyDashboard.totalProperties')}
                value={fmt(props.total)}
                icon={HiHome}
                color='blue'
                sub={<><span className='text-emerald-600 font-medium'>{t('agencyDashboard.availableCount', { count: props.available || 0 })}</span>{', '}{t('agencyDashboard.soldRentedCount', { sold: props.sold || 0, rented: props.rented || 0 })}</>}
                onClick={() => navigate('/properties')}
              />
            )}
            {(
              <KpiCard
                title={t('agencyDashboard.underNegotiation')}
                value={fmt(props.underNegotiation)}
                icon={HiClock}
                color='amber'
                sub={t('agencyDashboard.listingsInNegotiation')}
                onClick={() => navigate('/properties?status=under_negotiation')}
              />
            )}
            {(
              <KpiCard
                title={t('agencyDashboard.buyerRequirements')}
                value={fmt(buyers.total)}
                icon={HiUserGroup}
                color='purple'
                sub={<><span className='text-emerald-600 font-medium'>{t('agencyDashboard.activeCount', { count: buyers.active || 0 })}</span>{', '}{t('agencyDashboard.matchedCount', { count: buyers.matched || 0 })}</>}
                onClick={() => navigate('/buyers')}
              />
            )}
            {isAdmin && (
              <KpiCard
                title={t('agencyDashboard.teamMembers')}
                value={fmt(employees.total)}
                icon={HiUsers}
                color='emerald'
                sub={<><span className='text-emerald-600 font-medium'>{t('agencyDashboard.activeCount', { count: employees.active || 0 })}</span>{', '}{t('agencyDashboard.adminsAndAgents')}</>}
                onClick={() => navigate('/admin')}
              />
            )}
            {!isAdmin && (
              <KpiCard
                title={t('agencyDashboard.closedBuyers')}
                value={fmt(buyers.closed)}
                icon={HiCheck}
                color='emerald'
                sub={t('agencyDashboard.successfullyMatched')}
                onClick={() => navigate('/buyers')}
              />
            )}
          </div>

          {/* Sales and follow-ups: the CRM half of the agency, which the
              dashboard did not show at all. */}
          {crm && (
            <>
              <div>
                <h2 className='text-base font-semibold text-slate-900'>{t('agencyDashboard.salesOverview')}</h2>
                <p className='text-slate-500 text-xs mt-0.5'>{t('agencyDashboard.salesOverviewSubtitle')}</p>
              </div>
              <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'>
                <KpiCard
                  title={t('agencyDashboard.openDeals')}
                  value={fmt(crm.deals?.activeDeals)}
                  icon={HiClock}
                  color='blue'
                  sub={t('agencyDashboard.pipelineValue', { value: formatCompactCurrency(crm.deals?.pipelineValue || 0) })}
                  onClick={() => navigate('/pipeline')}
                />
                <KpiCard
                  title={t('agencyDashboard.followUpsToDo')}
                  value={fmt((crm.followUps?.overdue || 0) + (crm.followUps?.upcoming || 0))}
                  icon={HiClock}
                  color='amber'
                  sub={crm.followUps?.overdue
                    ? <span className='text-rose-600 font-medium'>{t('agencyDashboard.overdueCount', { count: crm.followUps.overdue })}</span>
                    : t('agencyDashboard.dueThisWeek', { count: crm.followUps?.upcoming || 0 })}
                  onClick={() => navigate('/calendar')}
                />
                <KpiCard
                  title={t('agencyDashboard.dealsWon30')}
                  value={fmt(crm.deals?.closedWon)}
                  icon={HiCheck}
                  color='emerald'
                  sub={t('agencyDashboard.commissionValue', { value: formatCompactCurrency(crm.deals?.totalCommission || 0) })}
                  onClick={() => navigate('/pipeline')}
                />
                <KpiCard
                  title={t('agencyDashboard.newClients30')}
                  value={fmt(crm.clients?.new)}
                  icon={HiUserGroup}
                  color='purple'
                  sub={t('agencyDashboard.clientsTotal', { count: crm.clients?.total || 0 })}
                  onClick={() => navigate('/clients')}
                />
              </div>
            </>
          )}

          {/* Charts */}
          <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
            {/* Listing status bar chart */}
            {(
              <div className='bg-white border border-slate-200 rounded-xl p-5 shadow-sm'>
                <h3 className='text-sm font-semibold text-slate-700 mb-4'>{t('agencyDashboard.listingStatus')}</h3>
                {statusBreakdown.length > 0 ? (
                  <Chart
                    type='bar'
                    height={200}
                    options={{
                      chart: { toolbar: { show: false }, fontFamily: 'inherit' },
                      plotOptions: { bar: { borderRadius: 6, columnWidth: '50%', distributed: true } },
                      colors: statusBreakdown.map((s) => s.color),
                      dataLabels: { enabled: true, style: { fontSize: '12px', fontWeight: 600 } },
                      legend: { show: false },
                      xaxis: { categories: statusBreakdown.map((s) => s.label), labels: { style: { fontSize: '11px', colors: chartAxisColor } } },
                      yaxis: { labels: { style: { fontSize: '11px', colors: chartAxisColor } } },
                      grid: { borderColor: chartGridColor, strokeDashArray: 4 },
                      tooltip: { theme: chartTooltipTheme },
                    }}
                    series={[{ name: 'Properties', data: statusBreakdown.map((s) => s.count) }]}
                  />
                ) : (
                  <div className='h-48 flex items-center justify-center text-slate-500 text-sm'>{t('agencyDashboard.noDataYet')}</div>
                )}
              </div>
            )}

            {/* Monthly trend line chart */}
            {(
              <div className='bg-white border border-slate-200 rounded-xl p-5 shadow-sm'>
                <h3 className='text-sm font-semibold text-slate-700 mb-4'>{t('agencyDashboard.newListingsByMonth')}</h3>
                {monthlyTrend.length > 1 ? (
                  <Chart
                    type='area'
                    height={200}
                    options={{
                      chart: { toolbar: { show: false }, fontFamily: 'inherit', sparkline: { enabled: false } },
                      stroke: { curve: 'smooth', width: 3 },
                      colors: ['#6366f1'],
                      fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.1, stops: [0, 90, 100] } },
                      dataLabels: { enabled: false },
                      xaxis: { categories: monthlyTrend.map((d) => d.month), labels: { style: { fontSize: '11px', colors: chartAxisColor } } },
                      yaxis: { labels: { style: { fontSize: '11px', colors: chartAxisColor } }, min: 0 },
                      grid: { borderColor: chartGridColor, strokeDashArray: 4 },
                      markers: { size: 5, colors: ['#6366f1'], strokeColors: chartStrokeColor, strokeWidth: 2, hover: { size: 7 } },
                      tooltip: { theme: chartTooltipTheme },
                    }}
                    series={[{ name: 'Listings', data: monthlyTrend.map((d) => d.count) }]}
                  />
                ) : (
                  <div className='h-48 flex items-center justify-center text-slate-500 text-sm'>{t('agencyDashboard.notEnoughDataForChart')}</div>
                )}
              </div>
            )}
          </div>

          {/* Properties by Category & City */}
          <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
            {props.byCategory?.length > 0 && (
              <div className='bg-white border border-slate-200 rounded-xl p-5 shadow-sm'>
                <h3 className='text-sm font-semibold text-slate-700 mb-4'>{t('agencyDashboard.propertiesByCategory')}</h3>
                <Chart
                  type='donut'
                  height={220}
                  options={{
                    chart: { fontFamily: 'inherit' },
                    labels: props.byCategory.map((cat) => cat.categoryName || 'Unknown'),
                    colors: ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'],
                    legend: { position: 'bottom', fontSize: '12px', labels: { colors: chartAxisColor } },
                    dataLabels: { enabled: true, style: { fontSize: '11px', fontWeight: 600 } },
                    plotOptions: { pie: { donut: { size: '55%', labels: { show: true, total: { show: true, label: 'Total', fontSize: '12px', color: chartAxisColor, formatter: () => props.total } } } } },
                    stroke: { width: 2, colors: [chartStrokeColor] },
                    tooltip: { theme: chartTooltipTheme },
                  }}
                  series={props.byCategory.map((cat) => cat.count)}
                />
              </div>
            )}

            {props.byCity?.length > 0 && (
              <div className='bg-white border border-slate-200 rounded-xl p-5 shadow-sm'>
                <h3 className='text-sm font-semibold text-slate-700 mb-4'>{t('agencyDashboard.topCities')}</h3>
                <Chart
                  type='bar'
                  height={220}
                  options={{
                    chart: { toolbar: { show: false }, fontFamily: 'inherit' },
                    plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: '60%' } },
                    colors: [isDark ? '#334155' : '#1e293b'],
                    dataLabels: { enabled: true, style: { fontSize: '11px', fontWeight: 600 }, offsetX: -5 },
                    xaxis: { categories: props.byCity.slice(0, 6).map((c) => c._id), labels: { style: { fontSize: '11px', colors: chartAxisColor } } },
                    yaxis: { labels: { style: { fontSize: '11px', colors: chartAxisColor } } },
                    grid: { borderColor: chartGridColor, strokeDashArray: 4, xaxis: { lines: { show: true } }, yaxis: { lines: { show: false } } },
                    tooltip: { theme: chartTooltipTheme },
                  }}
                  series={[{ name: 'Properties', data: props.byCity.slice(0, 6).map((c) => c.count) }]}
                />
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
            {(
              <div className='bg-white border border-slate-200 rounded-xl p-5 shadow-sm'>
                <div className='flex items-center justify-between mb-4'>
                  <h3 className='text-sm font-semibold text-slate-700'>{t('agencyDashboard.recentListings')}</h3>
                  <Link to='/properties' className='text-xs font-medium text-slate-500 hover:text-slate-900'>{t('agencyDashboard.viewAll')}</Link>
                </div>
                <div className='space-y-3'>
                  {recentListings.length > 0 ? recentListings.map((l) => (
                    <div key={l._id} className='flex items-center justify-between p-3 bg-slate-50 rounded-lg'>
                      <div className='min-w-0 flex-1'>
                        <p className='font-medium text-slate-900 text-sm truncate'>{l.name}</p>
                        <p className='text-xs text-slate-500 truncate'>{l.city || 'N/A'}{l.locality ? `, ${l.locality}` : ''}</p>
                      </div>
                      <Badge
                        size='sm'
                        className='ml-3 flex-shrink-0 capitalize'
                        variant={l.status === 'available' ? 'success' : l.status === 'sold' ? 'info' : l.status === 'rented' ? 'purple' : 'warning'}
                      >
                        {(l.status || '').replace('_', ' ')}
                      </Badge>
                    </div>
                  )) : (
                    <p className='text-slate-500 text-sm text-center py-4'>{t('agencyDashboard.noRecentListings')}</p>
                  )}
                </div>
              </div>
            )}

            {(
              <div className='bg-white border border-slate-200 rounded-xl p-5 shadow-sm'>
                <div className='flex items-center justify-between mb-4'>
                  <h3 className='text-sm font-semibold text-slate-700'>{t('agencyDashboard.recentBuyerRequirements')}</h3>
                  <Link to='/buyer-requirements' className='text-xs font-medium text-slate-500 hover:text-slate-900'>{t('agencyDashboard.viewAll')}</Link>
                </div>
                <div className='space-y-3'>
                  {recentBuyers.length > 0 ? recentBuyers.map((b) => (
                    <div key={b._id} className='flex items-center justify-between p-3 bg-slate-50 rounded-lg'>
                      <div className='min-w-0 flex-1'>
                        <p className='font-medium text-slate-900 text-sm truncate'>{b.buyerName}</p>
                        <p className='text-xs text-slate-500 truncate'>{b.buyerPhone || 'No phone'}</p>
                      </div>
                      <Badge
                        size='sm'
                        className='ml-3 flex-shrink-0 capitalize'
                        variant={b.status === 'active' ? 'success' : b.status === 'matched' ? 'info' : 'default'}
                      >
                        {b.status}
                      </Badge>
                    </div>
                  )) : (
                    <p className='text-slate-500 text-sm text-center py-4'>{t('agencyDashboard.noRecentBuyers')}</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Custom widgets - draggable grid */}
          <div>
            <div className='flex items-center justify-between mb-4'>
              <h2 className='text-lg font-bold text-slate-900'>{t('agencyDashboard.customWidgets')}</h2>
              {customWidgets.length > 0 && (
                <p className='text-xs text-slate-500'>Drag to reorder &middot; <HiSwitchHorizontal className='w-3.5 h-3.5 inline' aria-hidden='true' />{t('agencyDashboard.toResize')}</p>
              )}
            </div>
            {customWidgets.length > 0 ? (
              <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'>
                {customWidgets.map((widget) => (
                  <CustomWidget
                    key={widget.id}
                    widget={widget}
                    onRemove={removeWidget}
                    onToggleSize={toggleWidgetSize}
                    analytics={analytics}
                    propertyStats={propertyStats}
                    teamMembers={teamMembers}
                    fmt={fmt}
                    resolveData={resolveData}
                    statusBreakdown={statusBreakdown}
                    monthlyTrend={monthlyTrend}
                    isDragOver={dragOverId === widget.id}
                    onDragStart={() => handleDragStart(widget.id)}
                    onDragOver={(e) => handleDragOver(e, widget.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={() => handleDrop(widget.id)}
                  />
                ))}
                <button onClick={() => openWidgetModal()} className='bg-white border-2 border-dashed border-slate-200 rounded-xl p-4 min-h-[7rem] flex items-center justify-center text-slate-500 hover:border-slate-400 hover:text-slate-700 transition-colors cursor-pointer col-span-1'>
                  <span className='flex items-center gap-2 text-sm'>
                    <HiPlus className='w-5 h-5' aria-hidden='true' />{t('agencyDashboard.addWidget')}</span>
                </button>
              </div>
            ) : (
              <div className='grid grid-cols-1 lg:grid-cols-3 gap-4'>
                {[1, 2, 3].map((i) => (
                  <button key={i} onClick={() => openWidgetModal()} className='bg-white border-2 border-dashed border-slate-200 rounded-xl p-4 h-28 flex items-center justify-center text-slate-500 hover:border-slate-400 hover:text-slate-700 transition-colors cursor-pointer'>
                    <span className='flex items-center gap-2 text-sm'>
                      <HiPlus className='w-5 h-5' aria-hidden='true' />{t('agencyDashboard.addWidget')}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
        </>
      )}

      {/* Add Widget Modal */}
      {showAddWidgetModal && (
        <div className='fixed inset-0 !mt-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4'>
          <div ref={widgetModalRef} role='dialog' aria-modal='true' aria-labelledby='ad-widget-title' tabIndex={-1} className='bg-white rounded-xl shadow-2xl w-full max-w-lg focus:outline-none'>
            <div className='px-6 py-4 border-b border-slate-200 flex items-center justify-between'>
              <div className='flex items-center gap-2'>
                {widgetStep === 'preset' && (
                  <button onClick={() => setWidgetStep('type')} aria-label='Back to widget types' className='p-1 rounded hover:bg-slate-100 text-slate-500'>
                    <svg aria-hidden='true' className='w-5 h-5' fill='none' stroke='currentColor' viewBox='0 0 24 24'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M15 19l-7-7 7-7' /></svg>
                  </button>
                )}
                <h2 id='ad-widget-title' className='text-lg font-semibold text-slate-900 flex items-center gap-2'>
                  {widgetStep === 'type' ? (
                    'Add Widget'
                  ) : (
                    <>
                      {selectedWidgetType?.icon && <selectedWidgetType.icon className='w-5 h-5 text-slate-500' aria-hidden='true' />}
                      {selectedWidgetType?.label}
                    </>
                  )}
                </h2>
              </div>
              <button onClick={() => setShowAddWidgetModal(false)} aria-label='Close' className='p-1 rounded hover:bg-slate-100 text-slate-500'><HiX className='w-5 h-5' aria-hidden='true' /></button>
            </div>
            <div className='p-6'>
              {widgetStep === 'type' ? (
                <>
                  <p className='text-sm text-slate-600 mb-4'>{t('agencyDashboard.chooseAWidgetType')}</p>
                  <div className='grid grid-cols-2 gap-3'>
                    {WIDGET_TYPES.map((w) => {
                      const WIcon = w.icon;
                      return (
                        <button key={w.id} onClick={() => selectWidgetType(w)} className='p-4 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors text-left group'>
                          <div className='w-8 h-8 rounded-lg bg-slate-100 group-hover:bg-indigo-100 flex items-center justify-center mb-3 transition-colors'>
                            <WIcon className='w-4 h-4 text-slate-500 group-hover:text-indigo-600' aria-hidden='true' />
                          </div>
                          <div className='font-medium text-slate-900 text-sm'>{w.label}</div>
                          <div className='text-xs text-slate-500 mt-1'>{w.description}</div>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <>
                  <p className='text-sm text-slate-600 mb-4'>{t('agencyDashboard.selectDataToDisplay')}</p>
                  <div className='space-y-2'>
                    {(WIDGET_PRESETS[selectedWidgetType?.id] || []).map((preset) => (
                      <button key={preset.key} onClick={() => addWidget(selectedWidgetType, preset)} className='w-full p-3 border border-slate-200 rounded-lg hover:border-slate-400 hover:bg-slate-50 transition-colors text-left flex items-center justify-between'>
                        <span className='font-medium text-slate-900 text-sm'>{preset.label}</span>
                        <HiPlus className='w-4 h-4 text-slate-400' aria-hidden='true' />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className='fixed inset-0 !mt-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4'>
          <div ref={inviteModalRef} role='dialog' aria-modal='true' aria-labelledby='ad-invite-title' tabIndex={-1} className='bg-white rounded-xl shadow-2xl w-full max-w-md focus:outline-none'>
            <div className='px-6 py-4 border-b border-slate-200 flex items-center justify-between'>
              <h2 id='ad-invite-title' className='text-lg font-semibold text-slate-900'>{t('agencyDashboard.inviteTeamMember')}</h2>
              <button onClick={closeInviteModal} aria-label='Close' className='p-1 rounded hover:bg-slate-100 text-slate-500'><HiX className='w-5 h-5' aria-hidden='true' /></button>
            </div>
            <div className='p-6 space-y-4'>
              {inviteSuccess && (
                <div className='bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-700 whitespace-pre-wrap leading-relaxed'>{inviteSuccess}</div>
              )}
              {inviteError && (
                <div className='bg-rose-50 border border-rose-200 rounded-lg p-3 text-sm text-rose-700'>{inviteError}</div>
              )}
              <Input
                label={t('agencyDashboard.emailAddress')}
                type='email'
                placeholder={t('agencyDashboard.colleagueCompanyCom')}
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
              <Select
                label={t('agencyDashboard.role')}
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
              >
                <option value='employee'>{t('agencyDashboard.employee')}</option>
              </Select>
              <Textarea
                label='Message (optional)'
                rows={3}
                placeholder={t('agencyDashboard.addAPersonalMessage')}
                value={inviteMessage}
                onChange={(e) => setInviteMessage(e.target.value)}
              />
              <div className='flex items-center justify-end gap-3 pt-2'>
                <button onClick={closeInviteModal} className='px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors'>{t('agencyDashboard.cancel')}</button>
                <button
                  onClick={handleSendInvite}
                  disabled={inviteLoading || !inviteEmail.trim()}
                  className='px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 rounded-lg transition-colors'
                >
                  {inviteLoading ? 'Sending...' : 'Send Invite'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

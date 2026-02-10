import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { useBuyerView } from '../contexts/BuyerViewContext';
import { apiClient } from '../utils/http';
import Chart from 'react-apexcharts';
import {
  HiPlus, HiSearch, HiFilter, HiUsers, HiChevronDown, HiStar,
  HiDotsHorizontal, HiTrendingUp, HiClock, HiCurrencyDollar,
  HiChartBar, HiX, HiCheck, HiPencil, HiEye, HiMail,
  HiHome, HiUserGroup, HiClipboardList, HiRefresh,
  HiArrowsExpand, HiSwitchHorizontal,
} from 'react-icons/hi';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const STATUS_COLORS = {
  available: '#f59e0b',
  under_negotiation: '#3b82f6',
  sold: '#10b981',
};

const WIDGET_TYPES = [
  { id: 'number', label: 'Numbers', icon: '🔢', description: 'Display a single number metric' },
  { id: 'chart', label: 'Chart', icon: '📊', description: 'Bar, line, or pie chart' },
  { id: 'battery', label: 'Battery', icon: '🔋', description: 'Progress indicator' },
  { id: 'timeline', label: 'Timeline', icon: '📅', description: 'Recent activity feed' },
  { id: 'table', label: 'Table', icon: '📋', description: 'Data table view' },
  { id: 'workload', label: 'Workload', icon: '👥', description: 'Team workload view' },
];

const WIDGET_PRESETS = {
  number: [
    { key: 'total_properties', label: 'Total Properties', dataPath: 'properties.total' },
    { key: 'available', label: 'Available Properties', dataPath: 'properties.available' },
    { key: 'sold', label: 'Sold Properties', dataPath: 'properties.sold' },
    { key: 'under_negotiation', label: 'Under Negotiation', dataPath: 'properties.underNegotiation' },
    { key: 'total_buyers', label: 'Total Buyers', dataPath: 'buyers.total' },
    { key: 'active_buyers', label: 'Active Buyers', dataPath: 'buyers.active' },
    { key: 'matched_buyers', label: 'Matched Buyers', dataPath: 'buyers.matched' },
    { key: 'closed_buyers', label: 'Closed Buyers', dataPath: 'buyers.closed' },
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

function loadWidgetsFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    // Ensure every widget has a span (migration from older format)
    return JSON.parse(raw).map((w) => ({ ...w, span: w.span || WIDGET_DEFAULT_SPAN[w.type] || 'sm' }));
  } catch { return []; }
}

function saveWidgetsToStorage(widgets) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets)); } catch {}
}

function CustomWidget({ widget, onRemove, onToggleSize, analytics, propertyStats, teamMembers, fmt, resolveData, statusBreakdown, monthlyTrend, isDragOver, onDragStart, onDragOver, onDragLeave, onDrop }) {
  const props = analytics?.properties || {};
  const buyers = analytics?.buyers || {};
  const recentListings = analytics?.recent?.listings || [];
  const recentBuyers = analytics?.recent?.buyers || [];

  const renderContent = () => {
    // --- Number ---
    if (widget.type === 'number') {
      const value = resolveData(widget.dataPath);
      return <div className='text-3xl font-bold text-slate-900'>{fmt(value)}</div>;
    }

    // --- Chart ---
    if (widget.type === 'chart') {
      if (widget.preset === 'status_bar') {
        if (!statusBreakdown.length) return <p className='text-slate-400 text-sm'>No data</p>;
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
        if (!cats.length) return <p className='text-slate-400 text-sm'>No data</p>;
        const max = Math.max(...cats.map((c) => c.count), 1);
        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];
        return (
          <div className='h-36 flex items-end justify-center gap-6'>
            {cats.map((c, i) => (
              <div key={i} className='flex flex-col items-center'>
                <span className='text-xs font-bold text-slate-700 mb-1'>{c.count}</span>
                <div className='w-12 rounded-t' style={{ height: `${Math.max((c.count / max) * 100, 6)}px`, backgroundColor: colors[i % colors.length] }} />
                <span className='text-[10px] text-slate-500 mt-1 capitalize'>{c._id || 'Other'}</span>
              </div>
            ))}
          </div>
        );
      }
      if (widget.preset === 'monthly_line') {
        if (monthlyTrend.length < 2) return <p className='text-slate-400 text-sm'>Not enough data</p>;
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
        if (!cities.length) return <p className='text-slate-400 text-sm'>No data</p>;
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
      if (!items.length) return <p className='text-slate-400 text-sm'>No recent activity</p>;
      return (
        <div className='space-y-3'>
          {items.map((item, i) => (
            <div key={i} className='flex items-start gap-3'>
              <div className={`w-2 h-2 mt-1.5 rounded-full flex-shrink-0 ${item.type === 'listing' ? 'bg-blue-500' : 'bg-purple-500'}`} />
              <div className='min-w-0 flex-1'>
                <p className='text-sm text-slate-800 truncate'>{item.name}</p>
                <p className='text-[10px] text-slate-500'>{item.type === 'listing' ? 'Property' : 'Buyer'} - <span className='capitalize'>{(item.status || '').replace('_', ' ')}</span> - {new Date(item.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
              </div>
            </div>
          ))}
        </div>
      );
    }

    // --- Table ---
    if (widget.type === 'table') {
      if (widget.preset === 'recent_listings') {
        if (!recentListings.length) return <p className='text-slate-400 text-sm'>No listings</p>;
        return (
          <div className='overflow-x-auto'>
            <table className='w-full text-xs'>
              <thead><tr className='border-b border-slate-200'><th className='text-left py-1.5 text-slate-500 font-medium'>Name</th><th className='text-left py-1.5 text-slate-500 font-medium'>City</th><th className='text-left py-1.5 text-slate-500 font-medium'>Status</th></tr></thead>
              <tbody>
                {recentListings.slice(0, 5).map((l) => (
                  <tr key={l._id} className='border-b border-slate-50'>
                    <td className='py-1.5 text-slate-800 truncate max-w-[120px]'>{l.name}</td>
                    <td className='py-1.5 text-slate-600'>{l.city || '-'}</td>
                    <td className='py-1.5'><span className={`capitalize px-1.5 py-0.5 rounded text-[10px] font-medium ${l.status === 'available' ? 'bg-green-100 text-green-700' : l.status === 'sold' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>{(l.status || '').replace('_', ' ')}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      if (widget.preset === 'recent_buyers') {
        if (!recentBuyers.length) return <p className='text-slate-400 text-sm'>No buyers</p>;
        return (
          <div className='overflow-x-auto'>
            <table className='w-full text-xs'>
              <thead><tr className='border-b border-slate-200'><th className='text-left py-1.5 text-slate-500 font-medium'>Name</th><th className='text-left py-1.5 text-slate-500 font-medium'>Phone</th><th className='text-left py-1.5 text-slate-500 font-medium'>Status</th></tr></thead>
              <tbody>
                {recentBuyers.slice(0, 5).map((b) => (
                  <tr key={b._id} className='border-b border-slate-50'>
                    <td className='py-1.5 text-slate-800 truncate max-w-[120px]'>{b.buyerName}</td>
                    <td className='py-1.5 text-slate-600'>{b.buyerPhone || '-'}</td>
                    <td className='py-1.5'><span className={`capitalize px-1.5 py-0.5 rounded text-[10px] font-medium ${b.status === 'active' ? 'bg-green-100 text-green-700' : b.status === 'matched' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'}`}>{b.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      if (widget.preset === 'top_cities') {
        const cities = (props.byCity || []).slice(0, 6);
        if (!cities.length) return <p className='text-slate-400 text-sm'>No data</p>;
        return (
          <div className='overflow-x-auto'>
            <table className='w-full text-xs'>
              <thead><tr className='border-b border-slate-200'><th className='text-left py-1.5 text-slate-500 font-medium'>City</th><th className='text-right py-1.5 text-slate-500 font-medium'>Properties</th></tr></thead>
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
      if (!teamMembers.length) return <p className='text-slate-400 text-sm'>No team members found</p>;
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

    return <p className='text-slate-400 text-sm'>Widget not configured</p>;
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`bg-white border-2 rounded-xl p-5 flex flex-col overflow-hidden transition-all ${
        isDragOver ? 'border-blue-400 bg-blue-50/40 scale-[1.02]' : 'border-slate-200'
      } ${widget.span === 'lg' ? 'col-span-1 lg:col-span-2' : 'col-span-1'}`}
    >
      <div className='flex items-center justify-between mb-3 flex-shrink-0'>
        <div className='flex items-center gap-2 cursor-grab active:cursor-grabbing flex-1 min-w-0'>
          <span className='text-lg'>{widget.icon}</span>
          <span className='text-sm font-semibold text-slate-700 truncate'>{widget.label}</span>
        </div>
        <div className='flex items-center gap-1 flex-shrink-0'>
          <button onClick={() => onToggleSize(widget.id)} title={widget.span === 'lg' ? 'Make smaller' : 'Make wider'} className='text-slate-400 hover:text-slate-600 p-1 rounded transition-colors'>
            <HiSwitchHorizontal className='w-4 h-4' />
          </button>
          <button onClick={() => onRemove(widget.id)} className='text-slate-400 hover:text-rose-500 p-1 rounded transition-colors'>
            <HiX className='w-4 h-4' />
          </button>
        </div>
      </div>
      <div className='flex-1 overflow-auto'>{renderContent()}</div>
    </div>
  );
}

export default function AgencyDashboard() {
  const { currentUser } = useSelector((state) => state.user);
  const { isBuyerViewMode } = useBuyerView();

  const [analytics, setAnalytics] = useState(null);
  const [propertyStats, setPropertyStats] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // UI states
  const [searchFilter, setSearchFilter] = useState('');
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
      ];
      if (isAdmin) {
        requests.push(apiClient.get('/user/list'));
      }
      const results = await Promise.all(requests);
      const analyticsData = results[0]?.data || results[0];
      setAnalytics(analyticsData);

      const statsData = results[1]?.data || results[1];
      setPropertyStats(statsData);

      if (isAdmin && results[2]) {
        const users = Array.isArray(results[2]) ? results[2] : results[2]?.data || [];
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

  // Derived data
  const props = analytics?.properties || {};
  const buyers = analytics?.buyers || {};
  const employees = analytics?.employees || {};
  const recentListings = analytics?.recent?.listings || [];
  const recentBuyers = analytics?.recent?.buyers || [];

  const statusBreakdown = useMemo(() => {
    const raw = propertyStats?.statusBreakdown || [];
    return raw.map((s) => ({
      label: (s._id || 'unknown').replace('_', ' '),
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
  const fmt = (n) => new Intl.NumberFormat('en-IN').format(n || 0);

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
    const newWidget = { id: `w-${Date.now()}`, type: wt.id, label: preset.label, icon: wt.icon, preset: preset.key, dataPath: preset.dataPath, span };
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
    return path.split('.').reduce((obj, key) => obj?.[key], analytics) || 0;
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
      const username = inviteEmail.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').slice(0, 20) || 'user';
      const tempPassword = `Invite@${Date.now().toString(36)}`;
      await apiClient.post('/user/employee', {
        username,
        email: inviteEmail.trim(),
        password: tempPassword,
        firstName: '',
        lastName: '',
      });
      setInviteSuccess(`Invite sent! Employee account created for ${inviteEmail}`);
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

  if (!canAccess) {
    return (
      <div className='min-h-screen flex items-center justify-center'>
        <p className='text-slate-600'>Access denied</p>
      </div>
    );
  }

  const q = searchFilter.toLowerCase().trim();
  const shouldShow = (...labels) => !q || labels.some((l) => l.toLowerCase().includes(q));
  const filteredWidgets = customWidgets.filter((w) => shouldShow(w.label));

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div className='flex flex-col md:flex-row md:items-center md:justify-between gap-4'>
        <div className='flex items-center gap-3'>
          <h1 className='text-xl font-bold text-slate-900 flex items-center gap-2'>
            Agency Dashboard
            <button onClick={() => setIsFavorite(!isFavorite)} className={`transition-colors ${isFavorite ? 'text-amber-400' : 'text-slate-300 hover:text-amber-400'}`}>
              <HiStar className='w-5 h-5' />
            </button>
          </h1>
        </div>
        <div className='flex items-center gap-2'>
          <button onClick={fetchData} className='px-3 py-1.5 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-sm font-medium flex items-center gap-1.5 transition-colors'>
            <HiRefresh className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {isAdmin && (
            <button onClick={() => setShowInviteModal(true)} className='px-3 py-1.5 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-sm font-medium transition-colors flex items-center gap-1.5'>
              <HiMail className='w-4 h-4' />
              Invite
            </button>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className='flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-lg p-2'>
        <button onClick={() => openWidgetModal()} className='px-3 py-1.5 rounded-md bg-slate-900 text-white text-sm font-medium flex items-center gap-1.5 hover:bg-slate-800 transition-colors'>
          <HiPlus className='w-4 h-4' />
          Add widget
        </button>
        <div className='h-6 w-px bg-slate-200' />
        <div className='flex items-center gap-2 px-3 py-1.5 rounded-md border border-slate-200 bg-white text-sm flex-1 max-w-xs'>
          <HiSearch className='w-4 h-4 text-slate-400' />
          <input className='bg-transparent outline-none flex-1 text-slate-700 placeholder:text-slate-400 text-sm' placeholder='Filter widgets...' value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)} />
          {searchFilter && (<button onClick={() => setSearchFilter('')} className='text-slate-400 hover:text-slate-600'><HiX className='w-4 h-4' /></button>)}
        </div>

        {/* People dropdown */}
        {isAdmin && teamMembers.length > 0 && (
          <div className='relative'>
            <button onClick={() => { setShowPeopleDropdown(!showPeopleDropdown); setShowFilterDropdown(false); }} className={`px-3 py-1.5 rounded-md border text-sm font-medium flex items-center gap-1.5 transition-colors ${selectedPeople.length > 0 ? 'border-slate-900 bg-slate-100 text-slate-900' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
              <HiUsers className='w-4 h-4' />
              People
              {selectedPeople.length > 0 && (<span className='bg-slate-900 text-white text-xs px-1.5 rounded-full'>{selectedPeople.length}</span>)}
            </button>
            {showPeopleDropdown && (
              <div className='absolute top-full left-0 mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-lg z-20'>
                <div className='p-2'>
                  <div className='text-xs font-medium text-slate-500 px-2 py-1 mb-1'>Team Members</div>
                  {teamMembers.map((person) => (
                    <button key={person.id} onClick={() => togglePerson(person.id)} className={`w-full text-left px-2 py-2 rounded text-sm flex items-center gap-3 ${selectedPeople.includes(person.id) ? 'bg-slate-100' : 'hover:bg-slate-50'}`}>
                      <div className='w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-white text-sm font-medium'>{person.avatar}</div>
                      <div className='flex-1'>
                        <div className='font-medium text-slate-900'>{person.name}</div>
                        <div className='text-xs text-slate-500 capitalize'>{person.role}</div>
                      </div>
                      {selectedPeople.includes(person.id) && <HiCheck className='w-5 h-5 text-slate-900' />}
                    </button>
                  ))}
                  {selectedPeople.length > 0 && (
                    <button onClick={() => { setSelectedPeople([]); setShowPeopleDropdown(false); }} className='w-full text-left px-2 py-1.5 rounded text-sm text-rose-600 hover:bg-rose-50 mt-1'>Clear selection</button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className='bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between'>
          <p className='text-red-700 text-sm'>{error}</p>
          <button onClick={fetchData} className='text-red-700 hover:underline text-sm font-medium'>Retry</button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'>
          {[1,2,3,4].map((i) => (
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
          <div className='pt-2'>
            <h2 className='text-lg font-bold text-slate-900'>Properties Overview</h2>
            <p className='text-slate-500 text-sm mt-0.5'>Real-time metrics from your portfolio</p>
          </div>

          {/* KPI Cards */}
          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'>
            {shouldShow('total properties', 'properties overview', 'kpi') && (
              <div className='bg-white border border-slate-200 rounded-xl p-5'>
                <div className='flex items-center gap-2 mb-2'>
                  <div className='w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center'><HiHome className='w-5 h-5 text-blue-600' /></div>
                  <span className='text-sm font-medium text-slate-600'>Total Properties</span>
                </div>
                <div className='text-3xl font-bold text-slate-900'>{fmt(props.total)}</div>
                <div className='flex items-center gap-3 mt-2 text-xs text-slate-500'>
                  <span className='text-green-600 font-medium'>{fmt(props.available)} available</span>
                  <span>{fmt(props.sold)} sold</span>
                </div>
              </div>
            )}
            {shouldShow('under negotiation', 'deals', 'kpi') && (
              <div className='bg-white border border-slate-200 rounded-xl p-5'>
                <div className='flex items-center gap-2 mb-2'>
                  <div className='w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center'><HiClock className='w-5 h-5 text-amber-600' /></div>
                  <span className='text-sm font-medium text-slate-600'>Under Negotiation</span>
                </div>
                <div className='text-3xl font-bold text-slate-900'>{fmt(props.underNegotiation)}</div>
                <div className='text-xs text-slate-500 mt-2'>Active deals in progress</div>
              </div>
            )}
            {shouldShow('buyer requirements', 'buyers', 'kpi') && (
              <div className='bg-white border border-slate-200 rounded-xl p-5'>
                <div className='flex items-center gap-2 mb-2'>
                  <div className='w-9 h-9 rounded-lg bg-purple-100 flex items-center justify-center'><HiUserGroup className='w-5 h-5 text-purple-600' /></div>
                  <span className='text-sm font-medium text-slate-600'>Buyer Requirements</span>
                </div>
                <div className='text-3xl font-bold text-slate-900'>{fmt(buyers.total)}</div>
                <div className='flex items-center gap-3 mt-2 text-xs text-slate-500'>
                  <span className='text-green-600 font-medium'>{fmt(buyers.active)} active</span>
                  <span>{fmt(buyers.matched)} matched</span>
                </div>
              </div>
            )}
            {shouldShow('team', 'employees', 'kpi') && isAdmin && (
              <div className='bg-white border border-slate-200 rounded-xl p-5'>
                <div className='flex items-center gap-2 mb-2'>
                  <div className='w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center'><HiUsers className='w-5 h-5 text-emerald-600' /></div>
                  <span className='text-sm font-medium text-slate-600'>Team</span>
                </div>
                <div className='text-3xl font-bold text-slate-900'>{fmt(employees.total)}</div>
                <div className='text-xs text-slate-500 mt-2'>
                  <span className='text-green-600 font-medium'>{fmt(employees.active)} active</span> employees
                </div>
              </div>
            )}
            {!isAdmin && shouldShow('closed buyers', 'kpi') && (
              <div className='bg-white border border-slate-200 rounded-xl p-5'>
                <div className='flex items-center gap-2 mb-2'>
                  <div className='w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center'><HiCheck className='w-5 h-5 text-emerald-600' /></div>
                  <span className='text-sm font-medium text-slate-600'>Closed Buyers</span>
                </div>
                <div className='text-3xl font-bold text-slate-900'>{fmt(buyers.closed)}</div>
                <div className='text-xs text-slate-500 mt-2'>Successfully matched</div>
              </div>
            )}
          </div>

          {/* Charts */}
          <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
            {/* Listing status bar chart */}
            {shouldShow('listing status', 'chart', 'status') && (
              <div className='bg-white border border-slate-200 rounded-xl p-5'>
                <h3 className='text-sm font-semibold text-slate-700 mb-4'>Listing Status</h3>
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
                      xaxis: { categories: statusBreakdown.map((s) => s.label), labels: { style: { fontSize: '11px', colors: '#64748b' } } },
                      yaxis: { labels: { style: { fontSize: '11px', colors: '#64748b' } } },
                      grid: { borderColor: '#e2e8f0', strokeDashArray: 4 },
                      tooltip: { theme: 'light' },
                    }}
                    series={[{ name: 'Properties', data: statusBreakdown.map((s) => s.count) }]}
                  />
                ) : (
                  <div className='h-48 flex items-center justify-center text-slate-400 text-sm'>No data yet</div>
                )}
              </div>
            )}

            {/* Monthly trend line chart */}
            {shouldShow('monthly trend', 'chart', 'listings by month') && (
              <div className='bg-white border border-slate-200 rounded-xl p-5'>
                <h3 className='text-sm font-semibold text-slate-700 mb-4'>New Listings by Month</h3>
                {monthlyTrend.length > 1 ? (
                  <Chart
                    type='area'
                    height={200}
                    options={{
                      chart: { toolbar: { show: false }, fontFamily: 'inherit', sparkline: { enabled: false } },
                      stroke: { curve: 'smooth', width: 3 },
                      colors: ['#3b82f6'],
                      fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.1, stops: [0, 90, 100] } },
                      dataLabels: { enabled: false },
                      xaxis: { categories: monthlyTrend.map((d) => d.month), labels: { style: { fontSize: '11px', colors: '#64748b' } } },
                      yaxis: { labels: { style: { fontSize: '11px', colors: '#64748b' } }, min: 0 },
                      grid: { borderColor: '#e2e8f0', strokeDashArray: 4 },
                      markers: { size: 5, colors: ['#3b82f6'], strokeColors: '#fff', strokeWidth: 2, hover: { size: 7 } },
                      tooltip: { theme: 'light' },
                    }}
                    series={[{ name: 'Listings', data: monthlyTrend.map((d) => d.count) }]}
                  />
                ) : (
                  <div className='h-48 flex items-center justify-center text-slate-400 text-sm'>Not enough data for chart</div>
                )}
              </div>
            )}
          </div>

          {/* Properties by Category & City */}
          <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
            {shouldShow('category', 'residential', 'commercial', 'land') && props.byCategory?.length > 0 && (
              <div className='bg-white border border-slate-200 rounded-xl p-5'>
                <h3 className='text-sm font-semibold text-slate-700 mb-4'>Properties by Category</h3>
                <Chart
                  type='donut'
                  height={220}
                  options={{
                    chart: { fontFamily: 'inherit' },
                    labels: props.byCategory.map((cat) => cat._id || 'Unknown'),
                    colors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'],
                    legend: { position: 'bottom', fontSize: '12px', labels: { colors: '#64748b' } },
                    dataLabels: { enabled: true, style: { fontSize: '11px', fontWeight: 600 } },
                    plotOptions: { pie: { donut: { size: '55%', labels: { show: true, total: { show: true, label: 'Total', fontSize: '12px', color: '#64748b', formatter: () => props.total } } } } },
                    stroke: { width: 2, colors: ['#fff'] },
                    tooltip: { theme: 'light' },
                  }}
                  series={props.byCategory.map((cat) => cat.count)}
                />
              </div>
            )}

            {shouldShow('city', 'top cities', 'location') && props.byCity?.length > 0 && (
              <div className='bg-white border border-slate-200 rounded-xl p-5'>
                <h3 className='text-sm font-semibold text-slate-700 mb-4'>Top Cities</h3>
                <Chart
                  type='bar'
                  height={220}
                  options={{
                    chart: { toolbar: { show: false }, fontFamily: 'inherit' },
                    plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: '60%' } },
                    colors: ['#1e293b'],
                    dataLabels: { enabled: true, style: { fontSize: '11px', fontWeight: 600 }, offsetX: -5 },
                    xaxis: { categories: props.byCity.slice(0, 6).map((c) => c._id), labels: { style: { fontSize: '11px', colors: '#64748b' } } },
                    yaxis: { labels: { style: { fontSize: '11px', colors: '#64748b' } } },
                    grid: { borderColor: '#e2e8f0', strokeDashArray: 4, xaxis: { lines: { show: true } }, yaxis: { lines: { show: false } } },
                    tooltip: { theme: 'light' },
                  }}
                  series={[{ name: 'Properties', data: props.byCity.slice(0, 6).map((c) => c.count) }]}
                />
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
            {shouldShow('recent listings', 'activity', 'properties') && (
              <div className='bg-white border border-slate-200 rounded-xl p-5'>
                <div className='flex items-center justify-between mb-4'>
                  <h3 className='text-sm font-semibold text-slate-700'>Recent Listings</h3>
                  <Link to='/properties' className='text-xs font-medium text-slate-500 hover:text-slate-900'>View all</Link>
                </div>
                <div className='space-y-3'>
                  {recentListings.length > 0 ? recentListings.map((l) => (
                    <div key={l._id} className='flex items-center justify-between p-3 bg-slate-50 rounded-lg'>
                      <div className='min-w-0 flex-1'>
                        <p className='font-medium text-slate-900 text-sm truncate'>{l.name}</p>
                        <p className='text-xs text-slate-500 truncate'>{l.city || 'N/A'}{l.locality ? `, ${l.locality}` : ''}</p>
                      </div>
                      <span className={`ml-3 flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                        l.status === 'available' ? 'bg-green-100 text-green-700' :
                        l.status === 'sold' ? 'bg-blue-100 text-blue-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>{(l.status || '').replace('_', ' ')}</span>
                    </div>
                  )) : (
                    <p className='text-slate-400 text-sm text-center py-4'>No recent listings</p>
                  )}
                </div>
              </div>
            )}

            {shouldShow('recent buyers', 'activity', 'buyer requirements') && (
              <div className='bg-white border border-slate-200 rounded-xl p-5'>
                <div className='flex items-center justify-between mb-4'>
                  <h3 className='text-sm font-semibold text-slate-700'>Recent Buyer Requirements</h3>
                  <Link to='/buyer-requirements' className='text-xs font-medium text-slate-500 hover:text-slate-900'>View all</Link>
                </div>
                <div className='space-y-3'>
                  {recentBuyers.length > 0 ? recentBuyers.map((b) => (
                    <div key={b._id} className='flex items-center justify-between p-3 bg-slate-50 rounded-lg'>
                      <div className='min-w-0 flex-1'>
                        <p className='font-medium text-slate-900 text-sm truncate'>{b.buyerName}</p>
                        <p className='text-xs text-slate-500 truncate'>{b.buyerPhone || 'No phone'}</p>
                      </div>
                      <span className={`ml-3 flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                        b.status === 'active' ? 'bg-green-100 text-green-700' :
                        b.status === 'matched' ? 'bg-blue-100 text-blue-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>{b.status}</span>
                    </div>
                  )) : (
                    <p className='text-slate-400 text-sm text-center py-4'>No recent buyers</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Custom widgets - draggable grid */}
          <div>
            <div className='flex items-center justify-between mb-4'>
              <h2 className='text-lg font-bold text-slate-900'>Custom Widgets</h2>
              {customWidgets.length > 0 && (
                <p className='text-xs text-slate-400'>Drag to reorder &middot; <HiSwitchHorizontal className='w-3.5 h-3.5 inline' /> to resize</p>
              )}
            </div>
            {filteredWidgets.length > 0 ? (
              <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'>
                {filteredWidgets.map((widget) => (
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
                <button onClick={() => openWidgetModal()} className='bg-white border-2 border-dashed border-slate-200 rounded-xl p-4 min-h-[7rem] flex items-center justify-center text-slate-400 hover:border-slate-400 hover:text-slate-600 transition-colors cursor-pointer col-span-1'>
                  <span className='flex items-center gap-2 text-sm'>
                    <HiPlus className='w-5 h-5' />
                    Add widget
                  </span>
                </button>
              </div>
            ) : (
              <div className='grid grid-cols-1 lg:grid-cols-3 gap-4'>
                {[1, 2, 3].map((i) => (
                  <button key={i} onClick={() => openWidgetModal()} className='bg-white border-2 border-dashed border-slate-200 rounded-xl p-4 h-28 flex items-center justify-center text-slate-400 hover:border-slate-400 hover:text-slate-600 transition-colors cursor-pointer'>
                    <span className='flex items-center gap-2 text-sm'>
                      <HiPlus className='w-5 h-5' />
                      Add widget
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Add Widget Modal */}
      {showAddWidgetModal && (
        <div className='fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4'>
          <div className='bg-white rounded-xl shadow-2xl w-full max-w-lg'>
            <div className='px-6 py-4 border-b border-slate-200 flex items-center justify-between'>
              <div className='flex items-center gap-2'>
                {widgetStep === 'preset' && (
                  <button onClick={() => setWidgetStep('type')} className='p-1 rounded hover:bg-slate-100 text-slate-500'>
                    <svg className='w-5 h-5' fill='none' stroke='currentColor' viewBox='0 0 24 24'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M15 19l-7-7 7-7' /></svg>
                  </button>
                )}
                <h2 className='text-lg font-semibold text-slate-900'>
                  {widgetStep === 'type' ? 'Add Widget' : `${selectedWidgetType?.icon} ${selectedWidgetType?.label}`}
                </h2>
              </div>
              <button onClick={() => setShowAddWidgetModal(false)} className='p-1 rounded hover:bg-slate-100 text-slate-500'><HiX className='w-5 h-5' /></button>
            </div>
            <div className='p-6'>
              {widgetStep === 'type' ? (
                <>
                  <p className='text-sm text-slate-600 mb-4'>Choose a widget type:</p>
                  <div className='grid grid-cols-2 gap-3'>
                    {WIDGET_TYPES.map((w) => (
                      <button key={w.id} onClick={() => selectWidgetType(w)} className='p-4 border border-slate-200 rounded-lg hover:border-slate-400 hover:bg-slate-50 transition-colors text-left'>
                        <div className='text-2xl mb-2'>{w.icon}</div>
                        <div className='font-medium text-slate-900 text-sm'>{w.label}</div>
                        <div className='text-xs text-slate-500 mt-1'>{w.description}</div>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <p className='text-sm text-slate-600 mb-4'>Select data to display:</p>
                  <div className='space-y-2'>
                    {(WIDGET_PRESETS[selectedWidgetType?.id] || []).map((preset) => (
                      <button key={preset.key} onClick={() => addWidget(selectedWidgetType, preset)} className='w-full p-3 border border-slate-200 rounded-lg hover:border-slate-400 hover:bg-slate-50 transition-colors text-left flex items-center justify-between'>
                        <span className='font-medium text-slate-900 text-sm'>{preset.label}</span>
                        <HiPlus className='w-4 h-4 text-slate-400' />
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
        <div className='fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4'>
          <div className='bg-white rounded-xl shadow-2xl w-full max-w-md'>
            <div className='px-6 py-4 border-b border-slate-200 flex items-center justify-between'>
              <h2 className='text-lg font-semibold text-slate-900'>Invite Team Member</h2>
              <button onClick={closeInviteModal} className='p-1 rounded hover:bg-slate-100 text-slate-500'><HiX className='w-5 h-5' /></button>
            </div>
            <div className='p-6 space-y-4'>
              {inviteSuccess && (
                <div className='bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-700'>{inviteSuccess}</div>
              )}
              {inviteError && (
                <div className='bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700'>{inviteError}</div>
              )}
              <div>
                <label className='block text-sm font-medium text-slate-700 mb-1'>Email address *</label>
                <input
                  type='email'
                  placeholder='colleague@company.com'
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className='w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400 outline-none'
                />
              </div>
              <div>
                <label className='block text-sm font-medium text-slate-700 mb-1'>Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className='w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400 outline-none bg-white'
                >
                  <option value='employee'>Employee</option>
                </select>
              </div>
              <div>
                <label className='block text-sm font-medium text-slate-700 mb-1'>Message (optional)</label>
                <textarea
                  rows={3}
                  placeholder='Add a personal message...'
                  value={inviteMessage}
                  onChange={(e) => setInviteMessage(e.target.value)}
                  className='w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400 outline-none resize-none'
                />
              </div>
              <div className='flex items-center justify-end gap-3 pt-2'>
                <button onClick={closeInviteModal} className='px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors'>Cancel</button>
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

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchWithRefresh, parseJsonSafely } from '../utils/http';
import {
  HiChartBar,
  HiUsers,
  HiCurrencyRupee,
  HiHome,
  HiTrendingUp,
  HiTrendingDown,
  HiClock,
  HiRefresh,
  HiArrowLeft,
  HiCheckCircle,
  HiExclamationCircle,
  HiFilter,
  HiDownload
} from 'react-icons/hi';
import { FaSpinner, FaUserTie, FaHandshake } from 'react-icons/fa';

export default function Analytics() {
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });
  const [activeTab, setActiveTab] = useState('overview');
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadData();
  }, [dateRange, activeTab]);

  async function loadData(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const params = `?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`;

      if (activeTab === 'overview') {
        const dashboardRes = await fetchWithRefresh(`/api/analytics/dashboard`);
        const dashboardData = await parseJsonSafely(dashboardRes);
        if (dashboardData.success) {
          setData(prev => ({ ...prev, dashboard: dashboardData.data }));
        }
      }

      if (activeTab === 'overview' || activeTab === 'properties') {
        const propertyRes = await fetchWithRefresh(`/api/analytics/properties${params}`);
        const propertyData = await parseJsonSafely(propertyRes);
        if (propertyData.success) {
          setData(prev => ({ ...prev, properties: propertyData.data }));
        }
      }

      if (activeTab === 'overview' || activeTab === 'sales') {
        const salesRes = await fetchWithRefresh(`/api/analytics/sales${params}`);
        const salesData = await parseJsonSafely(salesRes);
        if (salesData.success) {
          setData(prev => ({ ...prev, sales: salesData.data }));
        }
      }

      if (activeTab === 'overview' || activeTab === 'leads') {
        const leadsRes = await fetchWithRefresh(`/api/analytics/leads/conversion${params}`);
        const leadsData = await parseJsonSafely(leadsRes);
        if (leadsData.success) {
          setData(prev => ({ ...prev, leads: leadsData.data }));
        }
      }

      if (activeTab === 'overview' || activeTab === 'revenue') {
        const revenueRes = await fetchWithRefresh(`/api/analytics/revenue${params}`);
        const revenueData = await parseJsonSafely(revenueRes);
        if (revenueData.success) {
          setData(prev => ({ ...prev, revenue: revenueData.data }));
        }
      }

      if (activeTab === 'agents') {
        const agentsRes = await fetchWithRefresh(`/api/analytics/agents${params}`);
        const agentsData = await parseJsonSafely(agentsRes);
        if (agentsData.success) {
          setData(prev => ({ ...prev, agents: agentsData.data }));
        }
      }
    } catch (err) {
      console.error('Failed to load analytics:', err);
      setError('Failed to load analytics data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const formatCurrency = (amount) => {
    if (!amount && amount !== 0) return '₹0';
    if (amount >= 10000000) {
      return `₹${(amount / 10000000).toFixed(2)}Cr`;
    } else if (amount >= 100000) {
      return `₹${(amount / 100000).toFixed(2)}L`;
    }
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatNumber = (num) => {
    return new Intl.NumberFormat('en-IN').format(num || 0);
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: HiChartBar },
    { id: 'properties', label: 'Properties', icon: HiHome },
    { id: 'sales', label: 'Sales', icon: FaHandshake },
    { id: 'leads', label: 'Leads', icon: HiUsers },
    { id: 'revenue', label: 'Revenue', icon: HiCurrencyRupee },
    { id: 'agents', label: 'Agents', icon: FaUserTie },
  ];

  const quickDateRanges = [
    { label: '7 Days', days: 7 },
    { label: '30 Days', days: 30 },
    { label: '90 Days', days: 90 },
    { label: '1 Year', days: 365 },
  ];

  const setQuickRange = (days) => {
    setDateRange({
      startDate: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/30">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-16 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between py-4 gap-4">
            {/* Title and Back Button */}
            <div className="flex items-center gap-4">
              <Link
                to="/admin"
                className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <HiArrowLeft className="w-5 h-5 text-slate-600" />
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Analytics Dashboard</h1>
                <p className="text-sm text-slate-500 mt-0.5">
                  Track your real estate performance metrics
                </p>
              </div>
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Quick Date Ranges */}
              <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                {quickDateRanges.map(range => {
                  const currentDays = Math.round((new Date(dateRange.endDate) - new Date(dateRange.startDate)) / (1000 * 60 * 60 * 24));
                  const isActive = currentDays === range.days;
                  return (
                    <button
                      key={range.days}
                      onClick={() => setQuickRange(range.days)}
                      className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                        isActive
                          ? 'bg-white text-blue-600 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {range.label}
                    </button>
                  );
                })}
              </div>

              {/* Date Pickers */}
              <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2">
                <HiFilter className="w-4 h-4 text-slate-400" />
                <input
                  type="date"
                  value={dateRange.startDate}
                  onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                  className="text-sm border-none focus:outline-none focus:ring-0 bg-transparent"
                />
                <span className="text-slate-300">-</span>
                <input
                  type="date"
                  value={dateRange.endDate}
                  onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                  className="text-sm border-none focus:outline-none focus:ring-0 bg-transparent"
                />
              </div>

              {/* Refresh Button */}
              <button
                onClick={() => loadData(true)}
                disabled={refreshing}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                <HiRefresh className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 overflow-x-auto pb-px -mb-px">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-all ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <FaSpinner className="w-10 h-10 text-blue-600 animate-spin" />
            <p className="text-slate-500 mt-4">Loading analytics data...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <HiExclamationCircle className="w-8 h-8 text-red-600" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Failed to Load Data</h3>
            <p className="text-slate-500 mb-4">{error}</p>
            <button
              onClick={() => loadData()}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Overview Tab */}
            {activeTab === 'overview' && data.dashboard && (
              <>
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <MetricCard
                    title="Total Listings"
                    value={formatNumber(data.dashboard.listings?.total || 0)}
                    subtitle={`${formatNumber(data.dashboard.listings?.active || 0)} active`}
                    icon={HiHome}
                    gradient="from-blue-500 to-blue-600"
                    bgGradient="from-blue-50 to-blue-100"
                  />
                  <MetricCard
                    title="Total Clients"
                    value={formatNumber(data.dashboard.clients?.total || 0)}
                    subtitle={`${formatNumber(data.dashboard.clients?.new || 0)} new this month`}
                    icon={HiUsers}
                    gradient="from-emerald-500 to-emerald-600"
                    bgGradient="from-emerald-50 to-emerald-100"
                    trend={data.dashboard.clients?.new > 0 ? 'up' : null}
                  />
                  <MetricCard
                    title="Deals Won"
                    value={formatNumber(data.dashboard.deals?.closedWon || 0)}
                    subtitle={formatCurrency(data.dashboard.deals?.totalValue)}
                    icon={FaHandshake}
                    gradient="from-purple-500 to-purple-600"
                    bgGradient="from-purple-50 to-purple-100"
                  />
                  <MetricCard
                    title="Follow-ups Due"
                    value={formatNumber(data.dashboard.upcomingFollowUps || 0)}
                    subtitle="Next 7 days"
                    icon={HiClock}
                    gradient="from-amber-500 to-orange-500"
                    bgGradient="from-amber-50 to-orange-100"
                    alert={data.dashboard.upcomingFollowUps > 5}
                  />
                </div>

                {/* Client Pipeline */}
                {data.dashboard.clients?.byStatus?.length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
                      <h2 className="text-lg font-semibold text-slate-900">Client Pipeline</h2>
                      <p className="text-sm text-slate-500">Track clients through each stage</p>
                    </div>
                    <div className="p-6">
                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                        {data.dashboard.clients.byStatus.map((item, index) => (
                          <div
                            key={item._id}
                            className={`relative p-4 rounded-xl text-center transition-all hover:scale-105 ${
                              getStatusColor(item._id, index)
                            }`}
                          >
                            <div className="text-2xl font-bold text-slate-800">{formatNumber(item.count)}</div>
                            <div className="text-xs text-slate-600 capitalize mt-1 font-medium">{item._id}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Recent Activity */}
                {data.dashboard.recentActivity?.length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
                      <h2 className="text-lg font-semibold text-slate-900">Recent Activity</h2>
                      <p className="text-sm text-slate-500">Latest client updates</p>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {data.dashboard.recentActivity.map(item => (
                        <div key={item._id} className="flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl flex items-center justify-center text-white font-semibold">
                              {item.name?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                            <div>
                              <div className="font-medium text-slate-900">{item.name}</div>
                              <div className="text-sm text-slate-500 capitalize">{item.status}</div>
                            </div>
                          </div>
                          <div className="text-sm text-slate-400">
                            {new Date(item.updatedAt).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric'
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Properties Tab */}
            {(activeTab === 'overview' || activeTab === 'properties') && data.properties && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
                  <h2 className="text-lg font-semibold text-slate-900">Property Metrics</h2>
                  <p className="text-sm text-slate-500">Breakdown by category and type</p>
                </div>
                <div className="p-6">
                  <div className="grid md:grid-cols-2 gap-8">
                    {/* By Category */}
                    <div>
                      <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4 flex items-center gap-2">
                        <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                        By Category
                      </h3>
                      <div className="space-y-3">
                        {data.properties.byCategory?.slice(0, 5).map((cat, index) => {
                          const total = data.properties.byCategory.reduce((sum, c) => sum + c.count, 0);
                          const percentage = total > 0 ? (cat.count / total) * 100 : 0;
                          return (
                            <div key={cat._id || 'uncategorized'} className="group">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-medium text-slate-700">{cat.categoryName || 'Uncategorized'}</span>
                                <span className="text-sm font-semibold text-slate-900">{formatNumber(cat.count)}</span>
                              </div>
                              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500"
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* By Type */}
                    <div>
                      <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4 flex items-center gap-2">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                        By Type
                      </h3>
                      <div className="space-y-3">
                        {data.properties.byType?.map((type) => (
                          <div key={type._id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                            <span className="text-sm font-medium text-slate-700 capitalize">{type._id}</span>
                            <div className="text-right">
                              <span className="text-sm font-semibold text-slate-900">{formatNumber(type.count)}</span>
                              <span className="text-xs text-slate-500 ml-2">
                                Avg: {formatCurrency(type.avgPrice)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Sales Tab */}
            {(activeTab === 'overview' || activeTab === 'sales') && data.sales && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
                  <h2 className="text-lg font-semibold text-slate-900">Sales Analytics</h2>
                  <p className="text-sm text-slate-500">Deal performance and conversion</p>
                </div>
                <div className="p-6">
                  {/* Sales Summary */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <div className="p-5 bg-gradient-to-br from-green-50 to-emerald-100 rounded-xl border border-green-200">
                      <div className="flex items-center gap-2 text-green-700 mb-2">
                        <HiCheckCircle className="w-5 h-5" />
                        <span className="text-sm font-medium">Closed Deals</span>
                      </div>
                      <div className="text-3xl font-bold text-green-800">
                        {formatNumber(data.sales.closedDeals?.count || 0)}
                      </div>
                    </div>
                    <div className="p-5 bg-gradient-to-br from-blue-50 to-indigo-100 rounded-xl border border-blue-200">
                      <div className="flex items-center gap-2 text-blue-700 mb-2">
                        <HiCurrencyRupee className="w-5 h-5" />
                        <span className="text-sm font-medium">Total Value</span>
                      </div>
                      <div className="text-3xl font-bold text-blue-800">
                        {formatCurrency(data.sales.closedDeals?.totalValue)}
                      </div>
                    </div>
                    <div className="p-5 bg-gradient-to-br from-purple-50 to-violet-100 rounded-xl border border-purple-200">
                      <div className="flex items-center gap-2 text-purple-700 mb-2">
                        <HiTrendingUp className="w-5 h-5" />
                        <span className="text-sm font-medium">Average Deal</span>
                      </div>
                      <div className="text-3xl font-bold text-purple-800">
                        {formatCurrency(data.sales.closedDeals?.avgValue)}
                      </div>
                    </div>
                    <div className="p-5 bg-gradient-to-br from-amber-50 to-orange-100 rounded-xl border border-amber-200">
                      <div className="flex items-center gap-2 text-amber-700 mb-2">
                        <HiCurrencyRupee className="w-5 h-5" />
                        <span className="text-sm font-medium">Commission</span>
                      </div>
                      <div className="text-3xl font-bold text-amber-800">
                        {formatCurrency(data.sales.closedDeals?.totalCommission)}
                      </div>
                    </div>
                  </div>

                  {/* Deal Stages */}
                  <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4 flex items-center gap-2">
                    <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                    By Stage
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {data.sales.byStage?.map((stage, index) => (
                      <div
                        key={stage._id}
                        className={`p-4 rounded-xl text-center transition-all hover:scale-105 ${
                          getStageColor(index)
                        }`}
                      >
                        <div className="text-2xl font-bold text-slate-800">{formatNumber(stage.count)}</div>
                        <div className="text-xs text-slate-600 capitalize mt-1 font-medium">{stage._id?.replace(/_/g, ' ')}</div>
                        <div className="text-xs text-slate-500 mt-1">{formatCurrency(stage.value)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Leads Tab */}
            {(activeTab === 'overview' || activeTab === 'leads') && data.leads && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
                  <h2 className="text-lg font-semibold text-slate-900">Lead Conversion</h2>
                  <p className="text-sm text-slate-500">Track your lead funnel performance</p>
                </div>
                <div className="p-6">
                  {/* Conversion Metrics */}
                  <div className="flex flex-wrap items-center gap-6 mb-8">
                    <div className="flex-1 min-w-[200px] p-6 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl text-white">
                      <div className="text-sm opacity-80 mb-1">Conversion Rate</div>
                      <div className="text-4xl font-bold">
                        {(data.leads.conversionRate || 0).toFixed(1)}%
                      </div>
                    </div>
                    <div className="flex-1 min-w-[200px] p-6 bg-gradient-to-br from-slate-100 to-slate-200 rounded-2xl">
                      <div className="text-sm text-slate-600 mb-1">Avg Days to Convert</div>
                      <div className="text-4xl font-bold text-slate-800">
                        {data.leads.avgConversionDays || 0}
                      </div>
                    </div>
                  </div>

                  {/* Conversion Funnel */}
                  <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4 flex items-center gap-2">
                    <span className="w-2 h-2 bg-indigo-500 rounded-full"></span>
                    Conversion Funnel
                  </h3>
                  <div className="flex items-center justify-between py-8 px-4 bg-gradient-to-r from-slate-50 to-white rounded-2xl">
                    <FunnelStep
                      label="Total Leads"
                      value={formatNumber(data.leads.funnel?.total?.[0]?.count || 0)}
                      color="bg-slate-500"
                    />
                    <FunnelArrow />
                    <FunnelStep
                      label="Contacted"
                      value={formatNumber(data.leads.funnel?.contacted?.[0]?.count || 0)}
                      color="bg-blue-500"
                    />
                    <FunnelArrow />
                    <FunnelStep
                      label="Qualified"
                      value={formatNumber(data.leads.funnel?.qualified?.[0]?.count || 0)}
                      color="bg-purple-500"
                    />
                    <FunnelArrow />
                    <FunnelStep
                      label="Won"
                      value={formatNumber(data.leads.funnel?.won?.[0]?.count || 0)}
                      color="bg-green-500"
                      highlight
                    />
                  </div>

                  {/* By Source */}
                  {data.leads.bySource?.length > 0 && (
                    <div className="mt-8">
                      <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4 flex items-center gap-2">
                        <span className="w-2 h-2 bg-teal-500 rounded-full"></span>
                        By Source
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        {data.leads.bySource.slice(0, 10).map(source => (
                          <div key={source._id || 'unknown'} className="p-4 bg-slate-50 rounded-xl text-center hover:bg-slate-100 transition-colors">
                            <div className="text-xl font-bold text-slate-800">{formatNumber(source.count)}</div>
                            <div className="text-xs text-slate-500 mt-1 capitalize">{source._id || 'Unknown'}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Revenue Tab */}
            {(activeTab === 'overview' || activeTab === 'revenue') && data.revenue && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
                  <h2 className="text-lg font-semibold text-slate-900">Revenue & Commission</h2>
                  <p className="text-sm text-slate-500">Financial performance overview</p>
                </div>
                <div className="p-6">
                  {/* Revenue Summary */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <div className="p-5 bg-gradient-to-br from-green-50 to-emerald-100 rounded-xl border border-green-200">
                      <div className="text-sm text-green-700 font-medium mb-2">Total Deal Value</div>
                      <div className="text-2xl font-bold text-green-800">
                        {formatCurrency(data.revenue.summary?.totalDealValue)}
                      </div>
                    </div>
                    <div className="p-5 bg-gradient-to-br from-blue-50 to-indigo-100 rounded-xl border border-blue-200">
                      <div className="text-sm text-blue-700 font-medium mb-2">Total Commission</div>
                      <div className="text-2xl font-bold text-blue-800">
                        {formatCurrency(data.revenue.summary?.totalCommission)}
                      </div>
                    </div>
                    <div className="p-5 bg-gradient-to-br from-amber-50 to-orange-100 rounded-xl border border-amber-200">
                      <div className="text-sm text-amber-700 font-medium mb-2">Pending</div>
                      <div className="text-2xl font-bold text-amber-800">
                        {formatCurrency(data.revenue.summary?.pendingCommission)}
                      </div>
                    </div>
                    <div className="p-5 bg-gradient-to-br from-emerald-50 to-teal-100 rounded-xl border border-emerald-200">
                      <div className="text-sm text-emerald-700 font-medium mb-2">Collected</div>
                      <div className="text-2xl font-bold text-emerald-800">
                        {formatCurrency(data.revenue.summary?.paidCommission)}
                      </div>
                    </div>
                  </div>

                  {/* By Agent */}
                  {data.revenue.byAgent?.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4 flex items-center gap-2">
                        <span className="w-2 h-2 bg-indigo-500 rounded-full"></span>
                        Commission by Agent
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="bg-slate-50">
                              <th className="text-left p-4 text-sm font-semibold text-slate-700 rounded-tl-xl">Agent</th>
                              <th className="text-right p-4 text-sm font-semibold text-slate-700">Deals</th>
                              <th className="text-right p-4 text-sm font-semibold text-slate-700">Value</th>
                              <th className="text-right p-4 text-sm font-semibold text-slate-700 rounded-tr-xl">Commission</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {data.revenue.byAgent.map(agent => (
                              <tr key={agent._id} className="hover:bg-slate-50 transition-colors">
                                <td className="p-4">
                                  <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center text-white font-semibold text-sm">
                                      {agent.agentName?.charAt(0)?.toUpperCase() || '?'}
                                    </div>
                                    <span className="font-medium text-slate-800">{agent.agentName || 'Unknown'}</span>
                                  </div>
                                </td>
                                <td className="p-4 text-right text-slate-700">{formatNumber(agent.totalDeals)}</td>
                                <td className="p-4 text-right text-slate-700">{formatCurrency(agent.totalValue)}</td>
                                <td className="p-4 text-right">
                                  <span className="font-semibold text-green-600">
                                    {formatCurrency(agent.totalCommission)}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Agents Tab */}
            {activeTab === 'agents' && data.agents && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Agent Performance</h2>
                    <p className="text-sm text-slate-500">Individual agent metrics and conversion rates</p>
                  </div>
                  <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors">
                    <HiDownload className="w-4 h-4" />
                    Export
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="text-left p-4 text-sm font-semibold text-slate-700">Agent</th>
                        <th className="text-right p-4 text-sm font-semibold text-slate-700">Clients</th>
                        <th className="text-right p-4 text-sm font-semibold text-slate-700">Won</th>
                        <th className="text-right p-4 text-sm font-semibold text-slate-700">Lost</th>
                        <th className="text-right p-4 text-sm font-semibold text-slate-700">Conversion</th>
                        <th className="text-right p-4 text-sm font-semibold text-slate-700">Activities</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.agents.agents?.map(agent => (
                        <tr key={agent._id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center text-white font-semibold">
                                {agent.agentName?.charAt(0)?.toUpperCase() || '?'}
                              </div>
                              <div>
                                <div className="font-medium text-slate-800">{agent.agentName || 'Unknown'}</div>
                                <div className="text-xs text-slate-500">{agent.agentEmail}</div>
                              </div>
                            </div>
                          </td>
                          <td className="p-4 text-right">
                            <span className="text-slate-700 font-medium">{formatNumber(agent.totalClients)}</span>
                          </td>
                          <td className="p-4 text-right">
                            <span className="text-green-600 font-semibold">{formatNumber(agent.wonClients)}</span>
                          </td>
                          <td className="p-4 text-right">
                            <span className="text-red-500">{formatNumber(agent.lostClients)}</span>
                          </td>
                          <td className="p-4 text-right">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-semibold ${
                              agent.conversionRate > 30
                                ? 'bg-green-100 text-green-700'
                                : agent.conversionRate > 15
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-slate-100 text-slate-600'
                            }`}>
                              {agent.conversionRate > 20 && <HiTrendingUp className="w-4 h-4" />}
                              {(agent.conversionRate || 0).toFixed(1)}%
                            </span>
                          </td>
                          <td className="p-4 text-right">
                            <span className="text-slate-700">{formatNumber(agent.totalCommunications)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Helper Components
function MetricCard({ title, value, subtitle, icon: Icon, gradient, bgGradient, trend, alert }) {
  return (
    <div className={`relative overflow-hidden bg-gradient-to-br ${bgGradient} rounded-2xl p-5 border border-white/50 shadow-sm hover:shadow-md transition-all`}>
      <div className="flex items-start justify-between">
        <div className="relative z-10">
          <div className="text-sm text-slate-600 font-medium">{title}</div>
          <div className="text-3xl font-bold text-slate-900 mt-1">{value}</div>
          {subtitle && (
            <div className="flex items-center gap-1 mt-2">
              {trend === 'up' && <HiTrendingUp className="w-4 h-4 text-green-600" />}
              {trend === 'down' && <HiTrendingDown className="w-4 h-4 text-red-500" />}
              <span className={`text-sm ${alert ? 'text-amber-600 font-medium' : 'text-slate-500'}`}>
                {subtitle}
              </span>
            </div>
          )}
        </div>
        <div className={`p-3 bg-gradient-to-br ${gradient} rounded-xl shadow-lg`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  );
}

function FunnelStep({ label, value, color, highlight }) {
  return (
    <div className="text-center flex-1">
      <div className={`w-12 h-12 mx-auto ${color} rounded-xl flex items-center justify-center mb-2 ${highlight ? 'ring-4 ring-green-200' : ''}`}>
        <span className="text-white font-bold">{value}</span>
      </div>
      <div className={`text-sm font-medium ${highlight ? 'text-green-600' : 'text-slate-600'}`}>{label}</div>
    </div>
  );
}

function FunnelArrow() {
  return (
    <div className="flex-shrink-0 px-2">
      <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </div>
  );
}

function getStatusColor(status, index) {
  const colors = [
    'bg-slate-100 border border-slate-200',
    'bg-blue-50 border border-blue-200',
    'bg-purple-50 border border-purple-200',
    'bg-amber-50 border border-amber-200',
    'bg-teal-50 border border-teal-200',
    'bg-green-50 border border-green-200',
    'bg-red-50 border border-red-200',
  ];
  return colors[index % colors.length];
}

function getStageColor(index) {
  const colors = [
    'bg-slate-100 border border-slate-200',
    'bg-blue-50 border border-blue-200',
    'bg-indigo-50 border border-indigo-200',
    'bg-purple-50 border border-purple-200',
    'bg-emerald-50 border border-emerald-200',
    'bg-green-50 border border-green-200',
  ];
  return colors[index % colors.length];
}

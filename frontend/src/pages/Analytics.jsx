import { useEffect, useRef, useState } from 'react';
import { fetchWithRefresh, parseJsonSafely } from '../utils/http';
import { toCsv, downloadTextFile } from '../utils/spreadsheet';
import PrintButton from '../components/PrintButton';
import { PageHeader, KpiCard, Button } from '../design-system';
import {
  HiChartBar,
  HiUsers,
  HiCurrencyRupee,
  HiHome,
  HiTrendingUp,
  HiClock,
  HiRefresh,
  HiCheckCircle,
  HiExclamationCircle,
  HiFilter,
  HiDownload,
  HiUserGroup,
  HiSwitchHorizontal,
} from 'react-icons/hi';
import { formatCompactCurrency, formatCurrency as formatCurrencyLocale, formatDate, formatNumber as formatNumberLocale } from '../utils/currency';
import { useTranslation } from 'react-i18next';
import { localDateDaysAgo, localDateString } from '../utils/localDate';
import { Link, useNavigate } from 'react-router-dom';
import { useTenant } from '../contexts/TenantProvider';

export default function Analytics() {
  const { t } = useTranslation();
  const [dateRange, setDateRange] = useState({
    startDate: localDateDaysAgo(30),
    endDate: localDateString(),
  });
  const [activeTab, setActiveTab] = useState('overview');
  const navigate = useNavigate();
  // Stage names and order from the workspace pipeline, so Analytics says
  // "Won" and "Site Visit" like the board does.
  const { tenant } = useTenant();
  const stageOrder = (tenant?.dealStages || []).map((st) => st.id);
  const stageLabel = (id) =>
    tenant?.dealStages?.find((st) => st.id === id)?.label || String(id || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  const rangeInvalid = Boolean(dateRange.startDate && dateRange.endDate && dateRange.startDate > dateRange.endDate);
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);
  const isManualRefreshRef = useRef(false);

  useEffect(() => {
    const isRefresh = isManualRefreshRef.current;
    isManualRefreshRef.current = false;

    let mounted = true;
    // A range that runs backwards used to load quietly with half-empty
    // sections; it is refused here (and by the API with a 400).
    if (!dateRange.startDate || !dateRange.endDate || dateRange.startDate > dateRange.endDate) {
      setLoading(false);
      setRefreshing(false);
      return () => { mounted = false; };
    }
    const params = `?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`;

    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    (async () => {
      try {
        if (activeTab === 'overview') {
          const dashboardRes = await fetchWithRefresh(`/api/analytics/dashboard${params}`);
          if (!mounted) return;
          const dashboardData = await parseJsonSafely(dashboardRes);
          if (dashboardData?.success) setData(prev => ({ ...prev, dashboard: dashboardData.data }));
        }

        if (activeTab === 'overview' || activeTab === 'properties') {
          const propertyRes = await fetchWithRefresh(`/api/analytics/properties${params}`);
          if (!mounted) return;
          const propertyData = await parseJsonSafely(propertyRes);
          if (propertyData?.success) setData(prev => ({ ...prev, properties: propertyData.data }));
        }

        if (activeTab === 'overview' || activeTab === 'sales') {
          const salesRes = await fetchWithRefresh(`/api/analytics/sales${params}`);
          if (!mounted) return;
          const salesData = await parseJsonSafely(salesRes);
          if (salesData?.success) setData(prev => ({ ...prev, sales: salesData.data }));
        }

        if (activeTab === 'overview' || activeTab === 'leads') {
          const leadsRes = await fetchWithRefresh(`/api/analytics/leads/conversion${params}`);
          if (!mounted) return;
          const leadsData = await parseJsonSafely(leadsRes);
          if (leadsData?.success) setData(prev => ({ ...prev, leads: leadsData.data }));
        }

        if (activeTab === 'overview' || activeTab === 'revenue') {
          const revenueRes = await fetchWithRefresh(`/api/analytics/revenue${params}`);
          if (!mounted) return;
          const revenueData = await parseJsonSafely(revenueRes);
          if (revenueData?.success) setData(prev => ({ ...prev, revenue: revenueData.data }));
        }

        if (activeTab === 'agents') {
          const agentsRes = await fetchWithRefresh(`/api/analytics/agents${params}`);
          if (!mounted) return;
          const agentsData = await parseJsonSafely(agentsRes);
          if (agentsData?.success) setData(prev => ({ ...prev, agents: agentsData.data }));
        }
      } catch (err) {
        if (mounted) {
          console.error('Failed to load analytics:', err);
          setError('Failed to load analytics data');
        }
      } finally {
        if (mounted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    })();

    return () => { mounted = false; };
  }, [dateRange, activeTab, refreshCount]);  

  function loadData(isRefresh = false) {
    if (isRefresh) isManualRefreshRef.current = true;
    setRefreshCount(c => c + 1);
  }

  const formatCurrency = (amount) => {
    if (!amount && amount !== 0) return formatCompactCurrency(0);
    if (amount >= 10000000) {
      return formatCompactCurrency(amount);
    } else if (amount >= 100000) {
      return formatCompactCurrency(amount);
    }
    return formatCurrencyLocale(amount);
  };

  const formatNumber = formatNumberLocale;

  /**
   * Export the agent leaderboard for the range on screen.
   *
   * The button existed with no onClick since the page shipped. It exports what
   * the table shows rather than re-querying, so the file always matches the
   * figures the user is looking at, and reuses toCsv for quoting and the
   * formula-injection guard.
   */
  const exportAgentsToCsv = () => {
    const agents = data.agents?.agents || [];
    if (!agents.length) return;

    const grid = [
      [
        'Agent', 'Email', 'Total clients', 'Won', 'Lost',
        'Conversion rate %', 'Avg score', 'Communications', 'Follow-ups',
      ],
      ...agents.map((a) => [
        a.agentName || 'Unknown',
        a.agentEmail || '',
        a.totalClients || 0,
        a.wonClients || 0,
        a.lostClients || 0,
        (a.conversionRate || 0).toFixed(1),
        (a.avgScore || 0).toFixed(1),
        a.totalCommunications || 0,
        a.totalFollowUps || 0,
      ]),
    ];

    downloadTextFile(
      `agent-performance-${dateRange.startDate}-to-${dateRange.endDate}.csv`,
      toCsv(grid),
    );
  };

  const tabs = [
    { id: 'overview', label: t('analytics.tabs.overview'), icon: HiChartBar },
    { id: 'properties', label: t('analytics.tabs.properties'), icon: HiHome },
    { id: 'sales', label: t('analytics.tabs.sales'), icon: HiSwitchHorizontal },
    { id: 'leads', label: t('analytics.tabs.leads'), icon: HiUsers },
    { id: 'revenue', label: t('analytics.tabs.revenue'), icon: HiCurrencyRupee },
    { id: 'agents', label: t('analytics.tabs.agents'), icon: HiUserGroup },
  ];

  const quickDateRanges = [
    { label: '7 Days', days: 7 },
    { label: '30 Days', days: 30 },
    { label: '90 Days', days: 90 },
    { label: '1 Year', days: 365 },
  ];

  const setQuickRange = (days) => {
    setDateRange({
      startDate: localDateDaysAgo(days),
      endDate: localDateString(),
    });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('analytics.analytics')}
        description={t('analytics.trackYourRealEstatePerformanceMetrics')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Quick Date Ranges */}
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
              {quickDateRanges.map(range => {
                const currentDays = Math.round((new Date(dateRange.endDate) - new Date(dateRange.startDate)) / (1000 * 60 * 60 * 24));
                const isActive = currentDays === range.days;
                return (
                  <button
                    key={range.days}
                    onClick={() => setQuickRange(range.days)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                      isActive ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {range.label}
                  </button>
                );
              })}
            </div>
            {/* Date Pickers */}
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-3 py-1.5">
              <HiFilter className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <input
                type="date"
                value={dateRange.startDate}
                onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                className="text-sm border-none focus:outline-none focus:ring-0 bg-transparent text-slate-700"
              />
              <span className="text-slate-300 text-sm">–</span>
              <input
                type="date"
                value={dateRange.endDate}
                onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                className="text-sm border-none focus:outline-none focus:ring-0 bg-transparent text-slate-700"
              />
            </div>
            <Button
              variant="primary"
              size="sm"
              icon={HiRefresh}
              onClick={() => loadData(true)}
              disabled={refreshing}
              className={refreshing ? '[&>svg]:animate-spin' : ''}
            >{t('analytics.refresh')}</Button>
          </div>
        }
      />

      {/* Tabs */}
      {/* The tab row scrolls on a phone; the fade on the right says so. */}
      <div className="relative">
      <div className="bg-white border border-slate-200 rounded-xl flex overflow-x-auto shadow-sm [mask-image:linear-gradient(to_right,black_85%,transparent)] sm:[mask-image:none]">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-all border-b-2 ${
              activeTab === tab.id
                ? 'text-slate-900 border-slate-900 bg-slate-50'
                : 'text-slate-500 border-transparent hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>
      </div>

      {rangeInvalid && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{t('analytics.rangeBackwards')}</p>
      )}

      {/* Content */}
      <div className={rangeInvalid ? 'hidden' : undefined}>
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <HiRefresh className="w-10 h-10 text-slate-500 animate-spin" />
            <p className="text-slate-500 mt-4">{t('analytics.loadingAnalyticsData')}</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mb-4">
              <HiExclamationCircle className="w-8 h-8 text-rose-600" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">{t('analytics.failedToLoadData')}</h3>
            <p className="text-slate-500 mb-4">{error}</p>
            <Button onClick={() => loadData()}>{t('analytics.tryAgain')}</Button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Overview Tab */}
            {activeTab === 'overview' && data.dashboard && (
              <>
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Listings and clients are counts right now; new clients and
                      deals won follow the date range above. The "↑ 12% new"
                      trend was a count of new clients printed as a percentage. */}
                  <KpiCard
                    title={t('analytics.totalListings')}
                    value={formatNumber(data.dashboard.listings?.total || 0)}
                    sub={t('analytics.activeNow', { count: data.dashboard.listings?.active || 0 })}
                    icon={HiHome}
                    color="blue"
                    onClick={() => navigate('/properties')}
                  />
                  <KpiCard
                    title={t('analytics.totalClients')}
                    value={formatNumber(data.dashboard.clients?.total || 0)}
                    sub={t('analytics.newInPeriod', { count: data.dashboard.clients?.new || 0 })}
                    icon={HiUsers}
                    color="emerald"
                    onClick={() => navigate('/clients')}
                  />
                  <KpiCard
                    title={t('analytics.dealsWonInPeriod')}
                    value={formatNumber(data.dashboard.deals?.closedWon || 0)}
                    sub={data.dashboard.deals?.closedWon ? formatCurrency(data.dashboard.deals?.totalValue) : t('analytics.noneInPeriod')}
                    icon={HiSwitchHorizontal}
                    color="purple"
                    onClick={() => navigate('/pipeline')}
                  />
                  <KpiCard
                    title={t('analytics.followUpsToDo')}
                    value={formatNumber((data.dashboard.followUps?.overdue || 0) + (data.dashboard.followUps?.upcoming || 0))}
                    sub={
                      data.dashboard.followUps?.overdue
                        ? t('analytics.followUpsOverdueAndDue', { overdue: data.dashboard.followUps.overdue, upcoming: data.dashboard.followUps.upcoming || 0 })
                        : t('analytics.followUpsDueWeek', { count: data.dashboard.followUps?.upcoming || 0 })
                    }
                    icon={HiClock}
                    color="amber"
                    onClick={() => navigate('/calendar')}
                  />
                </div>

                {/* Client Pipeline */}
                {data.dashboard.clients?.byStatus?.length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
                      <h2 className="text-lg font-semibold text-slate-900">{t('analytics.clientPipeline')}</h2>
                      <p className="text-sm text-slate-500">{t('analytics.allClientsNow')}</p>
                    </div>
                    <div className="p-6">
                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                        {sortByStatus(data.dashboard.clients.byStatus).map((item) => (
                          <div
                            key={item._id}
                            className={`relative p-4 rounded-xl text-center transition-all hover:scale-105 ${getStatusColor(item._id)}`}
                          >
                            <div className="text-2xl font-bold text-slate-800">{formatNumber(item.count)}</div>
                            <div className="text-xs text-slate-600 mt-1 font-medium">{CLIENT_STATUS_LABEL[item._id] || item._id}</div>
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
                      <h2 className="text-lg font-semibold text-slate-900">{t('analytics.recentActivity')}</h2>
                      <p className="text-sm text-slate-500">{t('analytics.latestClientUpdates')}</p>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {data.dashboard.recentActivity.map(item => (
                        <div key={item._id} className="flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center text-white font-semibold">
                              {item.name?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                            <div>
                              <div className="font-medium text-slate-900">{item.name}</div>
                              <div className="text-sm text-slate-500 capitalize">{item.status}</div>
                            </div>
                          </div>
                          <div className="text-sm text-slate-400">
                            {formatDate(item.updatedAt, {
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
                  <h2 className="text-lg font-semibold text-slate-900">{t('analytics.propertyMetrics')}</h2>
                  <p className="text-sm text-slate-500">{t('analytics.breakdownByCategoryAndType')}</p>
                </div>
                <div className="p-6">
                  <div className="grid md:grid-cols-2 gap-8">
                    {/* By Category */}
                    <div>
                      <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4 flex items-center gap-2">
                        <span className="w-2 h-2 bg-indigo-500 rounded-full"></span>{t('analytics.byCategory')}</h3>
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
                                  className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-500"
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                        {!data.properties.byCategory?.length && (
                          <p className='text-sm text-slate-500 py-6 text-center'>{t('analytics.noPropertiesInRange')}</p>
                        )}
                      </div>
                    </div>

                    {/* By Type */}
                    <div>
                      <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4 flex items-center gap-2">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>{t('analytics.byType')}</h3>
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
                        {!data.properties.byType?.length && (
                          <p className='text-sm text-slate-500 py-6 text-center'>{t('analytics.noPropertiesInRange')}</p>
                        )}
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
                  <h2 className="text-lg font-semibold text-slate-900">{t('analytics.salesAnalytics')}</h2>
                  <p className="text-sm text-slate-500">{t('analytics.dealPerformanceAndConversion')}</p>
                </div>
                <div className="p-6">
                  {/* Sales Summary */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <KpiCard
                      title={t('analytics.closedDeals')}
                      value={formatNumber(data.sales.closedDeals?.count || 0)}
                      icon={HiCheckCircle}
                      color="emerald"
                    />
                    <KpiCard
                      title={t('analytics.totalValue')}
                      value={formatCurrency(data.sales.closedDeals?.totalValue)}
                      icon={HiCurrencyRupee}
                      color="indigo"
                    />
                    <KpiCard
                      title={t('analytics.averageDeal')}
                      value={formatCurrency(data.sales.closedDeals?.avgValue)}
                      icon={HiTrendingUp}
                      color="purple"
                    />
                    <KpiCard
                      title={t('analytics.commission')}
                      value={formatCurrency(data.sales.closedDeals?.totalCommission)}
                      icon={HiCurrencyRupee}
                      color="amber"
                    />
                  </div>

                  {/* Deal Stages */}
                  <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4 flex items-center gap-2">
                    <span className="w-2 h-2 bg-purple-500 rounded-full"></span>{t('analytics.byStage')}</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {sortByStages(data.sales.byStage || [], stageOrder).map((stage, index) => (
                      <div
                        key={stage._id}
                        className={`p-4 rounded-xl text-center transition-all hover:scale-105 ${
                          getStageColor(index)
                        }`}
                      >
                        <div className="text-2xl font-bold text-slate-800">{formatNumber(stage.count)}</div>
                        <div className="text-xs text-slate-600 mt-1 font-medium">{stageLabel(stage._id)}</div>
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
                  <h2 className="text-lg font-semibold text-slate-900">{t('analytics.leadConversion')}</h2>
                  <p className="text-sm text-slate-500">{t('analytics.trackYourLeadFunnelPerformance')}</p>
                </div>
                <div className="p-6">
                  {/* Conversion Metrics */}
                  <div className="flex flex-wrap items-center gap-6 mb-8">
                    <div className="flex-1 min-w-[200px] p-6 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl text-white">
                      <div className="text-sm opacity-80 mb-1">{t('analytics.conversionRate')}</div>
                      <div className="text-4xl font-bold">
                        {(data.leads.conversionRate || 0).toFixed(1)}%
                      </div>
                    </div>
                    <div className="flex-1 min-w-[200px] p-6 bg-gradient-to-br from-slate-100 to-slate-200 rounded-2xl">
                      <div className="text-sm text-slate-600 mb-1">{t('analytics.avgDaysToConvert')}</div>
                      <div className="text-4xl font-bold text-slate-800">
                        {data.leads.avgConversionDays || 0}
                      </div>
                    </div>
                  </div>

                  {/* Conversion Funnel */}
                  <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4 flex items-center gap-2">
                    <span className="w-2 h-2 bg-indigo-500 rounded-full"></span>{t('analytics.conversionFunnel')}</h3>
                  <div className="flex items-center justify-between gap-1 py-8 px-2 sm:px-4 bg-gradient-to-r from-slate-50 to-white rounded-2xl">
                    <FunnelStep
                      label={t('analytics.totalLeads')}
                      value={formatNumber(data.leads.funnel?.total?.[0]?.count || 0)}
                      color="bg-slate-500"
                    />
                    <FunnelArrow />
                    <FunnelStep
                      label={t('analytics.contacted')}
                      value={formatNumber(data.leads.funnel?.contacted?.[0]?.count || 0)}
                      color="bg-indigo-500"
                    />
                    <FunnelArrow />
                    <FunnelStep
                      label={t('analytics.qualified')}
                      value={formatNumber(data.leads.funnel?.qualified?.[0]?.count || 0)}
                      color="bg-purple-500"
                    />
                    <FunnelArrow />
                    <FunnelStep
                      label={t('analytics.won')}
                      value={formatNumber(data.leads.funnel?.won?.[0]?.count || 0)}
                      color="bg-emerald-500"
                      highlight
                    />
                  </div>

                  {/* By Source */}
                  {data.leads.bySource?.length > 0 && (
                    <div className="mt-8">
                      <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4 flex items-center gap-2">
                        <span className="w-2 h-2 bg-teal-500 rounded-full"></span>{t('analytics.bySource')}</h3>
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
                  <h2 className="text-lg font-semibold text-slate-900">{t('analytics.revenueCommission')}</h2>
                  {/* Two sources of commission exist and disagreed without
                      saying why: this one is what won deals record; money
                      actually received is the Transactions ledger. */}
                  <p className="text-sm text-slate-500 mt-0.5">
                    {t('analytics.revenueSourceNote')}{' '}
                    <Link to="/transactions" className="font-medium text-brand-700 hover:underline">{t('analytics.openTransactions')}</Link>
                  </p>
                  <p className="text-sm text-slate-500">{t('analytics.financialPerformanceOverview')}</p>
                </div>
                <div className="p-6">
                  {/* Revenue Summary */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <KpiCard
                      title={t('analytics.totalDealValue')}
                      value={formatCurrency(data.revenue.summary?.totalDealValue)}
                      icon={HiCurrencyRupee}
                      color="indigo"
                    />
                    <KpiCard
                      title={t('analytics.totalCommission')}
                      value={formatCurrency(data.revenue.summary?.totalCommission)}
                      icon={HiCurrencyRupee}
                      color="purple"
                    />
                    <KpiCard
                      title={t('analytics.pending')}
                      value={formatCurrency(data.revenue.summary?.pendingCommission)}
                      icon={HiClock}
                      color="amber"
                    />
                    <KpiCard
                      title={t('analytics.collected')}
                      value={formatCurrency(data.revenue.summary?.paidCommission)}
                      icon={HiCheckCircle}
                      color="emerald"
                    />
                  </div>

                  {/* By Agent */}
                  {data.revenue.byAgent?.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4 flex items-center gap-2">
                        <span className="w-2 h-2 bg-indigo-500 rounded-full"></span>{t('analytics.commissionByAgent')}</h3>
                      <div className="overflow-x-auto -mx-1 px-1">
                        <table className="w-full min-w-[32rem]">
                          <thead>
                            <tr className="bg-slate-50">
                              <th className="text-left p-4 text-sm font-semibold text-slate-700 rounded-tl-xl">{t('analytics.agent')}</th>
                              <th className="text-right p-4 text-sm font-semibold text-slate-700">{t('analytics.deals')}</th>
                              <th className="text-right p-4 text-sm font-semibold text-slate-700">{t('analytics.value')}</th>
                              <th className="text-right p-4 text-sm font-semibold text-slate-700 rounded-tr-xl">{t('analytics.commission')}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {data.revenue.byAgent.map(agent => (
                              <tr key={agent._id} className="hover:bg-slate-50 transition-colors">
                                <td className="p-4">
                                  <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-lg flex items-center justify-center text-white font-semibold text-sm">
                                      {agent.agentName?.charAt(0)?.toUpperCase() || '?'}
                                    </div>
                                    <span className="font-medium text-slate-800">{agent.agentName || 'Unknown'}</span>
                                  </div>
                                </td>
                                <td className="p-4 text-right text-slate-700">{formatNumber(agent.totalDeals)}</td>
                                <td className="p-4 text-right text-slate-700">{formatCurrency(agent.totalValue)}</td>
                                <td className="p-4 text-right">
                                  <span className="font-semibold text-emerald-600">
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
                    <h2 className="text-lg font-semibold text-slate-900">{t('analytics.agentPerformance')}</h2>
                    <p className="text-sm text-slate-500">{t('analytics.individualAgentMetricsAndConversionRates')}</p>
                  </div>
                  <div className='flex items-center gap-2'>
                  <PrintButton />
                  <button
                    type="button"
                    onClick={exportAgentsToCsv}
                    disabled={!data.agents?.agents?.length}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <HiDownload className="w-4 h-4" />{t('analytics.export')}</button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="text-left p-4 text-sm font-semibold text-slate-700">{t('analytics.agent')}</th>
                        <th className="text-right p-4 text-sm font-semibold text-slate-700">{t('analytics.clients')}</th>
                        <th className="text-right p-4 text-sm font-semibold text-slate-700">{t('analytics.won')}</th>
                        <th className="text-right p-4 text-sm font-semibold text-slate-700">{t('analytics.lost')}</th>
                        <th className="text-right p-4 text-sm font-semibold text-slate-700">{t('analytics.conversion')}</th>
                        <th className="text-right p-4 text-sm font-semibold text-slate-700">{t('analytics.activities')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {!data.agents.agents?.length && (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-slate-400">{t('analytics.noAgentActivityInThisDate')}</td>
                        </tr>
                      )}
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
                            <span className="text-emerald-600 font-semibold">{formatNumber(agent.wonClients)}</span>
                          </td>
                          <td className="p-4 text-right">
                            <span className="text-rose-500">{formatNumber(agent.lostClients)}</span>
                          </td>
                          <td className="p-4 text-right">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-semibold ${
                              agent.conversionRate > 30
                                ? 'bg-emerald-100 text-emerald-700'
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
function FunnelStep({ label, value, color, highlight }) {
  return (
    <div className="text-center flex-1 min-w-0">
      <div className={`w-12 h-12 mx-auto ${color} rounded-xl flex items-center justify-center mb-2 ${highlight ? 'ring-4 ring-emerald-200' : ''}`}>
        <span className="text-white font-bold">{value}</span>
      </div>
      <div className={`text-xs sm:text-sm font-medium truncate ${highlight ? 'text-emerald-600' : 'text-slate-600'}`}>{label}</div>
    </div>
  );
}

function FunnelArrow() {
  return (
    <div className="flex-shrink-0 px-1 sm:px-2 hidden sm:block">
      <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </div>
  );
}

// Keyed by status, not position: position-based colours changed with the
// order the API returned, and the teal slot had no dark-mode variant, which
// left one tile white with an invisible number.
const CLIENT_STATUS_ORDER = ['lead', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];
const CLIENT_STATUS_LABEL = {
  lead: 'Lead', contacted: 'Contacted', qualified: 'Qualified', proposal: 'Proposal',
  negotiation: 'Negotiation', won: 'Won', lost: 'Lost',
};
const CLIENT_STATUS_COLOR = {
  lead: 'bg-slate-100 border border-slate-200',
  contacted: 'bg-indigo-50 border border-indigo-200',
  qualified: 'bg-purple-50 border border-purple-200',
  proposal: 'bg-cyan-50 border border-cyan-200',
  negotiation: 'bg-amber-50 border border-amber-200',
  won: 'bg-emerald-50 border border-emerald-200',
  lost: 'bg-rose-50 border border-rose-200',
};
const sortByStatus = (rows) =>
  [...rows].sort((a, b) => CLIENT_STATUS_ORDER.indexOf(a._id) - CLIENT_STATUS_ORDER.indexOf(b._id));

function getStatusColor(status) {
  return CLIENT_STATUS_COLOR[status] || 'bg-slate-100 border border-slate-200';
}

const sortByStages = (rows, order) =>
  [...rows].sort((a, b) => {
    const ia = order.indexOf(a._id);
    const ib = order.indexOf(b._id);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

function getStageColor(index) {
  const colors = [
    'bg-slate-100 border border-slate-200',
    'bg-indigo-50 border border-indigo-200',
    'bg-violet-50 border border-violet-200',
    'bg-purple-50 border border-purple-200',
    'bg-emerald-50 border border-emerald-200',
    'bg-teal-50 border border-teal-200',
  ];
  return colors[index % colors.length];
}

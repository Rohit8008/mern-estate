import { useEffect, useState } from 'react';
import { fetchWithRefresh, parseJsonSafely } from '../utils/http';
import { FaChartLine, FaUsers, FaHandshake, FaRupeeSign, FaUserTie, FaSpinner } from 'react-icons/fa';

export default function Analytics() {
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });
  const [activeTab, setActiveTab] = useState('overview');
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadData();
  }, [dateRange, activeTab]);

  async function loadData() {
    setLoading(true);
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
    }
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount || 0);
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: FaChartLine },
    { id: 'properties', label: 'Properties', icon: FaChartLine },
    { id: 'sales', label: 'Sales', icon: FaHandshake },
    { id: 'leads', label: 'Leads', icon: FaUsers },
    { id: 'revenue', label: 'Revenue', icon: FaRupeeSign },
    { id: 'agents', label: 'Agents', icon: FaUserTie },
  ];

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-800">Analytics Dashboard</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            <label htmlFor="startDate" className="text-slate-600">From:</label>
            <input
              id="startDate"
              type="date"
              value={dateRange.startDate}
              onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
              className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <label htmlFor="endDate" className="text-slate-600">To:</label>
            <input
              id="endDate"
              type="date"
              value={dateRange.endDate}
              onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
              className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <FaSpinner className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
      ) : error ? (
        <div className="text-center py-12 text-red-600">{error}</div>
      ) : (
        <div className="space-y-6">
          {/* Overview Tab */}
          {activeTab === 'overview' && data.dashboard && (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard
                  title="Total Listings"
                  value={data.dashboard.listings?.total || 0}
                  icon={FaChartLine}
                  color="blue"
                />
                <MetricCard
                  title="Total Clients"
                  value={data.dashboard.clients?.total || 0}
                  subtitle={`${data.dashboard.clients?.new || 0} new this month`}
                  icon={FaUsers}
                  color="green"
                />
                <MetricCard
                  title="Deals Won"
                  value={data.dashboard.deals?.closedWon || 0}
                  subtitle={formatCurrency(data.dashboard.deals?.totalValue)}
                  icon={FaHandshake}
                  color="purple"
                />
                <MetricCard
                  title="Follow-ups Due"
                  value={data.dashboard.upcomingFollowUps || 0}
                  subtitle="Next 7 days"
                  icon={FaUserTie}
                  color="orange"
                />
              </div>

              {/* Client Status */}
              {data.dashboard.clients?.byStatus?.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border p-6">
                  <h2 className="text-lg font-semibold text-slate-800 mb-4">Client Pipeline</h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                    {data.dashboard.clients.byStatus.map(item => (
                      <div key={item._id} className="text-center p-3 bg-slate-50 rounded-lg">
                        <div className="text-2xl font-bold text-slate-800">{item.count}</div>
                        <div className="text-xs text-slate-500 capitalize">{item._id}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Activity */}
              {data.dashboard.recentActivity?.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border p-6">
                  <h2 className="text-lg font-semibold text-slate-800 mb-4">Recent Activity</h2>
                  <div className="space-y-3">
                    {data.dashboard.recentActivity.map(item => (
                      <div key={item._id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <div>
                          <div className="font-medium text-slate-800">{item.name}</div>
                          <div className="text-sm text-slate-500 capitalize">{item.status}</div>
                        </div>
                        <div className="text-sm text-slate-400">
                          {new Date(item.updatedAt).toLocaleDateString()}
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
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">Property Metrics</h2>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-medium text-slate-600 mb-3">By Category</h3>
                  <div className="space-y-2">
                    {data.properties.byCategory?.slice(0, 5).map(cat => (
                      <div key={cat._id || 'uncategorized'} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                        <span className="text-slate-700">{cat.categoryName || 'Uncategorized'}</span>
                        <span className="font-semibold text-slate-800">{cat.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-slate-600 mb-3">By Type</h3>
                  <div className="space-y-2">
                    {data.properties.byType?.map(type => (
                      <div key={type._id} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                        <span className="text-slate-700 capitalize">{type._id}</span>
                        <div className="text-right">
                          <span className="font-semibold text-slate-800">{type.count}</span>
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
          )}

          {/* Sales Tab */}
          {(activeTab === 'overview' || activeTab === 'sales') && data.sales && (
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">Sales Analytics</h2>
              <div className="grid md:grid-cols-4 gap-4 mb-6">
                <div className="p-4 bg-green-50 rounded-lg">
                  <div className="text-sm text-green-600">Closed Deals</div>
                  <div className="text-2xl font-bold text-green-700">
                    {data.sales.closedDeals?.count || 0}
                  </div>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg">
                  <div className="text-sm text-blue-600">Total Value</div>
                  <div className="text-2xl font-bold text-blue-700">
                    {formatCurrency(data.sales.closedDeals?.totalValue)}
                  </div>
                </div>
                <div className="p-4 bg-purple-50 rounded-lg">
                  <div className="text-sm text-purple-600">Average Deal</div>
                  <div className="text-2xl font-bold text-purple-700">
                    {formatCurrency(data.sales.closedDeals?.avgValue)}
                  </div>
                </div>
                <div className="p-4 bg-amber-50 rounded-lg">
                  <div className="text-sm text-amber-600">Commission Earned</div>
                  <div className="text-2xl font-bold text-amber-700">
                    {formatCurrency(data.sales.closedDeals?.totalCommission)}
                  </div>
                </div>
              </div>
              {/* Deal Stages */}
              <h3 className="text-sm font-medium text-slate-600 mb-3">By Stage</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {data.sales.byStage?.map(stage => (
                  <div key={stage._id} className="p-3 bg-slate-50 rounded text-center">
                    <div className="font-semibold text-slate-800">{stage.count}</div>
                    <div className="text-xs text-slate-500 capitalize">{stage._id?.replace(/_/g, ' ')}</div>
                    <div className="text-xs text-slate-400">{formatCurrency(stage.value)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Leads Tab */}
          {(activeTab === 'overview' || activeTab === 'leads') && data.leads && (
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">Lead Conversion</h2>

              {/* Conversion Rate */}
              <div className="flex items-center gap-8 mb-6">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <div className="text-sm text-blue-600">Conversion Rate</div>
                  <div className="text-3xl font-bold text-blue-700">
                    {(data.leads.conversionRate || 0).toFixed(1)}%
                  </div>
                </div>
                <div className="p-4 bg-slate-50 rounded-lg">
                  <div className="text-sm text-slate-600">Avg Days to Convert</div>
                  <div className="text-3xl font-bold text-slate-700">
                    {data.leads.avgConversionDays || 0}
                  </div>
                </div>
              </div>

              {/* Funnel */}
              <h3 className="text-sm font-medium text-slate-600 mb-3">Conversion Funnel</h3>
              <div className="flex items-center justify-around py-4">
                <FunnelStep
                  label="Total"
                  value={data.leads.funnel?.total?.[0]?.count || 0}
                />
                <Arrow />
                <FunnelStep
                  label="Contacted"
                  value={data.leads.funnel?.contacted?.[0]?.count || 0}
                />
                <Arrow />
                <FunnelStep
                  label="Qualified"
                  value={data.leads.funnel?.qualified?.[0]?.count || 0}
                />
                <Arrow />
                <FunnelStep
                  label="Won"
                  value={data.leads.funnel?.won?.[0]?.count || 0}
                  highlight
                />
              </div>

              {/* By Source */}
              {data.leads.bySource?.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-medium text-slate-600 mb-3">By Source</h3>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    {data.leads.bySource.slice(0, 10).map(source => (
                      <div key={source._id || 'unknown'} className="p-2 bg-slate-50 rounded text-center">
                        <div className="font-semibold text-slate-800">{source.count}</div>
                        <div className="text-xs text-slate-500">{source._id || 'Unknown'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Revenue Tab */}
          {(activeTab === 'overview' || activeTab === 'revenue') && data.revenue && (
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">Revenue & Commission</h2>
              <div className="grid md:grid-cols-4 gap-4 mb-6">
                <div className="p-4 bg-green-50 rounded-lg">
                  <div className="text-sm text-green-600">Total Deal Value</div>
                  <div className="text-2xl font-bold text-green-700">
                    {formatCurrency(data.revenue.summary?.totalDealValue)}
                  </div>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg">
                  <div className="text-sm text-blue-600">Total Commission</div>
                  <div className="text-2xl font-bold text-blue-700">
                    {formatCurrency(data.revenue.summary?.totalCommission)}
                  </div>
                </div>
                <div className="p-4 bg-amber-50 rounded-lg">
                  <div className="text-sm text-amber-600">Pending</div>
                  <div className="text-2xl font-bold text-amber-700">
                    {formatCurrency(data.revenue.summary?.pendingCommission)}
                  </div>
                </div>
                <div className="p-4 bg-emerald-50 rounded-lg">
                  <div className="text-sm text-emerald-600">Collected</div>
                  <div className="text-2xl font-bold text-emerald-700">
                    {formatCurrency(data.revenue.summary?.paidCommission)}
                  </div>
                </div>
              </div>

              {/* By Agent */}
              {data.revenue.byAgent?.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-slate-600 mb-3">Commission by Agent</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="text-left p-3">Agent</th>
                          <th className="text-right p-3">Deals</th>
                          <th className="text-right p-3">Value</th>
                          <th className="text-right p-3">Commission</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.revenue.byAgent.map(agent => (
                          <tr key={agent._id} className="border-t">
                            <td className="p-3">{agent.agentName || 'Unknown'}</td>
                            <td className="p-3 text-right">{agent.totalDeals}</td>
                            <td className="p-3 text-right">{formatCurrency(agent.totalValue)}</td>
                            <td className="p-3 text-right font-semibold text-green-600">
                              {formatCurrency(agent.totalCommission)}
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

          {/* Agents Tab */}
          {activeTab === 'agents' && data.agents && (
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">Agent Performance</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left p-3">Agent</th>
                      <th className="text-right p-3">Clients</th>
                      <th className="text-right p-3">Won</th>
                      <th className="text-right p-3">Lost</th>
                      <th className="text-right p-3">Conversion</th>
                      <th className="text-right p-3">Activities</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.agents.agents?.map(agent => (
                      <tr key={agent._id} className="border-t hover:bg-slate-50">
                        <td className="p-3">
                          <div className="font-medium text-slate-800">{agent.agentName || 'Unknown'}</div>
                          <div className="text-xs text-slate-500">{agent.agentEmail}</div>
                        </td>
                        <td className="p-3 text-right">{agent.totalClients}</td>
                        <td className="p-3 text-right text-green-600 font-medium">{agent.wonClients}</td>
                        <td className="p-3 text-right text-red-600">{agent.lostClients}</td>
                        <td className="p-3 text-right">
                          <span className={`font-semibold ${agent.conversionRate > 20 ? 'text-green-600' : 'text-slate-600'}`}>
                            {(agent.conversionRate || 0).toFixed(1)}%
                          </span>
                        </td>
                        <td className="p-3 text-right">{agent.totalCommunications}</td>
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
  );
}

// Helper Components
function MetricCard({ title, value, subtitle, icon: Icon, color = 'blue' }) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    orange: 'bg-orange-50 text-orange-600',
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm text-slate-500">{title}</div>
          <div className="text-2xl font-bold text-slate-800 mt-1">{value}</div>
          {subtitle && <div className="text-xs text-slate-400 mt-1">{subtitle}</div>}
        </div>
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

function FunnelStep({ label, value, highlight }) {
  return (
    <div className="text-center">
      <div className={`text-2xl font-bold ${highlight ? 'text-green-600' : 'text-slate-800'}`}>
        {value}
      </div>
      <div className="text-sm text-slate-500">{label}</div>
    </div>
  );
}

function Arrow() {
  return <div className="text-slate-300 text-2xl">→</div>;
}

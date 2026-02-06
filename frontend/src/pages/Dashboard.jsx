import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { StatsCard, StatsSkeleton } from '@/components/ui/StatsCard';
import { formatPrice, formatDate, getStatusColor } from '@/lib/utils';

export default function Dashboard() {
  const { currentUser } = useSelector((state) => state.user);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDashboardAnalytics();
  }, []);

  const fetchDashboardAnalytics = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/dashboard/analytics');
      const data = await response.json();
      
      if (data.success) {
        setAnalytics(data.data);
      } else {
        setError(data.message || 'Failed to load analytics');
      }
    } catch (err) {
      setError('Failed to load dashboard data');
      console.error('Dashboard error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <div className="h-8 bg-gray-200 rounded w-64 mb-2 animate-pulse"></div>
            <div className="h-4 bg-gray-200 rounded w-96 animate-pulse"></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <StatsSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const isAdmin = currentUser?.role === 'admin';
  const isEmployee = currentUser?.role === 'employee';

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Welcome back, {currentUser?.firstName || currentUser?.username}!
        </h1>
        <p className="text-gray-600">
          Here's what's happening with your real estate business today.
        </p>
      </div>

      {/* Property Stats */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Property Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatsCard
            title="Total Properties"
            value={analytics?.properties?.total || 0}
            icon={({ className }) => (
              <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            )}
            iconColor="text-blue-600"
          />
          <StatsCard
            title="Available"
            value={analytics?.properties?.available || 0}
            icon={({ className }) => (
              <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            iconColor="text-green-600"
          />
          <StatsCard
            title="Sold"
            value={analytics?.properties?.sold || 0}
            icon={({ className }) => (
              <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            iconColor="text-indigo-600"
          />
          <StatsCard
            title="Under Negotiation"
            value={analytics?.properties?.underNegotiation || 0}
            icon={({ className }) => (
              <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            iconColor="text-yellow-600"
          />
        </div>
      </div>

      {/* Buyer Stats */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Buyer Requirements</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatsCard
            title="Total Buyers"
            value={analytics?.buyers?.total || 0}
            icon={({ className }) => (
              <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            )}
            iconColor="text-purple-600"
          />
          <StatsCard
            title="Active"
            value={analytics?.buyers?.active || 0}
            icon={({ className }) => (
              <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            )}
            iconColor="text-green-600"
          />
          <StatsCard
            title="Matched"
            value={analytics?.buyers?.matched || 0}
            icon={({ className }) => (
              <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            )}
            iconColor="text-pink-600"
          />
          <StatsCard
            title="Closed"
            value={analytics?.buyers?.closed || 0}
            icon={({ className }) => (
              <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            iconColor="text-gray-600"
          />
        </div>
      </div>

      {/* Employee Stats (Admin Only) */}
      {isAdmin && analytics?.employees && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Team Overview</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <StatsCard
              title="Total Employees"
              value={analytics.employees.total || 0}
              icon={({ className }) => (
                <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              )}
              iconColor="text-indigo-600"
            />
            <StatsCard
              title="Active Employees"
              value={analytics.employees.active || 0}
              icon={({ className }) => (
                <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              iconColor="text-green-600"
            />
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Listings */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Listings</h3>
            <div className="space-y-4">
              {analytics?.recent?.listings?.length > 0 ? (
                analytics.recent.listings.map((listing) => (
                  <div key={listing._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{listing.name}</p>
                      <p className="text-sm text-gray-500">
                        {listing.city && listing.locality ? `${listing.city}, ${listing.locality}` : listing.city || 'Location not specified'}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(listing.status)}`}>
                        {listing.status?.replace('_', ' ')}
                      </span>
                      <p className="text-xs text-gray-500 mt-1">{formatDate(listing.createdAt)}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-center py-4">No recent listings</p>
              )}
            </div>
          </div>

          {/* Recent Buyers */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Buyer Requirements</h3>
            <div className="space-y-4">
              {analytics?.recent?.buyers?.length > 0 ? (
                analytics.recent.buyers.map((buyer) => (
                  <div key={buyer._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{buyer.buyerName}</p>
                      <p className="text-sm text-gray-500">
                        {buyer.buyerPhone || 'No phone'}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(buyer.status)}`}>
                        {buyer.status}
                      </span>
                      <p className="text-xs text-gray-500 mt-1">{formatDate(buyer.createdAt)}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-center py-4">No recent buyer requirements</p>
              )}
            </div>
          </div>
        </div>

        {/* Properties by Category */}
        {analytics?.properties?.byCategory?.length > 0 && (
          <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Properties by Category</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {analytics.properties.byCategory.map((cat) => (
                <div key={cat._id} className="text-center p-4 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-bold text-gray-900">{cat.count}</p>
                  <p className="text-sm text-gray-600 capitalize">{cat._id || 'Unknown'}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Properties by City */}
        {analytics?.properties?.byCity?.length > 0 && (
          <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Cities</h3>
            <div className="space-y-3">
              {analytics.properties.byCity.slice(0, 5).map((city) => (
                <div key={city._id} className="flex items-center justify-between">
                  <span className="text-gray-700 font-medium">{city._id}</span>
                  <div className="flex items-center">
                    <div className="w-32 bg-gray-200 rounded-full h-2 mr-3">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{ width: `${(city.count / analytics.properties.total) * 100}%` }}
                      ></div>
                    </div>
                    <span className="text-gray-900 font-semibold">{city.count}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
    </div>
  );
}

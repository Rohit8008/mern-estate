import { useState, useEffect } from 'react';
import { apiClient } from '../utils/http';
import { usePerformance } from '../hooks/usePerformance';

const DevDashboard = () => {
  const [backendHealth, setBackendHealth] = useState(null);
  const [backendMetrics, setBackendMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const { metrics } = usePerformance();

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [health, metrics] = await Promise.all([
          apiClient.get('/health/health'),
          apiClient.get('/health/metrics')
        ]);
        
        setBackendHealth(health.data || health);
        setBackendMetrics(metrics.data || metrics);
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="fixed bottom-4 right-4 bg-white shadow-lg rounded-lg p-4 w-80 z-50">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 bg-white shadow-lg rounded-lg p-4 w-80 z-50 border border-gray-200">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">Dev Dashboard</h3>
        <div className={`w-2 h-2 rounded-full ${backendHealth?.status === 'healthy' ? 'bg-green-500' : 'bg-red-500'}`}></div>
      </div>
      
      <div className="space-y-3 text-xs">
        {/* Backend Status */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-gray-600">Backend:</span>
            <span className={`ml-1 font-medium ${backendHealth?.status === 'healthy' ? 'text-green-600' : 'text-red-600'}`}>
              {backendHealth?.status || 'Unknown'}
            </span>
          </div>
          <div>
            <span className="text-gray-600">Response:</span>
            <span className="ml-1 font-medium">{backendHealth?.responseTime || 'N/A'}</span>
          </div>
        </div>

        {/* Memory Usage */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-gray-600">Frontend Memory:</span>
            <span className="ml-1 font-medium">{metrics.memoryUsage.toFixed(1)}MB</span>
          </div>
          <div>
            <span className="text-gray-600">Backend Memory:</span>
            <span className="ml-1 font-medium">{backendMetrics?.memory?.used ? Math.round(backendMetrics.memory.used / 1024 / 1024) : 'N/A'}MB</span>
          </div>
        </div>

        {/* Performance Metrics */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-gray-600">Load Time:</span>
            <span className="ml-1 font-medium">{metrics.loadTime}ms</span>
          </div>
          <div>
            <span className="text-gray-600">Render Time:</span>
            <span className="ml-1 font-medium">{metrics.renderTime.toFixed(1)}ms</span>
          </div>
        </div>

        {/* Network */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-gray-600">Network:</span>
            <span className="ml-1 font-medium">{metrics.networkLatency.toFixed(1)}ms</span>
          </div>
          <div>
            <span className="text-gray-600">Uptime:</span>
            <span className="ml-1 font-medium">{backendHealth?.uptime ? Math.floor(backendHealth.uptime / 60) : 'N/A'}m</span>
          </div>
        </div>

        {/* Database Status */}
        {backendHealth?.database && (
          <div>
            <span className="text-gray-600">Database:</span>
            <span className={`ml-1 font-medium ${backendHealth.database.status === 'healthy' ? 'text-green-600' : 'text-red-600'}`}>
              {backendHealth.database.status}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default DevDashboard;

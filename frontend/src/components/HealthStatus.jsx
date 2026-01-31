import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { apiClient } from '../utils/http';

const HealthStatus = ({ showDetails = false, className = '' }) => {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        setLoading(true);
        const data = await apiClient.get('/health/health');
        setHealth(data.data || data);
        setError(null);
      } catch (err) {
        setError(err.message);
        setHealth(null);
      } finally {
        setLoading(false);
      }
    };

    checkHealth();
    
    // Check health every 30 seconds
    const interval = setInterval(checkHealth, 30000);
    
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
        <span className="text-sm text-gray-600">Checking status...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <div className="w-2 h-2 bg-red-500 rounded-full"></div>
        <span className="text-sm text-red-600">Service unavailable</span>
      </div>
    );
  }

  const isHealthy = health?.status === 'healthy';
  const statusColor = isHealthy ? 'bg-green-500' : 'bg-red-500';
  const statusText = isHealthy ? 'All systems operational' : 'Service issues detected';

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <div className={`w-2 h-2 ${statusColor} rounded-full`}></div>
      <span className="text-sm text-gray-600">{statusText}</span>
      
      {showDetails && health && (
        <div className="ml-4 text-xs text-gray-500">
          <div>Response: {health.responseTime}</div>
          <div>Memory: {health.memory?.used}MB / {health.memory?.total}MB</div>
          <div>Uptime: {Math.floor(health.uptime / 60)}m</div>
        </div>
      )}
    </div>
  );
};

HealthStatus.propTypes = {
  showDetails: PropTypes.bool,
  className: PropTypes.string,
};

export default HealthStatus;

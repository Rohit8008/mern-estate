import { useState, useEffect, useCallback } from 'react';

export const usePerformance = () => {
  const [metrics, setMetrics] = useState({
    loadTime: 0,
    renderTime: 0,
    memoryUsage: 0,
    networkLatency: 0,
  });

  const measureRenderTime = useCallback((componentName) => {
    const start = performance.now();
    
    return () => {
      const end = performance.now();
      const renderTime = end - start;
      
      console.log(`${componentName} render time: ${renderTime.toFixed(2)}ms`);
      
      setMetrics(prev => ({
        ...prev,
        renderTime: Math.max(prev.renderTime, renderTime)
      }));
    };
  }, []);

  const measureApiCall = useCallback(async (apiCall, endpoint) => {
    const start = performance.now();
    
    try {
      const result = await apiCall();
      const end = performance.now();
      const latency = end - start;
      
      console.log(`API call to ${endpoint}: ${latency.toFixed(2)}ms`);
      
      setMetrics(prev => ({
        ...prev,
        networkLatency: Math.max(prev.networkLatency, latency)
      }));
      
      return result;
    } catch (error) {
      const end = performance.now();
      const latency = end - start;
      
      console.error(`API call to ${endpoint} failed after ${latency.toFixed(2)}ms:`, error);
      throw error;
    }
  }, []);

  useEffect(() => {
    // Measure page load time
    const measureLoadTime = () => {
      if (performance.timing) {
        const loadTime = performance.timing.loadEventEnd - performance.timing.navigationStart;
        setMetrics(prev => ({
          ...prev,
          loadTime
        }));
      }
    };

    // Measure memory usage (if available)
    const measureMemory = () => {
      if (performance.memory) {
        const memoryUsage = performance.memory.usedJSHeapSize / 1024 / 1024; // MB
        setMetrics(prev => ({
          ...prev,
          memoryUsage
        }));
      }
    };

    // Initial measurements
    measureLoadTime();
    measureMemory();

    // Set up periodic memory monitoring
    const memoryInterval = setInterval(measureMemory, 30000); // Every 30 seconds

    return () => {
      clearInterval(memoryInterval);
    };
  }, []);

  return {
    metrics,
    measureRenderTime,
    measureApiCall,
  };
};

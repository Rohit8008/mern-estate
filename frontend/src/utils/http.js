// API base URL - empty for same-origin (dev), full URL for production
export const API_BASE_URL = import.meta.env.VITE_API_URL || '';

// Helper to get full API URL
export const getApiUrl = (path) => `${API_BASE_URL}${path}`;

export async function parseJsonSafely(response) {
  try {
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (_) {
      return null;
    }
  } catch (_) {
    return null;
  }
}

// Enhanced error handling for new backend error format
export function handleApiError(error, data) {
  if (data && data.success === false) {
    return {
      message: data.message || 'An error occurred',
      type: data.type || 'error',
      field: data.field || null,
      statusCode: data.statusCode || 500,
    };
  }
  
  return {
    message: error.message || 'Network error occurred',
    type: 'network',
    field: null,
    statusCode: 0,
  };
}

// Enhanced response handler
export async function handleApiResponse(response) {
  const data = await parseJsonSafely(response);
  
  if (!response.ok) {
    const error = handleApiError(new Error('API Error'), data);
    try {
      window.dispatchEvent(new CustomEvent('api-error', {
        detail: {
          message: error.message || 'API error occurred',
          statusCode: error.statusCode || response.status,
          data,
          url: response.url,
          type: error.type || 'error',
        }
      }));
    } catch (_) {}
    throw error;
  }
  
  return data;
}

// Token refresh utility
let isRefreshing = false;
let refreshPromise = null;

export async function refreshAccessToken(shouldRedirect = true) {
  if (isRefreshing) {
    return refreshPromise;
  }
  
  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await handleApiResponse(response);
        return data;
      } else {
        // Refresh failed
        const data = await parseJsonSafely(response);
        console.warn('Token refresh failed:', response.status, data?.message);
        
        if (shouldRedirect && !window.location.pathname.includes('/sign-in')) {
          window.dispatchEvent(new CustomEvent('auth-error', { 
            detail: { 
              type: 'AUTH_ERROR', 
              reason: 'Token refresh failed',
              message: data?.message || 'Authentication failed'
            } 
          }));
        }
        return null;
      }
    } catch (error) {
      console.error('Token refresh failed:', error);
      if (shouldRedirect && !window.location.pathname.includes('/sign-in')) {
        window.dispatchEvent(new CustomEvent('auth-error', {
          detail: {
            type: 'AUTH_ERROR',
            reason: 'Token refresh error',
            message: error.message || 'Authentication error'
          }
        }));
      }
      return null;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();
  
  return refreshPromise;
}

// Enhanced fetch with automatic token refresh
export async function fetchWithRefresh(url, options = {}, silent = false) {
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
  });

  // If token expired, try to refresh
  if (response.status === 401) {
    const refreshData = await refreshAccessToken(!silent);
    if (refreshData) {
      // Retry the original request with new token
      return fetch(url, {
        ...options,
        credentials: 'include',
      });
    } else if (!silent) {
      // Refresh failed, dispatch auth error event (only if not silent)
      if (!window.location.pathname.includes('/sign-in')) {
        window.dispatchEvent(new CustomEvent('auth-error', {
          detail: {
            type: 'AUTH_ERROR',
            reason: 'API call failed after refresh',
            message: 'Authentication failed'
          }
        }));
      }
    }
  }

  return response;
}

// Enhanced API client with better error handling
export class ApiClient {
  constructor(baseURL = '') {
    this.baseURL = baseURL;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    
    try {
      const response = await fetchWithRefresh(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });
      
      return await handleApiResponse(response);
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  async get(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'GET' });
  }

  async post(endpoint, data, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async put(endpoint, data, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async delete(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'DELETE' });
  }

  async upload(endpoint, formData, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    try {
      const response = await fetchWithRefresh(url, {
        ...options,
        method: 'POST',
        body: formData,
        // Don't set Content-Type header - browser sets it with boundary for FormData
      });
      return await handleApiResponse(response);
    } catch (error) {
      console.error('Upload request failed:', error);
      throw error;
    }
  }
}

// Create default API client instance
export const apiClient = new ApiClient(`${API_BASE_URL}/api`);



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

// Technical patterns that should never reach end users
const TECHNICAL_PATTERN = /cast to|objectid|mongoose|duplicate key|e11000|jwt|jsonwebtoken|validation error|validatorerror|stack trace|at Object\.|\.js:\d|schema|internal server error|firebase:|auth\//i;

function sanitizeMessage(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return TECHNICAL_PATTERN.test(raw) ? '' : raw.trim();
}

// Convert an HTTP status code + raw backend message into a user-friendly string.
export function toUserMessage(statusCode, rawMessage) {
  const safe = sanitizeMessage(rawMessage);
  switch (statusCode) {
    case 400: return safe || 'Invalid request. Please check your input.';
    case 401: return safe || 'Your session has expired. Please sign in again.';
    case 403: return "You don't have permission to do this.";
    case 404: return safe || 'The requested item was not found.';
    case 409: return safe || 'A conflict occurred. This item may already exist.';
    case 422: return safe || 'Please check your input and try again.';
    case 429: return 'Too many requests. Please wait a moment and try again.';
    default:
      if (statusCode >= 500) return 'Something went wrong on our end. Please try again.';
      return safe || 'An unexpected error occurred.';
  }
}

// Enhanced error handling for new backend error format
export function handleApiError(error, data, httpStatus) {
  // Re-wrap guard: when callers pass the same already-processed error as both
  // args (e.g. handleApiError(err, err)), just return it as-is so the
  // already-sanitized message isn't double-processed.
  if (error && data === error && error.statusCode !== undefined) {
    return {
      message: error.message,
      type: error.type || 'error',
      field: error.field || null,
      statusCode: error.statusCode,
    };
  }

  if (data && data.success === false) {
    const statusCode = data.statusCode || httpStatus || 500;
    return {
      message: toUserMessage(statusCode, data.message),
      type: data.type || 'error',
      field: data.field || null,
      statusCode,
    };
  }

  const isNetworkError = !error.message || error.message === 'Failed to fetch' || error.message === 'Network Error';
  return {
    message: isNetworkError
      ? 'Connection error. Please check your internet connection.'
      : toUserMessage(httpStatus || 0, error.message),
    type: 'network',
    field: null,
    statusCode: httpStatus || 0,
  };
}

// Enhanced response handler.
// Pass silent=true to suppress the global api-error toast (use when the caller
// shows its own error feedback so the user doesn't see two notifications).
export async function handleApiResponse(response, silent = false) {
  const data = await parseJsonSafely(response);

  if (!response.ok) {
    const error = handleApiError(new Error('API Error'), data, response.status);
    if (!silent) {
      try {
        window.dispatchEvent(new CustomEvent('api-error', {
          detail: {
            message: error.message,
            statusCode: response.status,
            data,
            url: response.url,
            type: error.type || 'error',
          }
        }));
      } catch (_) {}
    }
    throw error;
  }

  return data;
}

// Token refresh utility
let isRefreshing = false;
let refreshPromise = null;
let _userSignedOut = false;

// Call before a user-initiated signout so in-flight 401s don't trigger refresh.
// Call with false again after a successful signin.
export function setUserSignedOut(value) {
  _userSignedOut = value;
  if (value) {
    isRefreshing = false;
    refreshPromise = null;
  }
}

export async function refreshAccessToken(shouldRedirect = true) {
  if (_userSignedOut) return null;
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

  // If token expired, try to refresh — but not after a user-initiated signout
  if (response.status === 401 && !_userSignedOut) {
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
    // Extract silent before spreading into fetch options so it doesn't leak
    // into the fetch RequestInit and cause unexpected behaviour.
    const { silent, ...fetchOptions } = options;
    const url = `${this.baseURL}${endpoint}`;

    try {
      const response = await fetchWithRefresh(url, {
        ...fetchOptions,
        headers: {
          'Content-Type': 'application/json',
          ...fetchOptions.headers,
        },
      }, silent);
      return await handleApiResponse(response, silent);
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

  async patch(endpoint, data, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async delete(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'DELETE' });
  }

  async upload(endpoint, formData, options = {}) {
    const { silent, ...fetchOptions } = options;
    const url = `${this.baseURL}${endpoint}`;
    try {
      const response = await fetchWithRefresh(url, {
        ...fetchOptions,
        method: 'POST',
        body: formData,
        // Don't set Content-Type header - browser sets it with boundary for FormData
      }, silent);
      return await handleApiResponse(response, silent);
    } catch (error) {
      console.error('Upload request failed:', error);
      throw error;
    }
  }
}

// Create default API client instance
export const apiClient = new ApiClient(`${API_BASE_URL}/api`);

/**
 * Normalise an image URL so it works in both dev (Vite proxy) and production.
 * Old listings may have stored absolute localhost URLs like
 * "http://localhost:3000/uploads/file.jpg". Convert those to relative paths
 * "/uploads/file.jpg" so the Vite proxy / Express static handler serves them.
 */
export function normalizeImageUrl(url) {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
      return u.pathname + u.search;
    }
  } catch (_) {}
  return url;
}



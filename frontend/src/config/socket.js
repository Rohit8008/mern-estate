import { io } from 'socket.io-client';

/**
 * Socket.io configuration
 * In development, connects to localhost:3000
 * In production, connects to the same origin (relative path)
 * Can be overridden via VITE_SOCKET_URL environment variable
 */
const getSocketUrl = () => {
  // Allow explicit override via environment variable
  if (import.meta.env.VITE_SOCKET_URL) {
    return import.meta.env.VITE_SOCKET_URL;
  }

  // Use the API URL (backend) if available — needed when frontend and backend
  // are deployed as separate services (e.g. on Render)
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  // In production, use same origin (works only if frontend is served by backend)
  if (import.meta.env.PROD) {
    return '';
  }

  // In development, connect to the backend server
  return 'http://localhost:3000';
};

export const SOCKET_URL = getSocketUrl();

/**
 * Create a Socket.io connection with authentication
 * @param {string} userId - The current user's ID for authentication
 * @param {object} options - Additional socket.io options
 * @returns {Socket} Socket.io client instance
 */
export const createSocket = (userId, options = {}) => {
  return io(SOCKET_URL, {
    withCredentials: true,
    auth: { userId },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
    ...options,
  });
};

export default createSocket;

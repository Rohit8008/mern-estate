import { createContext, useContext, useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import Notification from '../components/Notification';

const NotificationContext = createContext();

const MAX_VISIBLE = 3;

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);

  const removeNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  }, []);

  const addNotification = useCallback((notification) => {
    const newNotification = {
      type: 'info',
      duration: 5000,
      onClick: undefined,
      ...notification,
    };
    // Same type + text already on screen: keep one. A failed request used to
    // stack two identical toasts — the global api-error listener and the
    // page's own catch both reported it.
    const dedupeKey = `${newNotification.type}:${newNotification.message}`;
    const id = Date.now() + Math.random();
    const entry = { ...newNotification, id, dedupeKey };
    // Newest last; never more than MAX_VISIBLE on screen.
    // Checked inside the updater, so two identical calls in the same tick —
    // the double-report case — still collapse to one.
    setNotifications((prev) =>
      prev.some((n) => n.dedupeKey === dedupeKey) ? prev : [...prev, entry].slice(-MAX_VISIBLE)
    );

    // One timer, owned here. The toast component no longer runs its own.
    if (entry.duration > 0) {
      setTimeout(() => removeNotification(id), entry.duration);
    }
    return id;
  }, [removeNotification]);

  const showSuccess = useCallback((message, options = {}) => {
    return addNotification({ type: 'success', message, ...options });
  }, [addNotification]);

  const showError = useCallback((message, options = {}) => {
    return addNotification({ type: 'error', message, duration: 7000, ...options });
  }, [addNotification]);

  const showWarning = useCallback((message, options = {}) => {
    return addNotification({ type: 'warning', message, ...options });
  }, [addNotification]);

  const showInfo = useCallback((message, options = {}) => {
    return addNotification({ type: 'info', message, ...options });
  }, [addNotification]);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const value = {
    notifications,
    addNotification,
    removeNotification,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    clearAll,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
      {/* Fixed width: the tray used to shrink to fit, and the toast's
          `w-0 flex-1` message column collapsed to a word per line. Above
          modals (z-[1000]) so feedback from a modal form is visible. */}
      <div
        className="fixed top-4 right-4 z-[1100] w-[min(24rem,calc(100vw-2rem))] space-y-2 pointer-events-none"
        aria-live="polite"
      >
        {notifications.map((notification) => (
          <Notification
            key={notification.id}
            {...notification}
            onClose={() => removeNotification(notification.id)}
          />
        ))}
      </div>
    </NotificationContext.Provider>
  );
};

NotificationProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

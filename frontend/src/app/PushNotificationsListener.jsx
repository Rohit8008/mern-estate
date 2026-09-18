import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';

import { useNotification } from '../contexts/NotificationContext';
import { createSocket } from '../config/socket';
import { useNotificationPreferences } from '../hooks/useNotificationPreferences';

export default function PushNotificationsListener() {
  const { currentUser } = useSelector((state) => state.user);
  const { showInfo } = useNotification();
  const location = useLocation();
  const navigate = useNavigate();

  const prefs = useNotificationPreferences(currentUser?._id);

  useEffect(() => {
    if (!currentUser?._id) return;

    const socket = createSocket(currentUser._id, { transports: ['websocket'] });

    const onUnreadMessages = ({ count }) => {
      if (!prefs.pushMessages) return;
      if (location.pathname.startsWith('/messages')) return;
      showInfo(`You have ${count} unread message${count === 1 ? '' : 's'}`, {
        duration: 6000,
        onClick: () => { try { navigate('/messages'); } catch (_) {} },
      });
    };

    const onNewMessage = (msg) => {
      try {
        if (!prefs.pushMessages) return;
        if (!msg) return;
        if (String(msg.receiverId) !== String(currentUser._id)) return;

        const isOnMessages = location.pathname.startsWith('/messages');
        if (isOnMessages) return;

        const senderLabel = msg.senderName || msg.senderUsername || 'Someone';
        const preview = msg.content ? msg.content.slice(0, 50) + (msg.content.length > 50 ? '...' : '') : '';

        showInfo(`${senderLabel}: ${preview || 'sent you a message'}`, {
          duration: 5000,
          onClick: () => {
            try {
              navigate('/messages');
            } catch (error) {
              console.error(error);
            }
          },
        });
      } catch (error) {
        console.error(error);
      }
    };

    const LISTING_ACTION_VERBS = {
      created: 'was created',
      deleted: 'was deleted',
      soft_deleted: 'was deleted',
      restored: 'was restored',
      assigned: 'was assigned to an agent',
      unassigned: 'was unassigned',
    };

    const onListingUpdate = (payload) => {
      try {
        if (!prefs.pushListingUpdates) return;
        if (!payload) return;
        if (location.pathname.startsWith('/search') || location.pathname.startsWith('/listing')) return;

        if (payload.action === 'bulk_import') {
          const count = payload.count ?? 0;
          showInfo(`${count} listing${count === 1 ? '' : 's'} imported`, { duration: 5000 });
          return;
        }

        const title = payload?.title || payload?.name || 'A listing';
        const verb = LISTING_ACTION_VERBS[payload.action] || 'was updated';
        showInfo(`${title} ${verb}`, { duration: 5000 });
      } catch (error) {
        console.error(error);
      }
    };

    socket.on('unread:messages', onUnreadMessages);
    socket.on('message:new', onNewMessage);
    socket.on('listing:update', onListingUpdate);

    return () => {
      socket.off('unread:messages', onUnreadMessages);
      socket.off('message:new', onNewMessage);
      socket.off('listing:update', onListingUpdate);
      socket.close();
    };
  }, [currentUser?._id, location.pathname, navigate, prefs.pushListingUpdates, prefs.pushMessages, showInfo]);

  return null;
}

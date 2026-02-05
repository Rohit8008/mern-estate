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

    const onNewMessage = (msg) => {
      try {
        if (!prefs.pushMessages) return;
        if (!msg) return;
        if (String(msg.receiverId) !== String(currentUser._id)) return;

        const isOnMessages = location.pathname.startsWith('/messages');
        if (isOnMessages) return;

        const senderLabel = msg.senderName || msg.senderUsername || 'someone';

        showInfo(`New message from ${senderLabel}`, {
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

    const onListingUpdate = (payload) => {
      try {
        if (!prefs.pushListingUpdates) return;
        if (!payload) return;
        if (location.pathname.startsWith('/search') || location.pathname.startsWith('/listing')) return;

        const title = payload?.title || payload?.name || 'A listing';
        showInfo(`${title} was updated`, { duration: 5000 });
      } catch (error) {
        console.error(error);
      }
    };

    socket.on('message:new', onNewMessage);
    socket.on('listing:update', onListingUpdate);

    return () => {
      socket.off('message:new', onNewMessage);
      socket.off('listing:update', onListingUpdate);
      socket.close();
    };
  }, [currentUser?._id, location.pathname, navigate, prefs.pushListingUpdates, prefs.pushMessages, showInfo]);

  return null;
}

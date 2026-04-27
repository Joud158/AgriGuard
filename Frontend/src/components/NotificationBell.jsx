import React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getNotifications, markNotificationRead } from '../services/authApi';

function formatTimestamp(value) {
  if (!value) return 'Date unavailable';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Date unavailable';

  return parsed.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function normalizeNotifications(items) {
  if (!Array.isArray(items)) return [];

  return items.map((item) => ({
    id: item.id,
    message: item.message || 'Notification',
    type: item.type || '',
    is_read: Boolean(item.is_read),
    created_at: item.created_at || item.createdAt || '',
    announcement_id:
      item.announcement_id ||
      item.announcementId ||
      (item.related_entity_type === 'announcement' ? item.related_entity_id : '') ||
      (item.relatedEntityType === 'announcement' ? item.relatedEntityId : '') ||
      '',
    event_id:
      item.event_id ||
      item.eventId ||
      (item.related_entity_type === 'event' ? item.related_entity_id : '') ||
      (item.relatedEntityType === 'event' ? item.relatedEntityId : '') ||
      '',
    event_request_id:
      item.event_request_id ||
      item.eventRequestId ||
      (item.related_entity_type === 'event_request' ? item.related_entity_id : '') ||
      (item.relatedEntityType === 'event_request' ? item.relatedEntityId : '') ||
      '',
    conversation_id:
      item.conversation_id ||
      item.conversationId ||
      (item.related_entity_type === 'conversation' ? item.related_entity_id : '') ||
      (item.relatedEntityType === 'conversation' ? item.relatedEntityId : '') ||
      '',
    related_entity_type: item.related_entity_type || item.relatedEntityType || '',
  }));
}

function isEventRequestNotification(notification) {
  if (notification.event_request_id) return true;
  return (
    notification.type.startsWith('event_request_') ||
    notification.related_entity_type === 'event_request'
  );
}

function isAnnouncementNotification(notification) {
  if (notification.announcement_id) return true;
  return notification.type === 'announcement_posted' || notification.related_entity_type === 'announcement';
}

function isEventNotification(notification) {
  if (notification.event_id) return true;
  return notification.type.startsWith('event_') || notification.related_entity_type === 'event';
}

function isConversationNotification(notification) {
  if (notification.conversation_id) return true;
  return notification.type === 'message_received' || notification.related_entity_type === 'conversation';
}

function BellIcon() {
  return (
    <svg
      className="notification-bell-svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 17h5l-1.4-1.4a2 2 0 0 1-.6-1.4V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
      <path d="M10 17a2 2 0 0 0 4 0" />
    </svg>
  );
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [notifications, setNotifications] = useState([]);
  const rootRef = useRef(null);

  useEffect(() => {
    function handlePointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    function handleRefresh() {
      loadNotifications({ silent: true }).catch(() => {});
    }

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('notifications:refresh', handleRefresh);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('notifications:refresh', handleRefresh);
    };
  }, []);

  async function loadNotifications(options = {}) {
    const { silent = false } = options;

    if (!silent) {
      setLoading(true);
      setMessage('');
    }

    const response = await getNotifications();
    if (!response.success) {
      if (!silent) {
        setMessage(response.message || 'Unable to load notifications.');
      }
      setNotifications([]);
      if (!silent) {
        setLoading(false);
      }
      return;
    }

    setNotifications(normalizeNotifications(response.data));
    if (!silent) {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadNotifications({ silent: true }).catch(() => {});

    const intervalId = window.setInterval(() => {
      loadNotifications({ silent: true }).catch(() => {});
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, []);

  async function handleToggle() {
    const nextOpen = !open;
    setOpen(nextOpen);

    if (nextOpen) {
      await loadNotifications().catch(() => {
        setMessage('Unable to load notifications right now.');
        setNotifications([]);
        setLoading(false);
      });
    }
  }

  async function handleMarkRead(notificationId) {
    setNotifications((current) =>
      current.map((item) =>
        item.id === notificationId
          ? {
              ...item,
              is_read: true,
            }
          : item
      )
    );

    const response = await markNotificationRead(notificationId);
    if (!response.success) {
      setMessage(response.message || 'Unable to update this notification.');
      await loadNotifications().catch(() => {
        setMessage('Unable to refresh notifications right now.');
      });
      return;
    }

    window.dispatchEvent(new Event('notifications:refresh'));
  }

async function handleNotificationClick(notification) {
    if (!notification.is_read) {
      await handleMarkRead(notification.id);
    }

    if (isAnnouncementNotification(notification)) {
      setOpen(false);
      navigate('/announcements', {
        state: {
          targetAnnouncementId: notification.announcement_id || '',
          sourceNotificationId: notification.id,
        },
      });
      return;
    }

    if (isEventRequestNotification(notification)) {
      setOpen(false);
      navigate(
        notification.event_request_id ? `/event-requests/${notification.event_request_id}` : '/event-requests'
      );
      return;
    }

    if (isEventNotification(notification)) {
      setOpen(false);
      navigate(notification.event_id ? `/events/${notification.event_id}` : '/events');
      return;
    }

    if (isConversationNotification(notification)) {
      setOpen(false);
      navigate(notification.conversation_id ? `/chat/${notification.conversation_id}` : '/chat');
    }
  }

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.is_read).length,
    [notifications]
  );

  return (
    <div className="notification-bell-wrap" ref={rootRef}>
      <button
        type="button"
        className="notification-bell-button"
        onClick={handleToggle}
        aria-label="Open notification center"
        aria-expanded={open}
      >
        <BellIcon />
        {unreadCount > 0 ? <span className="notification-bell-indicator" aria-hidden="true" /> : null}
      </button>

      {open ? (
        <div className="notification-panel">
          <div className="notification-panel-head">
            <h2>Notification Center</h2>
            {unreadCount > 0 ? <span className="pill-muted">{unreadCount} unread</span> : null}
          </div>

          {loading ? (
            <p className="notification-panel-state">Loading...</p>
          ) : message ? (
            <p className="notification-panel-state error">{message}</p>
          ) : notifications.length === 0 ? (
            <p className="notification-panel-state">No new updates right now.</p>
          ) : (
            <div className="notification-panel-list">
              {notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  className={notification.is_read ? 'notification-item' : 'notification-item unread'}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="notification-item-main">
                    <p>{notification.message}</p>
                    <span>{formatTimestamp(notification.created_at)}</span>
                  </div>
                  {!notification.is_read ? (
                    <span className="notification-item-tag">New</span>
                  ) : (
                    <span className="notification-item-tag muted">Read</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}


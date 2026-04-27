import React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';

import DashboardLayout from '../layouts/DashboardLayout';
import Toast from '../components/Toast';

import { useAuth } from '../context/AuthContext';
import { getAnnouncements, getNotifications, markNotificationRead } from '../services/authApi';

function formatDateTime(value) {
  if (!value) return 'Date unavailable';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Date unavailable';

  return parsed.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function buildSnippet(message) {
  const text = String(message || '').trim();

  if (text.length <= 140) return text;

  return `${text.slice(0, 140).trimEnd()}...`;
}

function resolveTeamLabel(announcement) {
  if (announcement.audience_label) return announcement.audience_label;
  if (announcement.team?.name) return announcement.team.name;
  if (announcement.team_name) return announcement.team_name;
  if (announcement.teamName) return announcement.teamName;
  if (announcement.team_id) return 'Field update';

  return 'Announcement';
}

function formatSenderLabel(announcement) {
  const senderName =
    announcement.sender?.full_name ||
    announcement.sender?.fullName ||
    'Unknown sender';

  const senderRole = announcement.sender?.role || '';

  const normalizedRole = senderRole
    ? `${senderRole.charAt(0).toUpperCase()}${senderRole.slice(1)}`
    : '';

  return normalizedRole ? `${senderName} (${normalizedRole})` : senderName;
}

function isAnnouncementNotification(notification) {
  return (
    notification.type === 'announcement_posted' ||
    notification.related_entity_type === 'announcement' ||
    notification.relatedEntityType === 'announcement'
  );
}

function renderAnnouncementList(items, expandedIds, targetAnnouncementId, itemRefs, toggleExpanded) {
  if (!items.length) {
    return (
      <div className="teams-note-card compact">
        <strong>No announcements yet</strong>
        <p>Farm announcements posted by the administrator will appear here.</p>
      </div>
    );
  }

  return (
    <div className="announcement-archive-list">
      {items.map((announcement) => {
        const isExpanded = expandedIds.includes(announcement.id);

        return (
          <article
            key={announcement.id}
            ref={(element) => {
              if (element) {
                itemRefs.current.set(announcement.id, element);
              } else {
                itemRefs.current.delete(announcement.id);
              }
            }}
            className={
              targetAnnouncementId && targetAnnouncementId === announcement.id
                ? isExpanded
                  ? 'announcement-archive-item expanded highlighted'
                  : 'announcement-archive-item highlighted'
                : isExpanded
                  ? 'announcement-archive-item expanded'
                  : 'announcement-archive-item'
            }
          >
            <button
              type="button"
              className="announcement-archive-trigger"
              onClick={() => toggleExpanded(announcement.id)}
              aria-expanded={isExpanded}
            >
              <div className="announcement-archive-main">
                <div className="announcement-archive-meta">
                  <span className="announcement-archive-date">
                    {announcement.createdLabel}
                  </span>
                </div>

                <h2>{announcement.title}</h2>

                <p>
                  <strong>Sent by:</strong> {announcement.senderLabel}
                </p>

                <p>
                  <strong>Sent to:</strong> {announcement.teamLabel}
                </p>

                <p>
                  {isExpanded
                    ? announcement.message
                    : announcement.snippet || 'No message provided.'}
                </p>
              </div>
            </button>
          </article>
        );
      })}
    </div>
  );
}

export default function AnnouncementsPage() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [expandedIds, setExpandedIds] = useState([]);

  const itemRefs = useRef(new Map());
  const handledTargetRef = useRef('');

  const role = user?.role || 'player';
  const isAdmin = role === 'admin';

  const targetAnnouncementId =
    location.state?.targetAnnouncementId || searchParams.get('announcementId') || '';

  useEffect(() => {
    let active = true;

    async function loadAnnouncements() {
      const response = await getAnnouncements();

      if (!active) return;

      if (!response.success) {
        setMessage(response.message || 'Unable to load announcements.');
        setAnnouncements([]);
        setLoading(false);
        return;
      }

      const items = Array.isArray(response.data) ? response.data : [];

      setAnnouncements(items);
      setLoading(false);
    }

    loadAnnouncements().catch(() => {
      if (!active) return;

      setMessage('Unable to load announcements right now.');
      setAnnouncements([]);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function markAnnouncementNotificationsRead() {
      const response = await getNotifications();

      if (!active || !response.success || !Array.isArray(response.data)) {
        return;
      }

      const unreadAnnouncementIds = response.data
        .filter((notification) => !notification.is_read && isAnnouncementNotification(notification))
        .map((notification) => notification.id)
        .filter(Boolean);

      if (!unreadAnnouncementIds.length) {
        return;
      }

      await Promise.all(
        unreadAnnouncementIds.map((notificationId) => markNotificationRead(notificationId))
      );

      if (!active) return;

      window.dispatchEvent(new Event('notifications:refresh'));
    }

    markAnnouncementNotificationsRead().catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  const normalizedAnnouncements = useMemo(
    () =>
      announcements.map((announcement) => ({
        ...announcement,
        title: announcement.title || 'Untitled announcement',
        message: announcement.message || '',
        teamLabel: resolveTeamLabel(announcement),
        senderLabel: formatSenderLabel(announcement),
        createdLabel: formatDateTime(announcement.created_at || announcement.createdAt),
        snippet: buildSnippet(announcement.message),
      })),
    [announcements]
  );

  const visibleAnnouncements = useMemo(() => {
    if (isAdmin) {
      return normalizedAnnouncements;
    }

    return normalizedAnnouncements.filter((announcement) => {
      const senderRole = announcement.sender?.role || '';
      return senderRole === 'admin' || !senderRole;
    });
  }, [isAdmin, normalizedAnnouncements]);

  useEffect(() => {
    if (!visibleAnnouncements.length) return;

    if (targetAnnouncementId && handledTargetRef.current !== targetAnnouncementId) {
      const match = visibleAnnouncements.find(
        (announcement) => announcement.id === targetAnnouncementId
      );

      if (match) {
        handledTargetRef.current = targetAnnouncementId;

        setExpandedIds((current) =>
          current.includes(match.id) ? current : [...current, match.id]
        );

        const element = itemRefs.current.get(match.id);

        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
  }, [visibleAnnouncements, targetAnnouncementId]);

  function toggleExpanded(id) {
    setExpandedIds((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id]
    );
  }

  return (
    <DashboardLayout role={role}>
      <div className="page-head">
        <div>
          <h1>Announcements</h1>
          <p>
            {isAdmin
              ? 'Create and review announcements shared with farmers and agronomists.'
              : 'View announcements shared by the administrator.'}
          </p>
        </div>

        {isAdmin ? (
          <Link to="/announcements/create" className="primary-button">
            Create Announcement
          </Link>
        ) : null}
      </div>

      <section className="dashboard-card announcement-archive-card">
        {loading ? (
          <p className="loading-text">Loading...</p>
        ) : (
          renderAnnouncementList(
            visibleAnnouncements,
            expandedIds,
            targetAnnouncementId,
            itemRefs,
            toggleExpanded
          )
        )}
      </section>

      <Toast message={message} variant="error" />
    </DashboardLayout>
  );
}
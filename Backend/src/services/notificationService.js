const { randomUUID } = require('crypto');
const { readDb, updateDb } = require('../data/store');
const httpError = require('../utils/httpError');

function ensureCollections(db) {
  if (!Array.isArray(db.notifications)) db.notifications = [];
  if (!Array.isArray(db.teams)) db.teams = [];
  if (!Array.isArray(db.players)) db.players = [];
  if (!Array.isArray(db.team_memberships)) db.team_memberships = [];
  if (!Array.isArray(db.users)) db.users = [];
}

function sanitizeNotification(notification) {
  return {
    id: notification.id,
    club_id: notification.club_id,
    user_id: notification.user_id,
    team_id: notification.team_id,
    type: notification.type,
    message: notification.message,
    related_entity_type: notification.related_entity_type,
    related_entity_id: notification.related_entity_id,
    is_read: notification.is_read,
    created_at: notification.created_at,
    read_at: notification.read_at,
  };
}

async function listNotifications(actor) {
  const db = await readDb();
  ensureCollections(db);

  return db.notifications
    .filter((entry) => entry.user_id === actor.id && entry.club_id === actor.clubId)
    .sort((left, right) => new Date(right.created_at) - new Date(left.created_at))
    .map(sanitizeNotification);
}

async function markNotificationRead(actor, notificationId) {
  return updateDb(async (db) => {
    ensureCollections(db);

    const notification = db.notifications.find(
      (entry) => entry.id === notificationId && entry.user_id === actor.id && entry.club_id === actor.clubId
    );

    if (!notification) {
      throw httpError(404, 'Notification not found.');
    }

    if (!notification.is_read) {
      notification.is_read = true;
      notification.read_at = new Date().toISOString();
    }

    return sanitizeNotification(notification);
  });
}

function createNotificationRecord({
  clubId,
  userId,
  teamId = '',
  type,
  message,
  relatedEntityType = '',
  relatedEntityId = '',
}) {
  const now = new Date().toISOString();

  return {
    id: `notification-${randomUUID()}`,
    club_id: clubId,
    user_id: userId,
    team_id: teamId,
    type,
    message,
    related_entity_type: relatedEntityType,
    related_entity_id: relatedEntityId,
    is_read: false,
    created_at: now,
    read_at: null,
  };
}

function buildEventNotificationMessage(event, teamName, action) {
  const verb =
    action === 'updated' ? 'updated' : action === 'cancelled' ? 'cancelled' : 'scheduled';
  return `${event.title} (${event.type}) was ${verb} for ${teamName}.`;
}

function buildAnnouncementNotificationMessage(announcement, teamName) {
  return `New announcement for ${teamName}: ${announcement.title}.`;
}

function buildEventRequestNotificationMessage(request, teamName, action) {
  if (action === 'submitted') {
    return `New event request for ${teamName}: ${request.current_title}.`;
  }

  if (action === 'assigned') {
    return `You have been assigned to review an agronomist request for ${teamName}: ${request.current_title}.`;
  }

  if (action === 'coach_declined') {
    const reason = request.rejection_reason ? ` Reason: ${request.rejection_reason}` : '';
    return `Agronomist requested reassignment for ${teamName}: ${request.current_title}.${reason}`;
  }

  if (action === 'approved') {
    return `Your event request for ${teamName} was approved: ${request.current_title}.`;
  }

  if (action === 'rejected') {
    const reason = request.rejection_reason ? ` Reason: ${request.rejection_reason}` : '';
    return `Your event request for ${teamName} was rejected: ${request.current_title}.${reason}`;
  }

  if (action === 'suggested') {
    return `Admin suggested updates to your event request for ${teamName}: ${request.current_title}.`;
  }

  if (action === 'revised') {
    return `Coach revised the event request for ${teamName}: ${request.current_title}.`;
  }

  return `Event request updated for ${teamName}: ${request.current_title}.`;
}

function getActiveUsersByRole(db, clubId, role, actorId) {
  return db.users.filter((user) => {
    return user.club_id === clubId && user.role === role && user.is_active && user.id !== actorId;
  });
}

function getActiveUsersByRoles(db, clubId, roles, actorId) {
  const roleSet = new Set(roles);
  return db.users.filter((user) => {
    return user.club_id === clubId && roleSet.has(user.role) && user.is_active && user.id !== actorId;
  });
}

function getTeamNotificationRecipientIds(db, clubId, teamId, actorId) {
  const team = db.teams.find((entry) => entry.id === teamId && entry.club_id === clubId);
  if (!team) {
    return [];
  }

  const recipientIds = new Set();

  if (team.coach_user_id && team.coach_user_id !== actorId) {
    recipientIds.add(team.coach_user_id);
  }

  const playerIds = new Set(
    db.team_memberships.filter((entry) => entry.team_id === teamId).map((entry) => entry.player_id)
  );

  db.players.forEach((player) => {
    if (player.club_id === clubId && playerIds.has(player.id) && player.user_id && player.user_id !== actorId) {
      recipientIds.add(player.user_id);
    }
  });

  return Array.from(recipientIds).filter((userId) => {
    return db.users.some((user) => user.id === userId && user.club_id === clubId && user.is_active);
  });
}

function appendEventNotifications(db, { actor, event, action, excludeUserIds = [] }) {
  ensureCollections(db);

  const team = db.teams.find((entry) => entry.id === event.team_id && entry.club_id === actor.clubId);
  if (!team) {
    return [];
  }

  const recipientIds = getTeamNotificationRecipientIds(db, actor.clubId, event.team_id, actor.id);
  const excludedIds = new Set([actor.id, ...excludeUserIds.filter(Boolean)]);
  const notifications = [];
  const emailDispatches = [];

  recipientIds.forEach((userId) => {
    if (excludedIds.has(userId)) {
      return;
    }

    const user = db.users.find((entry) => entry.id === userId && entry.club_id === actor.clubId && entry.is_active);
    if (!user) {
      return;
    }

    const notification = createNotificationRecord({
      clubId: actor.clubId,
      userId,
      teamId: event.team_id,
      type:
        action === 'updated' ? 'event_updated' : action === 'cancelled' ? 'event_cancelled' : 'event_created',
      message: buildEventNotificationMessage(event, team.name, action),
      relatedEntityType: 'event',
      relatedEntityId: event.id,
    });

    notifications.push(notification);
    emailDispatches.push({
      to: user.email,
      recipientName: user.full_name,
      eventId: event.id,
      eventTitle: event.title,
      eventType: event.type,
      teamName: team.name,
      action,
      startTime: event.start_time,
      endTime: event.end_time,
      location: event.location,
    });
  });

  if (notifications.length > 0) {
    db.notifications.unshift(...notifications);
  }

  return {
    notifications,
    emailDispatches,
  };
}

function appendEventRequestNotifications(db, { actor, request, action }) {
  ensureCollections(db);

  const team = db.teams.find((entry) => entry.id === request.team_id && entry.club_id === actor.clubId);
  if (!team) {
    return {
      notifications: [],
    };
  }

  let recipients = [];

  const assignedAgronomist = request.coach_user_id
    ? db.users.find(
        (entry) =>
          entry.id === request.coach_user_id &&
          entry.club_id === actor.clubId &&
          entry.is_active &&
          entry.id !== actor.id
      )
    : null;

  if (action === 'submitted') {
    if (request.status === 'pending_admin_review' || !assignedAgronomist) {
      recipients = getActiveUsersByRole(db, actor.clubId, 'admin', actor.id);
    } else {
      recipients = [assignedAgronomist];
    }
  } else if (action === 'assigned') {
    recipients = assignedAgronomist ? [assignedAgronomist] : [];
  } else if (action === 'revised' || action === 'coach_declined') {
    recipients = getActiveUsersByRole(db, actor.clubId, 'admin', actor.id);
  } else if (action === 'rejected' || action === 'approved') {
    const farmer = request.requested_by_user_id
      ? db.users.find(
          (entry) =>
            entry.id === request.requested_by_user_id &&
            entry.club_id === actor.clubId &&
            entry.is_active &&
            entry.id !== actor.id
        )
      : null;
    recipients = farmer ? [farmer] : [];
  } else {
    recipients = assignedAgronomist ? [assignedAgronomist] : [];
  }

  const typeMap = {
    submitted: 'event_request_submitted',
    approved: 'event_request_approved',
    rejected: 'event_request_rejected',
    assigned: 'event_request_assigned',
    coach_declined: 'event_request_coach_declined',
    suggested: 'event_request_modification_suggested',
    revised: 'event_request_revised',
  };

  const notifications = recipients.map((user) =>
    createNotificationRecord({
      clubId: actor.clubId,
      userId: user.id,
      teamId: request.team_id,
      type: typeMap[action] || 'event_request_updated',
      message: buildEventRequestNotificationMessage(request, team.name, action),
      relatedEntityType: 'event_request',
      relatedEntityId: request.id,
    })
  );

  if (notifications.length > 0) {
    db.notifications.unshift(...notifications);
  }

  return {
    notifications,
  };
}

function appendAnnouncementNotifications(db, { actor, announcement, audience }) {
  ensureCollections(db);

  let recipients = [];
  let audienceLabel = audience?.label || 'Announcement';

  if (audience?.type === 'all_coaches') {
    recipients = getActiveUsersByRole(db, actor.clubId, 'coach', actor.id);
  } else if (audience?.type === 'all_players') {
    recipients = getActiveUsersByRole(db, actor.clubId, 'player', actor.id);
  } else if (audience?.type === 'all_users') {
    recipients = getActiveUsersByRoles(db, actor.clubId, ['coach', 'player'], actor.id);
  } else {
    const team = db.teams.find((entry) => entry.id === announcement.team_id && entry.club_id === actor.clubId);
    if (!team) {
      return {
        notifications: [],
        emailDispatches: [],
      };
    }

    audienceLabel = team.name;
    const recipientIds = getTeamNotificationRecipientIds(db, actor.clubId, announcement.team_id, actor.id);
    recipients = recipientIds
      .map((userId) =>
        db.users.find((entry) => entry.id === userId && entry.club_id === actor.clubId && entry.is_active)
      )
      .filter(Boolean);
  }
  const notifications = [];
  const emailDispatches = [];

  recipients.forEach((user) => {
    const notification = createNotificationRecord({
      clubId: actor.clubId,
      userId: user.id,
      teamId: announcement.team_id || '',
      type: 'announcement_posted',
      message: buildAnnouncementNotificationMessage(announcement, audienceLabel),
      relatedEntityType: 'announcement',
      relatedEntityId: announcement.id,
    });

    notifications.push(notification);
    emailDispatches.push({
      to: user.email,
      recipientName: user.full_name,
      announcementId: announcement.id,
      announcementTitle: announcement.title,
      announcementMessage: announcement.message,
      teamName: audienceLabel,
    });
  });

  if (notifications.length > 0) {
    db.notifications.unshift(...notifications);
  }

  return {
    notifications,
    emailDispatches,
  };
}

module.exports = {
  listNotifications,
  markNotificationRead,
  createNotificationRecord,
  appendEventNotifications,
  appendEventRequestNotifications,
  appendAnnouncementNotifications,
};

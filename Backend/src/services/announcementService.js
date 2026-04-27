const { randomUUID } = require('crypto');
const { readDb, updateDb } = require('../data/store');
const httpError = require('../utils/httpError');
const { appendAnnouncementNotifications } = require('./notificationService');
const { sendAnnouncementNotificationEmails } = require('./emailService');

function ensureCollections(db) {
  if (!Array.isArray(db.announcements)) db.announcements = [];
  if (!Array.isArray(db.teams)) db.teams = [];
  if (!Array.isArray(db.users)) db.users = [];
  if (!Array.isArray(db.players)) db.players = [];
  if (!Array.isArray(db.team_memberships)) db.team_memberships = [];
}

function getTeamOrThrow(db, clubId, teamId) {
  const team = db.teams.find((entry) => entry.id === teamId && entry.club_id === clubId);
  if (!team) {
    throw httpError(404, 'Team not found.');
  }
  return team;
}

function getStoredAudienceType(announcement) {
  return announcement.audience_type || (announcement.team_id ? 'team_players' : '');
}

function findPlayerRecordByUserId(db, clubId, userId) {
  return db.players.find((entry) => entry.club_id === clubId && entry.user_id === userId) || null;
}

function isPlayerAssignedToTeam(db, clubId, userId, teamId) {
  if (!teamId) {
    return false;
  }

  const playerRecord = findPlayerRecordByUserId(db, clubId, userId);
  if (!playerRecord) {
    return false;
  }

  return db.team_memberships.some((entry) => entry.team_id === teamId && entry.player_id === playerRecord.id);
}

function canActorViewAnnouncement(db, actor, announcement) {
  if (announcement.club_id !== actor.clubId) {
    return false;
  }

  if (actor.role === 'admin') {
    return true;
  }

  if (announcement.created_by === actor.id) {
    return true;
  }

  const audienceType = getStoredAudienceType(announcement);

  if (actor.role === 'coach') {
    if (audienceType === 'all_coaches' || audienceType === 'all_users') {
      return true;
    }

    if (audienceType === 'team_players' && announcement.team_id) {
      const team = db.teams.find((entry) => entry.id === announcement.team_id && entry.club_id === actor.clubId);
      return Boolean(team && team.coach_user_id === actor.id);
    }

    return false;
  }

  if (actor.role === 'player') {
    if (audienceType === 'all_players' || audienceType === 'all_users') {
      return true;
    }

    if (audienceType === 'team_players') {
      return isPlayerAssignedToTeam(db, actor.clubId, actor.id, announcement.team_id);
    }
  }

  return false;
}

function sanitizeAnnouncement(announcement, db = null) {
  const sender =
    db?.users.find(
      (entry) => entry.id === announcement.created_by && entry.club_id === announcement.club_id
    ) || null;
  const team =
    announcement.team_id && db
      ? db.teams.find((entry) => entry.id === announcement.team_id && entry.club_id === announcement.club_id) || null
      : null;

  return {
    id: announcement.id,
    club_id: announcement.club_id,
    team_id: announcement.team_id,
    audience_type: announcement.audience_type || (announcement.team_id ? 'team_players' : ''),
    audience_label: announcement.audience_label || team?.name || 'Announcement',
    title: announcement.title,
    message: announcement.message,
    created_by: announcement.created_by,
    sender: sender
      ? {
          id: sender.id,
          full_name: sender.full_name,
          role: sender.role,
        }
      : null,
    created_at: announcement.created_at,
    updated_at: announcement.updated_at,
  };
}

function resolveAnnouncementAudience(db, actor, payload) {
  if (actor.role === 'admin') {
    if (payload.audienceType === 'team_players') {
      const team = getTeamOrThrow(db, actor.clubId, payload.teamId);
      return {
        type: payload.audienceType,
        teamId: team.id,
        label: team.name,
      };
    }

    if (payload.audienceType === 'all_coaches') {
      return {
        type: payload.audienceType,
        teamId: '',
        label: 'All coaches',
      };
    }

    if (payload.audienceType === 'all_players') {
      return {
        type: payload.audienceType,
        teamId: '',
        label: 'All players',
      };
    }

    if (payload.audienceType === 'all_users') {
      return {
        type: payload.audienceType,
        teamId: '',
        label: 'All users',
      };
    }
  }

  if (actor.role === 'coach') {
    if (payload.audienceType !== 'team_players') {
      throw httpError(403, 'Coaches can only send announcements to their own team.');
    }

    const team = getTeamOrThrow(db, actor.clubId, payload.teamId);
    if (team.coach_user_id !== actor.id) {
      throw httpError(403, 'You can only send announcements to your own team.');
    }

    return {
      type: payload.audienceType,
      teamId: team.id,
      label: team.name,
    };
  }

  throw httpError(403, 'You do not have permission to create announcements.');
}

async function createAnnouncement(actor, payload) {
  const result = await updateDb(async (db) => {
    ensureCollections(db);
    const audience = resolveAnnouncementAudience(db, actor, payload);

    const now = new Date().toISOString();
    const announcement = {
      id: `announcement-${randomUUID()}`,
      club_id: actor.clubId,
      team_id: audience.teamId,
      audience_type: audience.type,
      audience_label: audience.label,
      title: payload.title.trim(),
      message: payload.message.trim(),
      created_by: actor.id,
      created_at: now,
      updated_at: now,
    };

    db.announcements.unshift(announcement);
    const notificationResult = appendAnnouncementNotifications(db, {
      actor,
      announcement,
      audience,
    });

    return {
      announcement: sanitizeAnnouncement(announcement, db),
      emailDispatches: notificationResult.emailDispatches,
    };
  });

  await sendAnnouncementNotificationEmails(result.emailDispatches);
  return result.announcement;
}

async function listAnnouncements(actor) {
  const db = await readDb();
  ensureCollections(db);

  return db.announcements
    .filter((entry) => canActorViewAnnouncement(db, actor, entry))
    .sort((left, right) => new Date(right.created_at) - new Date(left.created_at))
    .map((announcement) => sanitizeAnnouncement(announcement, db));
}

async function getAnnouncement(actor, announcementId) {
  const db = await readDb();
  ensureCollections(db);

  const announcement = db.announcements.find(
    (entry) => entry.id === announcementId && entry.club_id === actor.clubId
  );

  if (!announcement) {
    throw httpError(404, 'Announcement not found.');
  }

  if (!canActorViewAnnouncement(db, actor, announcement)) {
    throw httpError(404, 'Announcement not found.');
  }

  return sanitizeAnnouncement(announcement, db);
}

module.exports = {
  createAnnouncement,
  listAnnouncements,
  getAnnouncement,
};

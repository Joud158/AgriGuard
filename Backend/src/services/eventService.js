const { randomUUID } = require('crypto');
const { readDb, updateDb } = require('../data/store');
const httpError = require('../utils/httpError');
const { appendEventNotifications } = require('./notificationService');
const { sendScheduleNotificationEmails } = require('./emailService');
const { buildEventOverlapWarnings } = require('./eventOverlapService');

function ensureCollections(db) {
  if (!Array.isArray(db.events)) db.events = [];
  if (!Array.isArray(db.teams)) db.teams = [];
  if (!Array.isArray(db.players)) db.players = [];
  if (!Array.isArray(db.team_memberships)) db.team_memberships = [];
}

function sanitizeEvent(event) {
  return {
    id: event.id,
    club_id: event.club_id,
    team_id: event.team_id,
    title: event.title,
    type: event.type,
    description: event.description,
    location: event.location,
    start_time: event.start_time,
    end_time: event.end_time,
    created_by: event.created_by,
    created_at: event.created_at,
    updated_at: event.updated_at,
  };
}

function getTeamOrThrow(db, clubId, teamId) {
  const team = db.teams.find((t) => t.id === teamId && t.club_id === clubId);

  if (!team) {
    throw httpError(404, 'Team not found.');
  }

  return team;
}

function assertActorCanManageTeam(actor, team) {
  if (actor.role === 'admin') {
    return;
  }

  if (actor.role === 'coach' && team.coach_user_id === actor.id) {
    return;
  }

  throw httpError(403, 'You can only manage events for your own teams.');
}

function canActorViewEvent(db, actor, event) {
  if (event.club_id !== actor.clubId) {
    return false;
  }

  if (actor.role === 'admin') {
    return true;
  }

  if (actor.role === 'coach') {
    const team = db.teams.find(
      (entry) => entry.id === event.team_id && entry.club_id === actor.clubId
    );

    return Boolean(team && team.coach_user_id === actor.id);
  }

  if (actor.role === 'player') {
    const playerRecord = db.players.find(
      (entry) => entry.user_id === actor.id && entry.club_id === actor.clubId
    );

    if (!playerRecord) return false;

    const membership = db.team_memberships.find(
      (entry) => entry.player_id === playerRecord.id
    );

    return Boolean(membership && membership.team_id === event.team_id);
  }

  return false;
}

async function createEvent(actor, payload) {
  const result = await updateDb(async (db) => {
    ensureCollections(db);

    const team = getTeamOrThrow(db, actor.clubId, payload.teamId);
    assertActorCanManageTeam(actor, team);

    const now = new Date().toISOString();

    const event = {
      id: `event-${randomUUID()}`,
      club_id: actor.clubId,
      team_id: payload.teamId,
      title: payload.title.trim(),
      type: payload.type,
      description: payload.description || '',
      location: payload.location || '',
      start_time: payload.startTime,
      end_time: payload.endTime,
      created_by: actor.id,
      created_at: now,
      updated_at: now,
    };

    db.events.unshift(event);

    const notificationResult = appendEventNotifications(db, {
      actor,
      event,
      action: 'created',
    });

    return {
      event: sanitizeEvent(event),
      emailDispatches: notificationResult.emailDispatches,
    };
  });

  await sendScheduleNotificationEmails(result.emailDispatches);

  return result.event;
}

async function listEvents(actor) {
  const db = await readDb();
  ensureCollections(db);

  return db.events
    .filter((event) => canActorViewEvent(db, actor, event))
    .map(sanitizeEvent);
}

async function getEvent(actor, eventId) {
  const db = await readDb();
  ensureCollections(db);

  const event = db.events.find(
    (entry) => entry.id === eventId && entry.club_id === actor.clubId
  );

  if (!event || !canActorViewEvent(db, actor, event)) {
    throw httpError(404, 'Event not found.');
  }

  return sanitizeEvent(event);
}

async function updateEvent(actor, eventId, payload) {
  const result = await updateDb(async (db) => {
    ensureCollections(db);

    const event = db.events.find(
      (entry) => entry.id === eventId && entry.club_id === actor.clubId
    );

    if (!event || !canActorViewEvent(db, actor, event)) {
      throw httpError(404, 'Event not found.');
    }

    if (payload.teamId) {
      const team = getTeamOrThrow(db, actor.clubId, payload.teamId);
      assertActorCanManageTeam(actor, team);
      event.team_id = payload.teamId;
    } else if (actor.role === 'coach') {
      const currentTeam = getTeamOrThrow(db, actor.clubId, event.team_id);
      assertActorCanManageTeam(actor, currentTeam);
    }

    if (payload.title !== undefined) {
      event.title = payload.title.trim();
    }

    if (payload.type !== undefined) {
      event.type = payload.type;
    }

    if (payload.description !== undefined) {
      event.description = payload.description;
    }

    if (payload.location !== undefined) {
      event.location = payload.location;
    }

    if (payload.startTime !== undefined) {
      event.start_time = payload.startTime;
    }

    if (payload.endTime !== undefined) {
      event.end_time = payload.endTime;
    }

    event.updated_at = new Date().toISOString();

    const notificationResult = appendEventNotifications(db, {
      actor,
      event,
      action: 'updated',
    });

    return {
      event: sanitizeEvent(event),
      emailDispatches: notificationResult.emailDispatches,
    };
  });

  await sendScheduleNotificationEmails(result.emailDispatches);

  return result.event;
}

async function deleteEvent(actor, eventId) {
  const result = await updateDb(async (db) => {
    ensureCollections(db);

    const index = db.events.findIndex(
      (event) =>
        event.id === eventId &&
        event.club_id === actor.clubId &&
        canActorViewEvent(db, actor, event)
    );

    if (index === -1) {
      throw httpError(404, 'Event not found.');
    }

    const [event] = db.events.splice(index, 1);

    const notificationResult = appendEventNotifications(db, {
      actor,
      event,
      action: 'cancelled',
    });

    return {
      id: eventId,
      emailDispatches: notificationResult.emailDispatches,
    };
  });

  await sendScheduleNotificationEmails(result.emailDispatches);

  return { id: result.id };
}

async function getEventOverlaps(actor, query) {
  const db = await readDb();
  ensureCollections(db);

  if (!query.startTime || !query.endTime) {
    throw httpError(400, 'Start time and end time are required.', {
      errors: {
        startTime: !query.startTime ? 'Start time is required.' : undefined,
        endTime: !query.endTime ? 'End time is required.' : undefined,
      },
    });
  }

  const startTime = new Date(query.startTime);
  const endTime = new Date(query.endTime);

  if (Number.isNaN(startTime.getTime())) {
    throw httpError(400, 'Start time must be a valid ISO datetime.', {
      errors: {
        startTime: 'Start time must be a valid ISO datetime.',
      },
    });
  }

  if (Number.isNaN(endTime.getTime())) {
    throw httpError(400, 'End time must be a valid ISO datetime.', {
      errors: {
        endTime: 'End time must be a valid ISO datetime.',
      },
    });
  }

  if (endTime <= startTime) {
    throw httpError(400, 'End time must be after start time.', {
      errors: {
        endTime: 'End time must be after start time.',
      },
    });
  }

  return {
    conflicts: buildEventOverlapWarnings(db, {
      clubId: actor.clubId,
      startTime: query.startTime,
      endTime: query.endTime,
      excludeEventId: query.excludeEventId || '',
      requestedTeamId: query.teamId || '',
    }),
  };
}

module.exports = {
  createEvent,
  listEvents,
  getEvent,
  getEventOverlaps,
  updateEvent,
  deleteEvent,
};
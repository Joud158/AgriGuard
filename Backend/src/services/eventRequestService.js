const { randomUUID } = require('crypto');

const { readDb, updateDb } = require('../data/store');
const httpError = require('../utils/httpError');

const {
  buildEventOverlapWarnings,
  sanitizeEventSummary,
  sanitizeTeamSummary,
} = require('./eventOverlapService');

const {
  appendEventNotifications,
  appendEventRequestNotifications,
} = require('./notificationService');

const { sendScheduleNotificationEmails } = require('./emailService');

const REQUEST_STATUS = {
  pendingAdminReview: 'pending_admin_review',
  pendingCoachReview: 'pending_coach_review',
  approved: 'approved',
  rejected: 'rejected',
};

function ensureCollections(db) {
  if (!Array.isArray(db.users)) db.users = [];
  if (!Array.isArray(db.teams)) db.teams = [];
  if (!Array.isArray(db.players)) db.players = [];
  if (!Array.isArray(db.team_memberships)) db.team_memberships = [];
  if (!Array.isArray(db.events)) db.events = [];
  if (!Array.isArray(db.notifications)) db.notifications = [];
  if (!Array.isArray(db.event_requests)) db.event_requests = [];
  if (!Array.isArray(db.event_request_revisions)) db.event_request_revisions = [];
}

function sanitizeUserSummary(user) {
  if (!user) return null;

  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    role: user.role,
    is_active: user.is_active,
  };
}

function findUserInClub(db, clubId, userId) {
  return db.users.find((entry) => entry.id === userId && entry.club_id === clubId) || null;
}

function findTeamInClub(db, clubId, teamId) {
  return db.teams.find((entry) => entry.id === teamId && entry.club_id === clubId) || null;
}

function getTeamOrThrow(db, clubId, teamId) {
  const team = findTeamInClub(db, clubId, teamId);

  if (!team) {
    throw httpError(404, 'Field not found.');
  }

  return team;
}

function findPlayerRecordByUserId(db, clubId, userId) {
  return db.players.find((entry) => entry.club_id === clubId && entry.user_id === userId) || null;
}

function isFarmerAssignedToTeam(db, clubId, userId, teamId) {
  const player = findPlayerRecordByUserId(db, clubId, userId);

  if (!player) return false;

  return db.team_memberships.some(
    (entry) => entry.player_id === player.id && entry.team_id === teamId
  );
}

function sanitizeEventRequest(request) {
  return {
    id: request.id,
    club_id: request.club_id,
    coach_user_id: request.coach_user_id,
    requested_by_user_id: request.requested_by_user_id || '',
    team_id: request.team_id,
    request_kind: request.request_kind || 'create',
    source_event_id: request.source_event_id || '',
    current_title: request.current_title,
    current_event_type: request.current_event_type,
    current_start_time: request.current_start_time,
    current_end_time: request.current_end_time,
    current_location: request.current_location || '',
    current_notes: request.current_notes || '',
    status: request.status,
    rejection_reason: request.rejection_reason || '',
    finalized_event_id: request.finalized_event_id || '',
    final_reviewed_by_admin_id: request.final_reviewed_by_admin_id || null,
    final_reviewed_at: request.final_reviewed_at || null,
    created_at: request.created_at,
    updated_at: request.updated_at,
  };
}

function getRequestRevisions(db, requestId) {
  return db.event_request_revisions
    .filter((entry) => entry.event_request_id === requestId)
    .sort((left, right) => left.revision_number - right.revision_number);
}

function getNextRevisionNumber(db, requestId) {
  return getRequestRevisions(db, requestId).length + 1;
}

function sanitizeRevision(revision, user) {
  return {
    id: revision.id,
    event_request_id: revision.event_request_id,
    proposed_by_role: revision.proposed_by_role,
    proposed_by_user_id: revision.proposed_by_user_id,
    revision_number: revision.revision_number,
    title: revision.title,
    event_type: revision.event_type,
    start_time: revision.start_time,
    end_time: revision.end_time,
    location: revision.location || '',
    notes: revision.notes || '',
    comment: revision.comment || '',
    created_at: revision.created_at,
    proposed_by_user: sanitizeUserSummary(user),
  };
}

function appendRevision(db, request, role, actorId, payload, comment = '') {
  const revision = {
    id: `event-request-revision-${randomUUID()}`,
    event_request_id: request.id,
    proposed_by_role: role,
    proposed_by_user_id: actorId,
    title: payload.title.trim(),
    event_type: payload.type,
    start_time: payload.startTime,
    end_time: payload.endTime,
    location: payload.location || '',
    notes: payload.notes || '',
    revision_number: getNextRevisionNumber(db, request.id),
    comment: comment || '',
    created_at: new Date().toISOString(),
  };

  db.event_request_revisions.unshift(revision);

  return revision;
}

function getOverlapWarnings(db, request) {
  return buildEventOverlapWarnings(db, {
    clubId: request.club_id,
    startTime: request.current_start_time,
    endTime: request.current_end_time,
    excludeEventId: request.source_event_id || '',
    requestedTeamId: request.team_id,
  });
}

function serializeRequestSummary(db, actor, request) {
  const team = findTeamInClub(db, request.club_id, request.team_id);
  const agronomist = findUserInClub(db, request.club_id, request.coach_user_id);
  const farmer = findUserInClub(db, request.club_id, request.requested_by_user_id || '');

  const finalizedEvent = request.finalized_event_id
    ? db.events.find(
        (entry) => entry.id === request.finalized_event_id && entry.club_id === request.club_id
      )
    : null;

  const sourceEvent = request.source_event_id
    ? db.events.find(
        (entry) => entry.id === request.source_event_id && entry.club_id === request.club_id
      )
    : null;

  const revisions = getRequestRevisions(db, request.id);
  const latestRevision = revisions[revisions.length - 1] || null;

  return {
    ...sanitizeEventRequest(request),
    coach: sanitizeUserSummary(agronomist),
    agronomist: sanitizeUserSummary(agronomist),
    farmer: sanitizeUserSummary(farmer),
    team: sanitizeTeamSummary(team),
    source_event: sanitizeEventSummary(sourceEvent),
    finalized_event: sanitizeEventSummary(finalizedEvent),
    latest_comment: latestRevision?.comment || '',
    latest_revision_role: latestRevision?.proposed_by_role || '',
    revision_count: revisions.length,
    overlap_warning_count: getOverlapWarnings(db, request).length,
    can_agronomist_review:
      actor.role === 'coach' &&
      request.coach_user_id === actor.id &&
      request.status === REQUEST_STATUS.pendingCoachReview,
    can_admin_review:
      actor.role === 'admin' && request.status === REQUEST_STATUS.pendingAdminReview,
  };
}

function serializeRequestDetail(db, actor, request) {
  return {
    ...serializeRequestSummary(db, actor, request),
    overlap_warnings: getOverlapWarnings(db, request),
    revisions: getRequestRevisions(db, request.id).map((revision) =>
      sanitizeRevision(revision, findUserInClub(db, request.club_id, revision.proposed_by_user_id))
    ),
  };
}

function getRequestOrThrow(db, actor, requestId) {
  const request = db.event_requests.find(
    (entry) => entry.id === requestId && entry.club_id === actor.clubId
  );

  if (!request) {
    throw httpError(404, 'Visit request not found.');
  }

  if (actor.role === 'admin') return request;

  if (actor.role === 'coach' && request.coach_user_id === actor.id) {
    return request;
  }

  if (actor.role === 'player' && request.requested_by_user_id === actor.id) {
    return request;
  }

  throw httpError(404, 'Visit request not found.');
}

async function createEventRequest(actor, payload) {
  if (actor.role !== 'player') {
    throw httpError(403, 'Only farmers can request an agronomist visit.');
  }

  return updateDb(async (db) => {
    ensureCollections(db);

    const team = getTeamOrThrow(db, actor.clubId, payload.teamId);

    if (!isFarmerAssignedToTeam(db, actor.clubId, actor.id, team.id)) {
      throw httpError(403, 'You can only request visits for your assigned field.');
    }

    const now = new Date().toISOString();

    const request = {
      id: `event-request-${randomUUID()}`,
      club_id: actor.clubId,

      // Important:
      // Farmer-created requests should always go to admin first.
      // Do not auto-pick an agronomist here.
      coach_user_id: '',

      requested_by_user_id: actor.id,
      team_id: team.id,
      request_kind: 'create',
      source_event_id: '',
      current_title: payload.title.trim(),
      current_event_type: payload.type,
      current_start_time: payload.startTime,
      current_end_time: payload.endTime,
      current_location: payload.location || '',
      current_notes: payload.notes || '',
      status: REQUEST_STATUS.pendingAdminReview,
      rejection_reason: '',
      finalized_event_id: '',
      final_reviewed_by_admin_id: null,
      final_reviewed_at: null,
      created_at: now,
      updated_at: now,
    };

    db.event_requests.unshift(request);

    appendRevision(
      db,
      request,
      'player',
      actor.id,
      payload,
      payload.comment ||
        'Farmer requested agronomist support. Admin review and agronomist assignment are required.'
    );

    appendEventRequestNotifications(db, {
      actor,
      request,
      action: 'submitted',
    });

    return serializeRequestDetail(db, actor, request);
  });
}

async function listEventRequests(actor) {
  const db = await readDb();

  ensureCollections(db);

  return db.event_requests
    .filter((entry) => entry.club_id === actor.clubId)
    .filter((entry) => {
      if (actor.role === 'admin') return true;
      if (actor.role === 'coach') return entry.coach_user_id === actor.id;
      if (actor.role === 'player') return entry.requested_by_user_id === actor.id;
      return false;
    })
    .sort((left, right) => new Date(right.updated_at) - new Date(left.updated_at))
    .map((request) => serializeRequestSummary(db, actor, request));
}

async function getEventRequest(actor, requestId) {
  const db = await readDb();

  ensureCollections(db);

  const request = getRequestOrThrow(db, actor, requestId);

  return serializeRequestDetail(db, actor, request);
}

function assertCanReview(actor, request) {
  if (
    actor.role === 'coach' &&
    request.coach_user_id === actor.id &&
    request.status === REQUEST_STATUS.pendingCoachReview
  ) {
    return;
  }

  if (actor.role === 'admin' && request.status === REQUEST_STATUS.pendingAdminReview) {
    return;
  }

  throw httpError(409, 'This request is not waiting for your review.');
}

function finalizeOfficialEventInDb(db, actor, request) {
  const now = new Date().toISOString();

  const event = {
    id: `event-${randomUUID()}`,
    club_id: request.club_id,
    team_id: request.team_id,
    title: request.current_title,
    type: request.current_event_type,
    description: request.current_notes || '',
    location: request.current_location || '',
    start_time: request.current_start_time,
    end_time: request.current_end_time,
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

  request.status = REQUEST_STATUS.approved;
  request.finalized_event_id = event.id;
  request.final_reviewed_by_admin_id =
    actor.role === 'admin' ? actor.id : request.final_reviewed_by_admin_id;
  request.final_reviewed_at = now;
  request.updated_at = now;
  request.rejection_reason = '';

  return {
    event,
    emailDispatches: notificationResult.emailDispatches,
  };
}

async function assignAgronomistToRequest(actor, requestId, payload) {
  if (actor.role !== 'admin') {
    throw httpError(403, 'Only admins can assign an agronomist to this request.');
  }

  return updateDb(async (db) => {
    ensureCollections(db);

    const request = getRequestOrThrow(db, actor, requestId);

    if (request.status !== REQUEST_STATUS.pendingAdminReview) {
      throw httpError(409, 'This request is not waiting for admin assignment.');
    }

    const agronomistId = payload.coachUserId || payload.agronomistUserId || '';
    const agronomist = findUserInClub(db, actor.clubId, agronomistId);

    if (!agronomist || agronomist.role !== 'coach' || !agronomist.is_active) {
      throw httpError(400, 'Select an active agronomist.');
    }

    const team = getTeamOrThrow(db, actor.clubId, request.team_id);
    const now = new Date().toISOString();

    // Admin assignment is the only place where the field/request gets an agronomist.
    team.coach_user_id = agronomist.id;
    team.updated_at = now;

    request.coach_user_id = agronomist.id;
    request.status = REQUEST_STATUS.pendingCoachReview;
    request.updated_at = now;
    request.rejection_reason = '';

    appendRevision(
      db,
      request,
      'admin',
      actor.id,
      {
        title: request.current_title,
        type: request.current_event_type,
        startTime: request.current_start_time,
        endTime: request.current_end_time,
        location: request.current_location || '',
        notes: request.current_notes || '',
      },
      `Admin assigned ${agronomist.full_name} as the agronomist for this request.`
    );

    appendEventRequestNotifications(db, {
      actor,
      request,
      action: 'assigned',
    });

    return serializeRequestDetail(db, actor, request);
  });
}

async function approveEventRequest(actor, requestId) {
  const result = await updateDb(async (db) => {
    ensureCollections(db);

    const request = getRequestOrThrow(db, actor, requestId);

    assertCanReview(actor, request);

    const created = finalizeOfficialEventInDb(db, actor, request);

    return {
      request: serializeRequestDetail(db, actor, request),
      emailDispatches: created.emailDispatches,
    };
  });

  await sendScheduleNotificationEmails(result.emailDispatches);

  return result.request;
}

async function rejectEventRequest(actor, requestId, payload) {
  return updateDb(async (db) => {
    ensureCollections(db);

    const request = getRequestOrThrow(db, actor, requestId);

    assertCanReview(actor, request);

    const now = new Date().toISOString();

    if (
      actor.role === 'coach' &&
      request.status === REQUEST_STATUS.pendingCoachReview
    ) {
      request.status = REQUEST_STATUS.pendingAdminReview;
      request.rejection_reason = payload.reason || 'Agronomist requested reassignment.';
      request.coach_user_id = '';
      request.updated_at = now;

      const team = findTeamInClub(db, actor.clubId, request.team_id);

      if (team && team.coach_user_id === actor.id) {
        team.coach_user_id = '';
        team.updated_at = now;
      }

      appendRevision(
        db,
        request,
        'coach',
        actor.id,
        {
          title: request.current_title,
          type: request.current_event_type,
          startTime: request.current_start_time,
          endTime: request.current_end_time,
          location: request.current_location || '',
          notes: request.current_notes || '',
        },
        request.rejection_reason
      );

      appendEventRequestNotifications(db, {
        actor,
        request,
        action: 'coach_declined',
      });

      return serializeRequestDetail(db, actor, request);
    }

    request.status = REQUEST_STATUS.rejected;
    request.rejection_reason = payload.reason || '';
    request.final_reviewed_by_admin_id = actor.id;
    request.final_reviewed_at = now;
    request.updated_at = now;

    appendEventRequestNotifications(db, {
      actor,
      request,
      action: 'rejected',
    });

    return serializeRequestDetail(db, actor, request);
  });
}

async function suggestEventRequestModification() {
  throw httpError(
    403,
    'Admin modification workflow is disabled in AgriGuard. Farmers request visits and agronomists accept or reject them.'
  );
}

async function acceptSuggestedEventRequest() {
  throw httpError(403, 'Suggestion workflow is disabled in AgriGuard. Use approve or reject.');
}

async function reviseEventRequest() {
  throw httpError(
    403,
    'Revision workflow is disabled in AgriGuard. Submit a new visit request instead.'
  );
}

module.exports = {
  createEventRequest,
  assignAgronomistToRequest,
  listEventRequests,
  getEventRequest,
  approveEventRequest,
  rejectEventRequest,
  suggestEventRequestModification,
  acceptSuggestedEventRequest,
  reviseEventRequest,
};
const { randomUUID } = require('crypto');

function ensureAuditCollections(db) {
  if (!Array.isArray(db.audit_logs)) db.audit_logs = [];
  if (!Array.isArray(db.role_change_history)) db.role_change_history = [];
  if (!Array.isArray(db.team_assignment_history)) db.team_assignment_history = [];
  if (!Array.isArray(db.users)) db.users = [];
  if (!Array.isArray(db.teams)) db.teams = [];
  if (!Array.isArray(db.players)) db.players = [];
  if (!Array.isArray(db.team_memberships)) db.team_memberships = [];
  if (!Array.isArray(db.events)) db.events = [];
  if (!Array.isArray(db.announcements)) db.announcements = [];
  if (!Array.isArray(db.event_requests)) db.event_requests = [];
  if (!Array.isArray(db.event_request_revisions)) db.event_request_revisions = [];
  if (!Array.isArray(db.player_add_requests)) db.player_add_requests = [];
}

function normalizeNullable(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  return value;
}

function buildUserSummary(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    role: user.role,
    is_active: Boolean(user.is_active),
    assigned_team: user.assigned_team || '',
    created_at: user.created_at,
    updated_at: user.updated_at,
    last_login_at: user.last_login_at || null,
  };
}

function buildTeamSummary(team) {
  if (!team) {
    return null;
  }

  return {
    id: team.id,
    name: team.name,
    coach_user_id: team.coach_user_id || null,
    created_at: team.created_at,
    updated_at: team.updated_at,
  };
}

function findUserInClub(db, clubId, userId) {
  return db.users.find((entry) => entry.id === userId && entry.club_id === clubId) || null;
}

function findTeamInClub(db, clubId, teamId) {
  return db.teams.find((entry) => entry.id === teamId && entry.club_id === clubId) || null;
}

function findPlayerByUserId(db, clubId, userId) {
  return db.players.find((entry) => entry.club_id === clubId && entry.user_id === userId) || null;
}

function findMembershipByPlayerId(db, clubId, playerId) {
  const clubTeamIds = new Set(
    db.teams.filter((entry) => entry.club_id === clubId).map((entry) => entry.id)
  );

  return db.team_memberships.find(
    (entry) => entry.player_id === playerId && clubTeamIds.has(entry.team_id)
  ) || null;
}

function canActorViewEvent(db, actor, event) {
  if (!actor || event.club_id !== actor.clubId) {
    return false;
  }

  if (actor.role === 'admin') {
    return true;
  }

  if (actor.role === 'coach') {
    const team = findTeamInClub(db, actor.clubId, event.team_id);
    return Boolean(team && team.coach_user_id === actor.id);
  }

  if (actor.role === 'player') {
    const playerRecord = findPlayerByUserId(db, actor.clubId, actor.id);
    if (!playerRecord) {
      return false;
    }
    const membership = findMembershipByPlayerId(db, actor.clubId, playerRecord.id);
    return Boolean(membership && membership.team_id === event.team_id);
  }

  return false;
}

function canActorViewAnnouncement(db, actor, announcement) {
  if (!actor || announcement.club_id !== actor.clubId) {
    return false;
  }

  if (actor.role === 'admin') {
    return true;
  }

  if (announcement.created_by === actor.id) {
    return true;
  }

  const audienceType = announcement.audience_type || (announcement.team_id ? 'team_players' : '');

  if (actor.role === 'coach') {
    if (audienceType === 'all_coaches' || audienceType === 'all_users') {
      return true;
    }

    if (audienceType === 'team_players' && announcement.team_id) {
      const team = findTeamInClub(db, actor.clubId, announcement.team_id);
      return Boolean(team && team.coach_user_id === actor.id);
    }

    return false;
  }

  if (actor.role === 'player') {
    if (audienceType === 'all_players' || audienceType === 'all_users') {
      return true;
    }

    if (audienceType === 'team_players' && announcement.team_id) {
      const playerRecord = findPlayerByUserId(db, actor.clubId, actor.id);
      if (!playerRecord) {
        return false;
      }
      const membership = findMembershipByPlayerId(db, actor.clubId, playerRecord.id);
      return Boolean(membership && membership.team_id === announcement.team_id);
    }
  }

  return false;
}

function serializeEvent(db, event) {
  const team = findTeamInClub(db, event.club_id, event.team_id);
  const createdByUser = findUserInClub(db, event.club_id, event.created_by);

  return {
    id: event.id,
    title: event.title,
    type: event.type,
    description: event.description || '',
    location: event.location || '',
    team_id: event.team_id,
    team: buildTeamSummary(team),
    created_by: event.created_by,
    created_by_user: buildUserSummary(createdByUser),
    start_time: event.start_time,
    end_time: event.end_time,
    created_at: event.created_at,
    updated_at: event.updated_at,
  };
}

function serializeAnnouncement(db, announcement) {
  const team = announcement.team_id ? findTeamInClub(db, announcement.club_id, announcement.team_id) : null;
  const sender = findUserInClub(db, announcement.club_id, announcement.created_by);

  return {
    id: announcement.id,
    title: announcement.title,
    message: announcement.message,
    audience_type: announcement.audience_type || (announcement.team_id ? 'team_players' : ''),
    audience_label: announcement.audience_label || team?.name || 'Announcement',
    team_id: announcement.team_id || null,
    team: buildTeamSummary(team),
    sender: buildUserSummary(sender),
    created_at: announcement.created_at,
    updated_at: announcement.updated_at,
  };
}

function serializeEventRequest(db, request) {
  const coach = findUserInClub(db, request.club_id, request.coach_user_id);
  const team = findTeamInClub(db, request.club_id, request.team_id);
  const reviewedBy = request.final_reviewed_by_admin_id
    ? findUserInClub(db, request.club_id, request.final_reviewed_by_admin_id)
    : null;

  return {
    id: request.id,
    request_kind: request.request_kind || 'create',
    source_event_id: request.source_event_id || null,
    current_title: request.current_title,
    current_event_type: request.current_event_type,
    current_start_time: request.current_start_time,
    current_end_time: request.current_end_time,
    current_location: request.current_location || '',
    current_notes: request.current_notes || '',
    status: request.status,
    rejection_reason: request.rejection_reason || '',
    finalized_event_id: request.finalized_event_id || null,
    coach: buildUserSummary(coach),
    team: buildTeamSummary(team),
    reviewed_by: buildUserSummary(reviewedBy),
    final_reviewed_at: request.final_reviewed_at || null,
    created_at: request.created_at,
    updated_at: request.updated_at,
  };
}

function serializePlayerAddRequestEntry(db, request) {
  const coach = findUserInClub(db, request.club_id || null, request.coach_user_id)
    || db.users.find((entry) => entry.id === request.coach_user_id)
    || null;
  const player = db.players.find((entry) => entry.id === request.player_id) || null;
  const playerUser = player ? db.users.find((entry) => entry.id === player.user_id) || null : null;
  const team = db.teams.find((entry) => entry.id === request.team_id) || null;
  const reviewedBy = request.reviewed_by_user_id
    ? db.users.find((entry) => entry.id === request.reviewed_by_user_id) || null
    : null;

  return {
    id: request.id,
    request_type: request.request_type || 'add',
    status: request.status,
    created_at: request.created_at,
    reviewed_at: request.reviewed_at || null,
    coach: buildUserSummary(coach),
    player: player
      ? {
          id: player.id,
          jersey_number: player.jersey_number,
          preferred_position: player.preferred_position || '',
          user: buildUserSummary(playerUser),
        }
      : null,
    team: buildTeamSummary(team),
    reviewed_by: buildUserSummary(reviewedBy),
  };
}

function serializeRoleChange(db, entry) {
  return {
    id: entry.id,
    user_id: entry.user_id,
    user: findUserInClub(db, entry.club_id, entry.user_id)
      ? buildUserSummary(findUserInClub(db, entry.club_id, entry.user_id))
      : null,
    old_role: entry.old_role || null,
    new_role: entry.new_role || null,
    changed_by_user_id: entry.changed_by_user_id || null,
    changed_by: entry.changed_by_user_id
      ? buildUserSummary(findUserInClub(db, entry.club_id, entry.changed_by_user_id))
      : null,
    reason: entry.reason || '',
    changed_at: entry.changed_at,
  };
}

function serializeTeamAssignmentChange(db, entry) {
  return {
    id: entry.id,
    user_id: entry.user_id,
    user: findUserInClub(db, entry.club_id, entry.user_id)
      ? buildUserSummary(findUserInClub(db, entry.club_id, entry.user_id))
      : null,
    old_team_id: entry.old_team_id || null,
    old_team_name: entry.old_team_name || '',
    new_team_id: entry.new_team_id || null,
    new_team_name: entry.new_team_name || '',
    change_type: entry.change_type || 'updated',
    changed_by_user_id: entry.changed_by_user_id || null,
    changed_by: entry.changed_by_user_id
      ? buildUserSummary(findUserInClub(db, entry.club_id, entry.changed_by_user_id))
      : null,
    changed_at: entry.changed_at,
  };
}

function serializeAuditLog(db, entry) {
  let metadata = {};
  try {
    metadata = entry.metadata_json ? JSON.parse(entry.metadata_json) : {};
  } catch {
    metadata = {};
  }

  return {
    id: entry.id,
    action_type: entry.action_type,
    entity_type: entry.entity_type,
    entity_id: entry.entity_id || null,
    summary: entry.summary,
    actor_user_id: entry.actor_user_id || null,
    actor: entry.actor_user_id ? buildUserSummary(findUserInClub(db, entry.club_id, entry.actor_user_id)) : null,
    target_user_id: entry.target_user_id || null,
    target_user: entry.target_user_id ? buildUserSummary(findUserInClub(db, entry.club_id, entry.target_user_id)) : null,
    metadata,
    created_at: entry.created_at,
  };
}

function logAuditEvent(db, payload) {
  ensureAuditCollections(db);

  db.audit_logs.unshift({
    id: `audit-${randomUUID()}`,
    club_id: payload.clubId,
    actor_user_id: normalizeNullable(payload.actorUserId),
    target_user_id: normalizeNullable(payload.targetUserId),
    entity_type: payload.entityType,
    entity_id: normalizeNullable(payload.entityId),
    action_type: payload.actionType,
    summary: payload.summary,
    metadata_json: JSON.stringify(payload.metadata || {}),
    created_at: payload.createdAt || new Date().toISOString(),
  });
}

function logRoleChange(db, payload) {
  ensureAuditCollections(db);

  if ((payload.oldRole || null) === (payload.newRole || null)) {
    return;
  }

  db.role_change_history.unshift({
    id: `role-history-${randomUUID()}`,
    club_id: payload.clubId,
    user_id: payload.userId,
    old_role: normalizeNullable(payload.oldRole),
    new_role: normalizeNullable(payload.newRole),
    changed_by_user_id: normalizeNullable(payload.changedByUserId),
    reason: payload.reason || '',
    changed_at: payload.changedAt || new Date().toISOString(),
  });
}

function logTeamAssignmentChange(db, payload) {
  ensureAuditCollections(db);

  const oldName = payload.oldTeamName || '';
  const newName = payload.newTeamName || '';

  if ((payload.oldTeamId || null) === (payload.newTeamId || null) && oldName === newName) {
    return;
  }

  db.team_assignment_history.unshift({
    id: `team-history-${randomUUID()}`,
    club_id: payload.clubId,
    user_id: payload.userId,
    old_team_id: normalizeNullable(payload.oldTeamId),
    old_team_name: oldName,
    new_team_id: normalizeNullable(payload.newTeamId),
    new_team_name: newName,
    change_type: payload.changeType || 'updated',
    changed_by_user_id: normalizeNullable(payload.changedByUserId),
    changed_at: payload.changedAt || new Date().toISOString(),
  });
}

function buildAdminAuditView(db, actor) {
  ensureAuditCollections(db);
  const now = Date.now();

  const users = db.users
    .filter((entry) => entry.club_id === actor.clubId)
    .sort((left, right) => left.full_name.localeCompare(right.full_name))
    .map(buildUserSummary);

  const inactiveUsers = users.filter((entry) => !entry.is_active);
  const activeUsers = users.filter((entry) => entry.is_active);

  const eventHistory = db.events
    .filter((entry) => entry.club_id === actor.clubId)
    .sort((left, right) => new Date(right.start_time) - new Date(left.start_time))
    .map((entry) => serializeEvent(db, entry));

  const pastEvents = eventHistory.filter((entry) => new Date(entry.end_time).getTime() < now);

  const announcementHistory = db.announcements
    .filter((entry) => entry.club_id === actor.clubId)
    .sort((left, right) => new Date(right.created_at) - new Date(left.created_at))
    .map((entry) => serializeAnnouncement(db, entry));

  const eventRequestHistory = db.event_requests
    .filter((entry) => entry.club_id === actor.clubId)
    .sort((left, right) => new Date(right.created_at) - new Date(left.created_at))
    .map((entry) => serializeEventRequest(db, entry));

  const playerAddRequestHistory = db.player_add_requests
    .sort((left, right) => new Date(right.created_at) - new Date(left.created_at))
    .map((entry) => serializePlayerAddRequestEntry(db, entry))
    .filter((entry) => entry.team && db.teams.some((team) => team.id === entry.team.id && team.club_id === actor.clubId));

  const roleHistory = db.role_change_history
    .filter((entry) => entry.club_id === actor.clubId)
    .sort((left, right) => new Date(right.changed_at) - new Date(left.changed_at))
    .map((entry) => serializeRoleChange(db, entry));

  const teamAssignmentHistory = db.team_assignment_history
    .filter((entry) => entry.club_id === actor.clubId)
    .sort((left, right) => new Date(right.changed_at) - new Date(left.changed_at))
    .map((entry) => serializeTeamAssignmentChange(db, entry));

  const auditLog = db.audit_logs
    .filter((entry) => entry.club_id === actor.clubId)
    .sort((left, right) => new Date(right.created_at) - new Date(left.created_at))
    .map((entry) => serializeAuditLog(db, entry));

  return {
    overview: {
      total_users: users.length,
      active_users: activeUsers.length,
      inactive_users: inactiveUsers.length,
      admins: users.filter((entry) => entry.role === 'admin').length,
      coaches: users.filter((entry) => entry.role === 'coach').length,
      players: users.filter((entry) => entry.role === 'player').length,
      event_records: eventHistory.length,
      past_events: pastEvents.length,
      past_matches: pastEvents.filter((entry) => entry.type === 'match').length,
      past_trainings: pastEvents.filter((entry) => entry.type === 'training').length,
      announcements: announcementHistory.length,
      role_changes: roleHistory.length,
      team_changes: teamAssignmentHistory.length,
      audit_events: auditLog.length,
    },
    users,
    inactive_users: inactiveUsers,
    role_history: roleHistory,
    team_assignment_history: teamAssignmentHistory,
    event_history: eventHistory,
    training_history: eventHistory.filter((entry) => entry.type === 'training'),
    match_history: eventHistory.filter((entry) => entry.type === 'match'),
    announcement_history: announcementHistory,
    event_request_history: eventRequestHistory,
    player_add_request_history: playerAddRequestHistory,
    audit_log: auditLog,
  };
}

function buildMyHistoryView(db, actor) {
  ensureAuditCollections(db);
  const now = Date.now();
  const currentUser = findUserInClub(db, actor.clubId, actor.id);
  const currentPlayer = actor.role === 'player' ? findPlayerByUserId(db, actor.clubId, actor.id) : null;

  const pastEvents = db.events
    .filter((entry) => new Date(entry.end_time).getTime() < now)
    .filter((entry) => canActorViewEvent(db, actor, entry))
    .sort((left, right) => new Date(right.start_time) - new Date(left.start_time))
    .map((entry) => serializeEvent(db, entry));

  const announcements = db.announcements
    .filter((entry) => canActorViewAnnouncement(db, actor, entry))
    .sort((left, right) => new Date(right.created_at) - new Date(left.created_at))
    .map((entry) => serializeAnnouncement(db, entry));

  const roleHistory = db.role_change_history
    .filter((entry) => entry.club_id === actor.clubId && entry.user_id === actor.id)
    .sort((left, right) => new Date(right.changed_at) - new Date(left.changed_at))
    .map((entry) => serializeRoleChange(db, entry));

  const teamAssignmentHistory = db.team_assignment_history
    .filter((entry) => entry.club_id === actor.clubId && entry.user_id === actor.id)
    .sort((left, right) => new Date(right.changed_at) - new Date(left.changed_at))
    .map((entry) => serializeTeamAssignmentChange(db, entry));

  const eventRequests = actor.role === 'coach'
    ? db.event_requests
        .filter((entry) => entry.club_id === actor.clubId && entry.coach_user_id === actor.id)
        .sort((left, right) => new Date(right.created_at) - new Date(left.created_at))
        .map((entry) => serializeEventRequest(db, entry))
    : [];

  const playerAddRequests = actor.role === 'coach'
    ? db.player_add_requests
        .filter((entry) => entry.coach_user_id === actor.id)
        .sort((left, right) => new Date(right.created_at) - new Date(left.created_at))
        .map((entry) => serializePlayerAddRequestEntry(db, entry))
    : currentPlayer
      ? db.player_add_requests
          .filter((entry) => entry.player_id === currentPlayer.id)
          .sort((left, right) => new Date(right.created_at) - new Date(left.created_at))
          .map((entry) => serializePlayerAddRequestEntry(db, entry))
      : [];

  const auditLog = db.audit_logs
    .filter(
      (entry) =>
        entry.club_id === actor.clubId &&
        (entry.actor_user_id === actor.id || entry.target_user_id === actor.id)
    )
    .sort((left, right) => new Date(right.created_at) - new Date(left.created_at))
    .map((entry) => serializeAuditLog(db, entry));

  return {
    user: buildUserSummary(currentUser),
    role_history: roleHistory,
    team_assignment_history: teamAssignmentHistory,
    training_history: pastEvents.filter((entry) => entry.type === 'training'),
    match_history: pastEvents.filter((entry) => entry.type === 'match'),
    announcement_history: announcements,
    event_request_history: eventRequests,
    player_add_request_history: playerAddRequests,
    audit_log: auditLog,
  };
}

module.exports = {
  ensureAuditCollections,
  buildAdminAuditView,
  buildMyHistoryView,
  logAuditEvent,
  logRoleChange,
  logTeamAssignmentChange,
};

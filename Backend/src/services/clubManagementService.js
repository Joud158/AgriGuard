const { randomUUID } = require('crypto');
const { readDb, updateDb } = require('../data/store');
const httpError = require('../utils/httpError');
const { createNotificationRecord } = require('./notificationService');
const {
  ensureAuditCollections,
  logAuditEvent,
  logTeamAssignmentChange,
} = require('./auditService');

function ensureCollections(db) {
  if (!Array.isArray(db.teams)) db.teams = [];
  if (!Array.isArray(db.players)) db.players = [];
  if (!Array.isArray(db.team_memberships)) db.team_memberships = [];
  if (!Array.isArray(db.player_attributes)) db.player_attributes = [];
  if (!Array.isArray(db.users)) db.users = [];
  if (!Array.isArray(db.invitations)) db.invitations = [];
  if (!Array.isArray(db.announcements)) db.announcements = [];
  if (!Array.isArray(db.notifications)) db.notifications = [];
  if (!Array.isArray(db.lineups)) db.lineups = [];
  if (!Array.isArray(db.position_assignments)) db.position_assignments = [];
  if (!Array.isArray(db.events)) db.events = [];
  if (!Array.isArray(db.event_requests)) db.event_requests = [];
  if (!Array.isArray(db.event_request_revisions)) db.event_request_revisions = [];
  if (!Array.isArray(db.player_add_requests)) db.player_add_requests = [];
  ensureAuditCollections(db);
}

function normalizeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeFieldBbox(value) {
  if (!Array.isArray(value) || value.length !== 4) {
    return null;
  }

  const bbox = value.map(normalizeNumber);
  if (!bbox.every(Number.isFinite)) {
    return null;
  }

  const [minLon, minLat, maxLon, maxLat] = bbox;
  if (minLon >= maxLon || minLat >= maxLat) {
    return null;
  }

  if (minLon < -180 || maxLon > 180 || minLat < -90 || maxLat > 90) {
    return null;
  }

  return bbox;
}

function normalizeFieldGeometry(value) {
  if (!value || value.type !== 'Polygon' || !Array.isArray(value.coordinates)) {
    return null;
  }

  const ring = Array.isArray(value.coordinates[0]) ? value.coordinates[0] : [];
  const normalizedRing = ring
    .map((point) => {
      if (!Array.isArray(point) || point.length < 2) return null;
      const lon = normalizeNumber(point[0]);
      const lat = normalizeNumber(point[1]);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
      if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return null;
      return [lon, lat];
    })
    .filter(Boolean);

  if (normalizedRing.length < 4) {
    return null;
  }

  const first = normalizedRing[0];
  const last = normalizedRing[normalizedRing.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    normalizedRing.push([...first]);
  }

  return {
    type: 'Polygon',
    coordinates: [normalizedRing],
  };
}

function bboxFromGeometry(geometry) {
  const ring = geometry?.coordinates?.[0];
  if (!Array.isArray(ring) || ring.length < 4) return null;

  const longitudes = ring.map((point) => normalizeNumber(point?.[0])).filter(Number.isFinite);
  const latitudes = ring.map((point) => normalizeNumber(point?.[1])).filter(Number.isFinite);

  if (!longitudes.length || !latitudes.length) return null;

  return normalizeFieldBbox([
    Math.min(...longitudes),
    Math.min(...latitudes),
    Math.max(...longitudes),
    Math.max(...latitudes),
  ]);
}

function centroidFromBbox(bbox) {
  if (!bbox) return null;
  const [minLon, minLat, maxLon, maxLat] = bbox;
  return {
    lon: Math.round(((minLon + maxLon) / 2) * 1000000) / 1000000,
    lat: Math.round(((minLat + maxLat) / 2) * 1000000) / 1000000,
  };
}

function pickFirstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function buildFieldBoundary(payload = {}) {
  const rawBbox = pickFirstDefined(
    payload.fieldBbox,
    payload.field_bbox,
    payload.bbox,
    payload.satelliteBbox,
    payload.satellite_bbox,
    payload.boundaryBbox,
    payload.boundary_bbox
  );

  const rawGeometry = pickFirstDefined(
    payload.fieldGeometry,
    payload.field_geometry,
    payload.geometry,
    payload.satelliteGeometry,
    payload.satellite_geometry,
    payload.boundaryGeometry,
    payload.boundary_geometry
  );

  let fieldGeometry = normalizeFieldGeometry(rawGeometry);
  let fieldBbox = normalizeFieldBbox(rawBbox);

  if (!fieldBbox && fieldGeometry) {
    fieldBbox = bboxFromGeometry(fieldGeometry);
  }

  if (!fieldGeometry && fieldBbox) {
    const [minLon, minLat, maxLon, maxLat] = fieldBbox;
    fieldGeometry = normalizeFieldGeometry({
      type: 'Polygon',
      coordinates: [
        [
          [minLon, minLat],
          [maxLon, minLat],
          [maxLon, maxLat],
          [minLon, maxLat],
          [minLon, minLat],
        ],
      ],
    });
  }

  if (!fieldBbox || !fieldGeometry) {
    return {
      field_bbox: null,
      field_geometry: null,
      field_centroid: null,
    };
  }

  return {
    field_bbox: fieldBbox,
    field_geometry: fieldGeometry,
    field_centroid: centroidFromBbox(fieldBbox),
  };
}

function sanitizeTeam(team) {
  const fieldBbox = normalizeFieldBbox(team.field_bbox);
  const fieldGeometry = normalizeFieldGeometry(team.field_geometry);
  const fieldCentroid = team.field_centroid || centroidFromBbox(fieldBbox);
  const hasFieldBoundary = Boolean(fieldBbox && fieldGeometry);

  return {
    id: team.id,
    club_id: team.club_id,
    name: team.name,
    crop: team.crop || '',
    field_bbox: fieldBbox,
    field_geometry: fieldGeometry,
    field_centroid: fieldCentroid,
    fieldBbox,
    fieldGeometry,
    fieldCentroid,
    bbox: fieldBbox,
    geometry: fieldGeometry,
    centroid: fieldCentroid,
    has_field_boundary: hasFieldBoundary,
    hasFieldBoundary,
    hasBoundary: hasFieldBoundary,
    coach_user_id: team.coach_user_id,
    created_at: team.created_at,
    updated_at: team.updated_at,
  };
}

function sanitizeUserSummary(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    role: user.role,
    is_active: user.is_active,
  };
}

function sanitizePlayer(player) {
  return {
    id: player.id,
    user_id: player.user_id,
    club_id: player.club_id,
    jersey_number: player.jersey_number,
    preferred_position: player.preferred_position,
    created_at: player.created_at,
    updated_at: player.updated_at,
  };
}

function sanitizeMembership(membership) {
  return {
    id: membership.id,
    team_id: membership.team_id,
    player_id: membership.player_id,
    created_at: membership.created_at,
  };
}

function sanitizePlayerAttributes(attributes) {
  const coachPositionScores = {
    1: attributes.coach_position_1_score ?? null,
    2: attributes.coach_position_2_score ?? null,
    3: attributes.coach_position_3_score ?? null,
    4: attributes.coach_position_4_score ?? null,
    5: attributes.coach_position_5_score ?? null,
    6: attributes.coach_position_6_score ?? null,
  };

  return {
    id: attributes.id,
    player_id: attributes.player_id,
    attack_score: attributes.attack_score,
    defense_score: attributes.defense_score,
    serve_score: attributes.serve_score,
    block_score: attributes.block_score,
    stamina_score: attributes.stamina_score,
    preferred_position: attributes.preferred_position,
    coach_position_1_score: coachPositionScores[1],
    coach_position_2_score: coachPositionScores[2],
    coach_position_3_score: coachPositionScores[3],
    coach_position_4_score: coachPositionScores[4],
    coach_position_5_score: coachPositionScores[5],
    coach_position_6_score: coachPositionScores[6],
    coach_position_scores: coachPositionScores,
    updated_at: attributes.updated_at,
  };
}

function findUserInClub(db, userId, clubId) {
  return db.users.find((entry) => entry.id === userId && entry.club_id === clubId);
}

function getActorDisplayName(db, actor) {
  return findUserInClub(db, actor.id, actor.clubId)?.full_name || 'Club administrator';
}

function findTeamInClub(db, teamId, clubId) {
  return db.teams.find((entry) => entry.id === teamId && entry.club_id === clubId);
}

function findPlayerInClub(db, playerId, clubId) {
  return db.players.find((entry) => entry.id === playerId && entry.club_id === clubId);
}

function findPlayerByUserId(db, userId, clubId) {
  return db.players.find((entry) => entry.user_id === userId && entry.club_id === clubId);
}

function hasActivePlayerRole(db, player) {
  const user = findUserInClub(db, player.user_id, player.club_id);
  return Boolean(user && user.role === 'player' && user.is_active);
}

function syncAssignedTeamForPlayer(db, player, team = null) {
  const user = findUserInClub(db, player.user_id, player.club_id);
  if (!user) {
    return;
  }

  user.assigned_team = team ? team.name : '';
  user.updated_at = new Date().toISOString();
}

function listCoachedTeams(db, clubId, coachUserId) {
  return db.teams
    .filter((entry) => entry.club_id === clubId && entry.coach_user_id === coachUserId)
    .sort((left, right) => left.name.localeCompare(right.name));
}

function syncAssignedTeamForCoach(db, clubId, coachUserId) {
  if (!coachUserId) {
    return;
  }

  const coachUser = findUserInClub(db, coachUserId, clubId);
  if (!coachUser) {
    return;
  }

  coachUser.assigned_team = listCoachedTeams(db, clubId, coachUserId)
    .map((team) => team.name)
    .join(', ');
  coachUser.updated_at = new Date().toISOString();
}

function buildClubTeamIdSet(db, clubId) {
  return new Set(db.teams.filter((entry) => entry.club_id === clubId).map((entry) => entry.id));
}

function findMembershipByPlayerIdInClub(db, playerId, clubId) {
  const clubTeamIds = buildClubTeamIdSet(db, clubId);
  return db.team_memberships.find(
    (entry) => entry.player_id === playerId && clubTeamIds.has(entry.team_id)
  );
}

function findTeamMembershipInClub(db, teamId, playerId, clubId) {
  const clubTeamIds = buildClubTeamIdSet(db, clubId);
  return db.team_memberships.find(
    (entry) => entry.team_id === teamId && entry.player_id === playerId && clubTeamIds.has(entry.team_id)
  );
}

function findPlayerAttributes(db, playerId) {
  return db.player_attributes.find((entry) => entry.player_id === playerId);
}


function normalizePreferredRole(rawValue = '') {
  const value = String(rawValue || '').trim().toLowerCase();
  if (!value) return 'utility';
  if (value.includes('libero') || value === 'l') return 'libero';
  if (value.includes('setter') || value === 's') return 'setter';
  if (value.includes('middle') || value.includes('mb')) return 'middle';
  if (value.includes('outside') || value.includes('oh') || value.includes('left side')) return 'outside';
  if (value.includes('opposite') || value.includes('right side') || value.includes('rs')) return 'opposite';
  return 'utility';
}

function buildDefaultAttributeScores(player, preferredPosition = '') {
  const role = normalizePreferredRole(preferredPosition || player?.preferred_position || '');
  const defaultsByRole = {
    setter: { attack: 62, defense: 68, serve: 74, block: 56, stamina: 76 },
    libero: { attack: 42, defense: 90, serve: 72, block: 34, stamina: 80 },
    middle: { attack: 82, defense: 56, serve: 60, block: 90, stamina: 74 },
    outside: { attack: 84, defense: 72, serve: 76, block: 66, stamina: 80 },
    opposite: { attack: 88, defense: 58, serve: 72, block: 80, stamina: 76 },
    utility: { attack: 70, defense: 70, serve: 70, block: 70, stamina: 70 },
  };

  return defaultsByRole[role] || defaultsByRole.utility;
}

function listMembershipsByTeamId(db, teamId) {
  return db.team_memberships.filter((entry) => entry.team_id === teamId);
}

function assertJerseyNumberAvailableForTeam(db, clubId, teamId, jerseyNumber, excludedPlayerId = null) {
  if (
    jerseyNumber === undefined ||
    jerseyNumber === null ||
    teamId === null ||
    teamId === undefined ||
    clubId === null ||
    clubId === undefined
  ) {
    return;
  }

  const duplicateMembership = listMembershipsByTeamId(db, teamId).find((membership) => {
    if (membership.player_id === excludedPlayerId) {
      return false;
    }

    const rosterPlayer = findPlayerInClub(db, membership.player_id, clubId);
    return rosterPlayer && rosterPlayer.jersey_number === jerseyNumber;
  });

  if (!duplicateMembership) {
    return;
  }

  throw httpError(409, 'Jersey number is already used by another player on this team.', {
    errors: {
      jerseyNumber: 'This jersey number is already assigned to another player on this team.',
    },
  });
}

function normalizeTeamName(name) {
  return name.trim().toLowerCase();
}

function assertTeamNameAvailable(db, clubId, teamName, excludedTeamId = null) {
  const normalized = normalizeTeamName(teamName);
  const duplicate = db.teams.find(
    (entry) =>
      entry.club_id === clubId &&
      entry.id !== excludedTeamId &&
      normalizeTeamName(entry.name) === normalized
  );

  if (duplicate) {
    throw httpError(409, 'A team with this name already exists in the club.', {
      errors: { name: 'Team name is already in use.' },
    });
  }
}

function assertCoachUser(db, clubId, coachUserId) {
  if (!coachUserId) {
    return null;
  }

  const coachUser = findUserInClub(db, coachUserId, clubId);
  if (!coachUser) {
    throw httpError(404, 'Coach user not found.');
  }

  if (!coachUser.is_active) {
    throw httpError(400, 'Assigned coach must have an active account.');
  }

  if (coachUser.role !== 'coach') {
    throw httpError(400, 'Assigned coach must have the coach role.');
  }

  return coachUser;
}

function assertPlayerUser(db, clubId, userId) {
  const user = findUserInClub(db, userId, clubId);
  if (!user) {
    throw httpError(404, 'Player user not found.');
  }

  if (!user.is_active) {
    throw httpError(400, 'Player user must have an active account.');
  }

  if (user.role !== 'player') {
    throw httpError(400, 'Player records can only be created for users with the player role.');
  }

  return user;
}

function getTeamOrThrow(db, clubId, teamId) {
  const team = findTeamInClub(db, teamId, clubId);
  if (!team) {
    throw httpError(404, 'Team not found.');
  }
  return team;
}

function getPlayerOrThrow(db, clubId, playerId) {
  const player = findPlayerInClub(db, playerId, clubId);
  if (!player) {
    throw httpError(404, 'Player not found.');
  }
  return player;
}

function assertActorCanManageTeam(actor, team) {
  if (actor.role === 'admin') {
    return;
  }

  if (actor.role === 'coach' && team.coach_user_id === actor.id) {
    return;
  }

  throw httpError(403, 'You do not have permission to manage this team.');
}

function assertActorCanManagePlayer(actor, db, player) {
  if (actor.role === 'admin') {
    return;
  }

  const membership = findMembershipByPlayerIdInClub(db, player.id, actor.clubId);
  if (!membership) {
    throw httpError(403, 'You do not have permission to manage this player.');
  }

  const team = getTeamOrThrow(db, actor.clubId, membership.team_id);
  if (actor.role === 'coach' && team.coach_user_id === actor.id) {
    return;
  }

  throw httpError(403, 'You do not have permission to manage this player.');
}

function assertActorCanViewPlayer(actor, db, player) {
  if (actor.role === 'admin') {
    return;
  }

  if (actor.role === 'coach') {
    assertActorCanManagePlayer(actor, db, player);
    return;
  }

  if (actor.role === 'player' && player.user_id === actor.id) {
    return;
  }

  throw httpError(403, 'You do not have permission to view this player.');
}

function buildMembershipLookupByPlayerId(db, clubId) {
  const clubTeamIds = buildClubTeamIdSet(db, clubId);
  return db.team_memberships.reduce((lookup, membership) => {
    if (clubTeamIds.has(membership.team_id)) {
      lookup[membership.player_id] = membership;
    }
    return lookup;
  }, {});
}

function serializeRosterEntry(db, membership, clubId) {
  const player = findPlayerInClub(db, membership.player_id, clubId);
  const team = findTeamInClub(db, membership.team_id, clubId);
  const user = player ? findUserInClub(db, player.user_id, clubId) : null;
  const attributes = player ? findPlayerAttributes(db, player.id) : null;

  if (!player || !team) {
    return null;
  }

  return {
    membership_id: membership.id,
    team_id: membership.team_id,
    player_id: membership.player_id,
    created_at: membership.created_at,
    player: sanitizePlayer(player),
    user: sanitizeUserSummary(user),
    attributes: attributes ? sanitizePlayerAttributes(attributes) : null,
  };
}

function serializeTeamSummary(db, team) {
  const coach = team.coach_user_id ? findUserInClub(db, team.coach_user_id, team.club_id) : null;
  const playersCount = listMembershipsByTeamId(db, team.id).length;

  return {
    ...sanitizeTeam(team),
    players_count: playersCount,
    coach: sanitizeUserSummary(coach),
  };
}

function serializeTeamDetail(db, team) {
  const roster = listMembershipsByTeamId(db, team.id)
    .map((membership) => serializeRosterEntry(db, membership, team.club_id))
    .filter(Boolean)
    .sort((left, right) => {
      const leftName = left.user?.full_name || '';
      const rightName = right.user?.full_name || '';
      return leftName.localeCompare(rightName);
    });

  return {
    ...serializeTeamSummary(db, team),
    roster,
  };
}

function serializePlayerDetail(db, player) {
  const user = findUserInClub(db, player.user_id, player.club_id);
  const membership = findMembershipByPlayerIdInClub(db, player.id, player.club_id);
  const team = membership ? findTeamInClub(db, membership.team_id, player.club_id) : null;
  const attributes = findPlayerAttributes(db, player.id);

  return {
    ...sanitizePlayer(player),
    user: sanitizeUserSummary(user),
    attributes: attributes ? sanitizePlayerAttributes(attributes) : null,
    team_membership: membership
      ? {
          id: membership.id,
          team_id: membership.team_id,
          created_at: membership.created_at,
        }
      : null,
    team: team ? sanitizeTeam(team) : null,
  };
}

async function createTeam(actor, payload) {
  return updateDb(async (db) => {
    ensureCollections(db);
    assertTeamNameAvailable(db, actor.clubId, payload.name);
    assertCoachUser(db, actor.clubId, payload.coachUserId || null);

    const now = new Date().toISOString();
    const fieldBoundary = buildFieldBoundary(payload);
    const team = {
      id: `team-${randomUUID()}`,
      club_id: actor.clubId,
      name: payload.name.trim(),
      crop: payload.crop ? payload.crop.trim() : '',
      field_bbox: fieldBoundary.field_bbox,
      field_geometry: fieldBoundary.field_geometry,
      field_centroid: fieldBoundary.field_centroid,
      coach_user_id: payload.coachUserId || null,
      created_at: now,
      updated_at: now,
    };

    db.teams.unshift(team);

    if (team.coach_user_id) {
      syncAssignedTeamForCoach(db, actor.clubId, team.coach_user_id);
      logTeamAssignmentChange(db, {
        clubId: actor.clubId,
        userId: team.coach_user_id,
        oldTeamId: null,
        oldTeamName: '',
        newTeamId: team.id,
        newTeamName: team.name,
        changeType: 'assigned',
        changedByUserId: actor.id,
        changedAt: now,
      });
    }

    logAuditEvent(db, {
      clubId: actor.clubId,
      actorUserId: actor.id,
      entityType: 'team',
      entityId: team.id,
      actionType: 'team_created',
      summary: `${getActorDisplayName(db, actor)} created team ${team.name}.`,
      metadata: {
        coach_user_id: team.coach_user_id || null,
        crop: team.crop || '',
        has_field_boundary: Boolean(team.field_bbox && team.field_geometry),
      },
      createdAt: now,
    });

    return sanitizeTeam(team);
  });
}

async function listTeams(actor) {
  const db = await readDb();
  ensureCollections(db);

  const visibleTeams = db.teams.filter((entry) => {
    if (entry.club_id !== actor.clubId) {
      return false;
    }

    if (actor.role === 'coach') {
      return entry.coach_user_id === actor.id;
    }

    return true;
  });

  return visibleTeams.map((team) => serializeTeamSummary(db, team));
}

async function getTeam(actor, teamId) {
  const db = await readDb();
  ensureCollections(db);
  return serializeTeamDetail(db, getTeamOrThrow(db, actor.clubId, teamId));
}

async function getTeamsSummary(actor) {
  const db = await readDb();
  ensureCollections(db);
  const clubTeams = db.teams.filter((entry) => entry.club_id === actor.clubId);
  const clubPlayers = db.players.filter((entry) => entry.club_id === actor.clubId);
  const clubCoaches = db.users.filter(
    (entry) => entry.club_id === actor.clubId && entry.role === 'coach' && entry.is_active
  );
  const membershipsByPlayerId = buildMembershipLookupByPlayerId(db, actor.clubId);
  const assignedPlayersCount = clubPlayers.filter((player) => membershipsByPlayerId[player.id]).length;

  return {
    total_teams: clubTeams.length,
    total_players: clubPlayers.length,
    total_coaches: clubCoaches.length,
    assigned_players: assignedPlayersCount,
    unassigned_players: clubPlayers.length - assignedPlayersCount,
  };
}

async function updateTeam(actor, teamId, payload) {
  return updateDb(async (db) => {
    ensureCollections(db);
    const team = getTeamOrThrow(db, actor.clubId, teamId);
    const previousCoachUserId = team.coach_user_id;
    const previousName = team.name;

    if (payload.name !== undefined) {
      assertTeamNameAvailable(db, actor.clubId, payload.name, team.id);
      team.name = payload.name.trim();
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'coachUserId')) {
      assertCoachUser(db, actor.clubId, payload.coachUserId || null);
      team.coach_user_id = payload.coachUserId || null;
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'crop')) {
      team.crop = payload.crop ? payload.crop.trim() : '';
    }

    if (
      Object.prototype.hasOwnProperty.call(payload, 'fieldBbox') ||
      Object.prototype.hasOwnProperty.call(payload, 'field_bbox') ||
      Object.prototype.hasOwnProperty.call(payload, 'fieldGeometry') ||
      Object.prototype.hasOwnProperty.call(payload, 'field_geometry') ||
      Object.prototype.hasOwnProperty.call(payload, 'bbox') ||
      Object.prototype.hasOwnProperty.call(payload, 'geometry') ||
      Object.prototype.hasOwnProperty.call(payload, 'satelliteBbox') ||
      Object.prototype.hasOwnProperty.call(payload, 'satellite_bbox') ||
      Object.prototype.hasOwnProperty.call(payload, 'satelliteGeometry') ||
      Object.prototype.hasOwnProperty.call(payload, 'satellite_geometry') ||
      Object.prototype.hasOwnProperty.call(payload, 'boundaryBbox') ||
      Object.prototype.hasOwnProperty.call(payload, 'boundary_bbox') ||
      Object.prototype.hasOwnProperty.call(payload, 'boundaryGeometry') ||
      Object.prototype.hasOwnProperty.call(payload, 'boundary_geometry')
    ) {
      const fieldBoundary = buildFieldBoundary(payload);
      team.field_bbox = fieldBoundary.field_bbox;
      team.field_geometry = fieldBoundary.field_geometry;
      team.field_centroid = fieldBoundary.field_centroid;
    }

    team.updated_at = new Date().toISOString();

    if (payload.name !== undefined && team.coach_user_id) {
      syncAssignedTeamForCoach(db, actor.clubId, team.coach_user_id);
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'coachUserId')) {
      if (previousCoachUserId && previousCoachUserId !== team.coach_user_id) {
        syncAssignedTeamForCoach(db, actor.clubId, previousCoachUserId);
        logTeamAssignmentChange(db, {
          clubId: actor.clubId,
          userId: previousCoachUserId,
          oldTeamId: team.id,
          oldTeamName: previousName,
          newTeamId: null,
          newTeamName: '',
          changeType: 'unassigned',
          changedByUserId: actor.id,
          changedAt: team.updated_at,
        });
      }

      if (team.coach_user_id) {
        syncAssignedTeamForCoach(db, actor.clubId, team.coach_user_id);
        logTeamAssignmentChange(db, {
          clubId: actor.clubId,
          userId: team.coach_user_id,
          oldTeamId: previousCoachUserId === team.coach_user_id ? team.id : null,
          oldTeamName: previousCoachUserId === team.coach_user_id ? previousName : '',
          newTeamId: team.id,
          newTeamName: team.name,
          changeType: previousCoachUserId === team.coach_user_id ? 'reassigned' : 'assigned',
          changedByUserId: actor.id,
          changedAt: team.updated_at,
        });
      }
    }

    logAuditEvent(db, {
      clubId: actor.clubId,
      actorUserId: actor.id,
      entityType: 'team',
      entityId: team.id,
      actionType: 'team_updated',
      summary: `${getActorDisplayName(db, actor)} updated team ${previousName}${previousName !== team.name ? ` to ${team.name}` : ''}.`,
      metadata: {
        previous_name: previousName,
        new_name: team.name,
        previous_coach_user_id: previousCoachUserId,
        new_coach_user_id: team.coach_user_id,
        crop: team.crop || '',
        has_field_boundary: Boolean(team.field_bbox && team.field_geometry),
      },
      createdAt: team.updated_at,
    });

    return sanitizeTeam(team);
  });
}



async function updateTeamBoundary(actor, teamId, payload) {
  return updateDb(async (db) => {
    ensureCollections(db);
    const team = getTeamOrThrow(db, actor.clubId, teamId);

    const boundaryPayload = {
      ...payload,
      ...(payload.boundary || {}),
    };

    const fieldBoundary = buildFieldBoundary(boundaryPayload);

    if (!fieldBoundary.field_bbox || !fieldBoundary.field_geometry) {
      throw httpError(400, 'Draw at least 3 valid points around the field before saving the boundary.', {
        errors: {
          fieldBoundary: 'Draw at least 3 valid points around the field before saving the boundary.',
        },
      });
    }

    if (typeof payload.name === 'string' && payload.name.trim()) {
      assertTeamNameAvailable(db, actor.clubId, payload.name, team.id);
      team.name = payload.name.trim();
    }

    if (typeof payload.crop === 'string') {
      team.crop = payload.crop.trim();
    }

    team.field_bbox = fieldBoundary.field_bbox;
    team.field_geometry = fieldBoundary.field_geometry;
    team.field_centroid = fieldBoundary.field_centroid;
    team.updated_at = new Date().toISOString();

    logAuditEvent(db, {
      clubId: actor.clubId,
      actorUserId: actor.id,
      entityType: 'team',
      entityId: team.id,
      actionType: 'team_boundary_updated',
      summary: `${getActorDisplayName(db, actor)} saved the satellite boundary for ${team.name}.`,
      metadata: {
        field_bbox: team.field_bbox,
        has_field_boundary: true,
      },
      createdAt: team.updated_at,
    });

    return serializeTeamSummary(db, team);
  });
}

async function deleteTeam(actor, teamId) {
  return updateDb(async (db) => {
    ensureCollections(db);
    const team = getTeamOrThrow(db, actor.clubId, teamId);
    const coachUserId = team.coach_user_id;
    const memberships = listMembershipsByTeamId(db, team.id);
    const lineupIds = new Set(
      db.lineups
        .filter((entry) => entry.club_id === actor.clubId && entry.team_id === team.id)
        .map((entry) => entry.id)
    );

    db.team_memberships = db.team_memberships.filter((entry) => entry.team_id !== team.id);

    memberships.forEach((membership) => {
      const player = findPlayerInClub(db, membership.player_id, actor.clubId);
      if (player) {
        syncAssignedTeamForPlayer(db, player, null);
        logTeamAssignmentChange(db, {
          clubId: actor.clubId,
          userId: player.user_id,
          oldTeamId: team.id,
          oldTeamName: team.name,
          newTeamId: null,
          newTeamName: '',
          changeType: 'unassigned',
          changedByUserId: actor.id,
          changedAt: new Date().toISOString(),
        });
      }
    });

    db.position_assignments = db.position_assignments.filter((entry) => !lineupIds.has(entry.lineup_id));
    db.lineups = db.lineups.filter((entry) => !(entry.club_id === actor.clubId && entry.team_id === team.id));
    db.events = db.events.filter((entry) => !(entry.club_id === actor.clubId && entry.team_id === team.id));
    const removedRequestIds = new Set(
      db.event_requests
        .filter((entry) => entry.club_id === actor.clubId && entry.team_id === team.id)
        .map((entry) => entry.id)
    );
    db.event_requests = db.event_requests.filter(
      (entry) => !(entry.club_id === actor.clubId && entry.team_id === team.id)
    );
    db.event_request_revisions = db.event_request_revisions.filter(
      (entry) => !removedRequestIds.has(entry.event_request_id)
    );
    db.announcements = db.announcements.filter((entry) => !(entry.club_id === actor.clubId && entry.team_id === team.id));
    db.notifications = db.notifications.filter((entry) => !(entry.club_id === actor.clubId && entry.team_id === team.id));
    db.invitations = db.invitations.filter((entry) => !(entry.club_id === actor.clubId && entry.team_id === team.id));
    db.teams = db.teams.filter((entry) => entry.id !== team.id);

    if (coachUserId) {
      syncAssignedTeamForCoach(db, actor.clubId, coachUserId);
      logTeamAssignmentChange(db, {
        clubId: actor.clubId,
        userId: coachUserId,
        oldTeamId: team.id,
        oldTeamName: team.name,
        newTeamId: null,
        newTeamName: '',
        changeType: 'unassigned',
        changedByUserId: actor.id,
        changedAt: new Date().toISOString(),
      });
    }

    logAuditEvent(db, {
      clubId: actor.clubId,
      actorUserId: actor.id,
      entityType: 'team',
      entityId: team.id,
      actionType: 'team_deleted',
      summary: `${getActorDisplayName(db, actor)} deleted team ${team.name}.`,
      metadata: { removed_memberships: memberships.length },
      createdAt: new Date().toISOString(),
    });

    return { id: team.id };
  });
}

async function createPlayer(actor, payload) {
  return updateDb(async (db) => {
    ensureCollections(db);
    assertPlayerUser(db, actor.clubId, payload.userId);

    if (findPlayerByUserId(db, payload.userId, actor.clubId)) {
      throw httpError(409, 'A player record already exists for this user.', {
        errors: { userId: 'A player record already exists for this user.' },
      });
    }

    const now = new Date().toISOString();
    const player = {
      id: `player-${randomUUID()}`,
      user_id: payload.userId,
      club_id: actor.clubId,
      jersey_number: payload.jerseyNumber,
      preferred_position: payload.preferredPosition || '',
      created_at: now,
      updated_at: now,
    };

    db.players.unshift(player);
    return sanitizePlayer(player);
  });
}

async function listPlayers(actor) {
  const db = await readDb();
  ensureCollections(db);
  let players = db.players
    .filter((entry) => entry.club_id === actor.clubId)
    .filter((player) => hasActivePlayerRole(db, player));

  if (actor.role === 'player') {
    players = players.filter((player) => player.user_id === actor.id);
  }

  return players.map((player) => serializePlayerDetail(db, player));
}

async function getPlayer(actor, playerId) {
  const db = await readDb();
  ensureCollections(db);
  const player = getPlayerOrThrow(db, actor.clubId, playerId);
  assertActorCanViewPlayer(actor, db, player);
  return serializePlayerDetail(db, player);
}

async function updatePlayer(actor, playerId, payload) {
  return updateDb(async (db) => {
    ensureCollections(db);
    const player = getPlayerOrThrow(db, actor.clubId, playerId);
    assertActorCanManagePlayer(actor, db, player);
    const membership = findMembershipByPlayerIdInClub(db, player.id, actor.clubId);

    if (payload.jerseyNumber !== undefined) {
      assertJerseyNumberAvailableForTeam(db, actor.clubId, membership?.team_id, payload.jerseyNumber, player.id);
      player.jersey_number = payload.jerseyNumber;
    }

    if (payload.preferredPosition !== undefined) {
      player.preferred_position = payload.preferredPosition;
    }

    player.updated_at = new Date().toISOString();
    return sanitizePlayer(player);
  });
}

async function addPlayerToTeam(actor, teamId, payload) {
  return updateDb(async (db) => {
    ensureCollections(db);
    const team = getTeamOrThrow(db, actor.clubId, teamId);
    assertActorCanManageTeam(actor, team);
    const player = getPlayerOrThrow(db, actor.clubId, payload.playerId);

    if (!hasActivePlayerRole(db, player)) {
      throw httpError(400, 'Only users with the player role can be added to a team.');
    }

    const existingMembership = findMembershipByPlayerIdInClub(db, player.id, actor.clubId);

    if (existingMembership) {
      if (existingMembership.team_id === team.id) {
        throw httpError(409, 'This player is already assigned to the team.');
      }

      throw httpError(409, 'This player is already assigned to another team. Use the transfer endpoint instead.');
    }

    assertJerseyNumberAvailableForTeam(db, actor.clubId, team.id, player.jersey_number, player.id);

    const membership = {
      id: `membership-${randomUUID()}`,
      team_id: team.id,
      player_id: player.id,
      created_at: new Date().toISOString(),
    };

    db.team_memberships.unshift(membership);
    syncAssignedTeamForPlayer(db, player, team);
    logTeamAssignmentChange(db, {
      clubId: actor.clubId,
      userId: player.user_id,
      oldTeamId: null,
      oldTeamName: '',
      newTeamId: team.id,
      newTeamName: team.name,
      changeType: 'assigned',
      changedByUserId: actor.id,
      changedAt: membership.created_at,
    });
    logAuditEvent(db, {
      clubId: actor.clubId,
      actorUserId: actor.id,
      targetUserId: player.user_id,
      entityType: 'team_membership',
      entityId: membership.id,
      actionType: 'player_added_to_team',
      summary: `${getActorDisplayName(db, actor)} added a player to ${team.name}.`,
      metadata: { team_name: team.name, player_id: player.id },
      createdAt: membership.created_at,
    });
    return sanitizeMembership(membership);
  });
}

async function removePlayerFromTeam(actor, teamId, playerId) {
  return updateDb(async (db) => {
    ensureCollections(db);
    const team = getTeamOrThrow(db, actor.clubId, teamId);
    assertActorCanManageTeam(actor, team);
    const player = getPlayerOrThrow(db, actor.clubId, playerId);
    const membership = findTeamMembershipInClub(db, teamId, playerId, actor.clubId);

    if (!membership) {
      throw httpError(404, 'Team membership not found.');
    }

    db.team_memberships = db.team_memberships.filter((entry) => entry.id !== membership.id);
    syncAssignedTeamForPlayer(db, player, null);
    const changedAt = new Date().toISOString();
    logTeamAssignmentChange(db, {
      clubId: actor.clubId,
      userId: player.user_id,
      oldTeamId: team.id,
      oldTeamName: team.name,
      newTeamId: null,
      newTeamName: '',
      changeType: 'unassigned',
      changedByUserId: actor.id,
      changedAt,
    });
    logAuditEvent(db, {
      clubId: actor.clubId,
      actorUserId: actor.id,
      targetUserId: player.user_id,
      entityType: 'team_membership',
      entityId: membership.id,
      actionType: 'player_removed_from_team',
      summary: `${getActorDisplayName(db, actor)} removed a player from ${team.name}.`,
      metadata: { team_name: team.name, player_id: player.id },
      createdAt: changedAt,
    });
    return sanitizeMembership(membership);
  });
}

async function transferPlayer(actor, playerId, payload) {
  return updateDb(async (db) => {
    ensureCollections(db);
    const player = getPlayerOrThrow(db, actor.clubId, playerId);
    const targetTeam = getTeamOrThrow(db, actor.clubId, payload.targetTeamId);
    const existingMembership = findMembershipByPlayerIdInClub(db, player.id, actor.clubId);

    if (!existingMembership) {
      throw httpError(400, 'This player is not currently assigned to a team.');
    }

    if (existingMembership.team_id === targetTeam.id) {
      throw httpError(400, 'This player is already assigned to the target team.');
    }

    assertJerseyNumberAvailableForTeam(db, actor.clubId, targetTeam.id, player.jersey_number, player.id);

    const previousTeam = findTeamInClub(db, existingMembership.team_id, actor.clubId);
    db.team_memberships = db.team_memberships.filter((entry) => entry.id !== existingMembership.id);

    const membership = {
      id: `membership-${randomUUID()}`,
      team_id: targetTeam.id,
      player_id: player.id,
      created_at: new Date().toISOString(),
    };

    db.team_memberships.unshift(membership);
    syncAssignedTeamForPlayer(db, player, targetTeam);
    logTeamAssignmentChange(db, {
      clubId: actor.clubId,
      userId: player.user_id,
      oldTeamId: previousTeam?.id || null,
      oldTeamName: previousTeam?.name || '',
      newTeamId: targetTeam.id,
      newTeamName: targetTeam.name,
      changeType: 'reassigned',
      changedByUserId: actor.id,
      changedAt: membership.created_at,
    });
    logAuditEvent(db, {
      clubId: actor.clubId,
      actorUserId: actor.id,
      targetUserId: player.user_id,
      entityType: 'team_membership',
      entityId: membership.id,
      actionType: 'player_transferred',
      summary: `${getActorDisplayName(db, actor)} transferred a player to ${targetTeam.name}.`,
      metadata: { previous_team_name: previousTeam?.name || '', new_team_name: targetTeam.name },
      createdAt: membership.created_at,
    });
    return sanitizeMembership(membership);
  });
}

async function createPlayerAttributes(actor, playerId, payload) {
  return updateDb(async (db) => {
    ensureCollections(db);
    const player = getPlayerOrThrow(db, actor.clubId, playerId);
    assertActorCanManagePlayer(actor, db, player);

    if (findPlayerAttributes(db, playerId)) {
      throw httpError(409, 'Player attributes already exist for this player.');
    }

    const attributes = {
      id: `attr-${randomUUID()}`,
      player_id: playerId,
      attack_score: payload.attackScore,
      defense_score: payload.defenseScore,
      serve_score: payload.serveScore,
      block_score: payload.blockScore,
      stamina_score: payload.staminaScore,
      preferred_position: payload.preferredPosition || '',
      coach_position_1_score: payload.coachPosition1Score ?? null,
      coach_position_2_score: payload.coachPosition2Score ?? null,
      coach_position_3_score: payload.coachPosition3Score ?? null,
      coach_position_4_score: payload.coachPosition4Score ?? null,
      coach_position_5_score: payload.coachPosition5Score ?? null,
      coach_position_6_score: payload.coachPosition6Score ?? null,
      updated_at: new Date().toISOString(),
    };

    db.player_attributes.unshift(attributes);
    return sanitizePlayerAttributes(attributes);
  });
}

async function updatePlayerAttributes(actor, playerId, payload) {
  return updateDb(async (db) => {
    ensureCollections(db);
    const player = getPlayerOrThrow(db, actor.clubId, playerId);
    assertActorCanManagePlayer(actor, db, player);
    let attributes = findPlayerAttributes(db, playerId);

    if (!attributes) {
      const defaults = buildDefaultAttributeScores(player, payload.preferredPosition);
      attributes = {
        id: `attr-${randomUUID()}`,
        player_id: playerId,
        attack_score: defaults.attack,
        defense_score: defaults.defense,
        serve_score: defaults.serve,
        block_score: defaults.block,
        stamina_score: defaults.stamina,
        preferred_position: payload.preferredPosition ?? player.preferred_position ?? '',
        coach_position_1_score: null,
        coach_position_2_score: null,
        coach_position_3_score: null,
        coach_position_4_score: null,
        coach_position_5_score: null,
        coach_position_6_score: null,
        updated_at: new Date().toISOString(),
      };
      db.player_attributes.unshift(attributes);
    }

    if (payload.attackScore !== undefined) attributes.attack_score = payload.attackScore;
    if (payload.defenseScore !== undefined) attributes.defense_score = payload.defenseScore;
    if (payload.serveScore !== undefined) attributes.serve_score = payload.serveScore;
    if (payload.blockScore !== undefined) attributes.block_score = payload.blockScore;
    if (payload.staminaScore !== undefined) attributes.stamina_score = payload.staminaScore;
    if (payload.preferredPosition !== undefined) attributes.preferred_position = payload.preferredPosition;
    if (payload.coachPosition1Score !== undefined) attributes.coach_position_1_score = payload.coachPosition1Score;
    if (payload.coachPosition2Score !== undefined) attributes.coach_position_2_score = payload.coachPosition2Score;
    if (payload.coachPosition3Score !== undefined) attributes.coach_position_3_score = payload.coachPosition3Score;
    if (payload.coachPosition4Score !== undefined) attributes.coach_position_4_score = payload.coachPosition4Score;
    if (payload.coachPosition5Score !== undefined) attributes.coach_position_5_score = payload.coachPosition5Score;
    if (payload.coachPosition6Score !== undefined) attributes.coach_position_6_score = payload.coachPosition6Score;

    attributes.updated_at = new Date().toISOString();
    return sanitizePlayerAttributes(attributes);
  });
}

async function getPlayerAttributes(actor, playerId) {
  const db = await readDb();
  ensureCollections(db);
  const player = getPlayerOrThrow(db, actor.clubId, playerId);
  assertActorCanViewPlayer(actor, db, player);
  const attributes = findPlayerAttributes(db, playerId);

  if (!attributes) {
    throw httpError(404, 'Player attributes not found.');
  }

  return sanitizePlayerAttributes(attributes);
}

function sanitizePlayerAddRequest(request) {
  return {
    id: request.id,
    coach_user_id: request.coach_user_id,
    player_id: request.player_id,
    team_id: request.team_id,
    request_type: request.request_type || 'add',
    status: request.status,
    created_at: request.created_at,
    reviewed_at: request.reviewed_at || null,
    reviewed_by_user_id: request.reviewed_by_user_id || null,
  };
}

async function createPlayerAddRequest(actor, payload) {
  return updateDb(async (db) => {
    ensureCollections(db);
    const team = getTeamOrThrow(db, actor.clubId, payload.teamId);

    if (team.coach_user_id !== actor.id) {
      throw httpError(403, 'You can only request players for your own team.');
    }

    const player = getPlayerOrThrow(db, actor.clubId, payload.playerId);

    if (!hasActivePlayerRole(db, player)) {
      throw httpError(400, 'Only users with the player role can be requested.');
    }

    const requestType = payload.requestType || 'add';
    const existingMembership = findMembershipByPlayerIdInClub(db, player.id, actor.clubId);

    if (requestType === 'add') {
      if (existingMembership) {
        if (existingMembership.team_id === team.id) {
          throw httpError(409, 'This player is already assigned to the team.');
        }

        throw httpError(409, 'This player is already assigned to another team. Use the transfer endpoint instead.');
      }
    } else {
      if (!existingMembership || existingMembership.team_id !== team.id) {
        throw httpError(400, 'This player is not currently assigned to this team.');
      }
    }

    const duplicate = db.player_add_requests.find(
      (r) =>
        r.player_id === player.id &&
        r.team_id === team.id &&
        (r.request_type || 'add') === requestType &&
        r.status === 'pending'
    );

    if (duplicate) {
      throw httpError(409, 'A pending request for this player and team already exists.', {
        errors: { playerId: 'A pending request already exists for this player.' },
      });
    }

    const request = {
      id: `par-${randomUUID()}`,
      coach_user_id: actor.id,
      player_id: player.id,
      team_id: team.id,
      request_type: requestType,
      status: 'pending',
      created_at: new Date().toISOString(),
      reviewed_at: null,
      reviewed_by_user_id: null,
    };

    db.player_add_requests.unshift(request);
    return sanitizePlayerAddRequest(request);
  });
}

async function listPlayerAddRequests(actor) {
  const db = await readDb();
  ensureCollections(db);

  const clubTeamIds = buildClubTeamIdSet(db, actor.clubId);
  const coachedTeamIds = actor.role === 'coach'
    ? new Set(
        db.teams
          .filter((team) => team.club_id === actor.clubId && team.coach_user_id === actor.id)
          .map((team) => team.id)
      )
    : null;

  const requests = db.player_add_requests.filter((r) => {
    if (!clubTeamIds.has(r.team_id)) {
      return false;
    }

    if (actor.role === 'coach') {
      return coachedTeamIds.has(r.team_id);
    }

    return true;
  });

  return requests.map((r) => {
    const coach = db.users.find((u) => u.id === r.coach_user_id);
    const player = db.players.find((p) => p.id === r.player_id);
    const playerUser = player ? db.users.find((u) => u.id === player.user_id) : null;
    const team = db.teams.find((t) => t.id === r.team_id);
    const reviewer = r.reviewed_by_user_id ? db.users.find((u) => u.id === r.reviewed_by_user_id) : null;

    return {
      ...sanitizePlayerAddRequest(r),
      coach: coach ? sanitizeUserSummary(coach) : null,
      player: player ? sanitizePlayer(player) : null,
      player_user: playerUser ? sanitizeUserSummary(playerUser) : null,
      team: team ? sanitizeTeam(team) : null,
      reviewer: reviewer ? sanitizeUserSummary(reviewer) : null,
    };
  });
}

async function approvePlayerAddRequest(actor, requestId) {
  return updateDb(async (db) => {
    ensureCollections(db);
    const clubTeamIds = buildClubTeamIdSet(db, actor.clubId);
    const request = db.player_add_requests.find((r) => r.id === requestId && clubTeamIds.has(r.team_id));

    if (!request) {
      throw httpError(404, 'Player add request not found.');
    }

    if (request.status !== 'pending') {
      throw httpError(409, 'This request has already been reviewed.');
    }

    const team = getTeamOrThrow(db, actor.clubId, request.team_id);
    const player = getPlayerOrThrow(db, actor.clubId, request.player_id);

    if (!hasActivePlayerRole(db, player)) {
      throw httpError(400, 'Only users with the player role can be processed.');
    }

    const requestType = request.request_type || 'add';
    const changedAt = new Date().toISOString();
    const playerUser = db.users.find((u) => u.id === player.user_id);
    const playerName = playerUser ? playerUser.full_name : 'The player';

    if (requestType === 'remove') {
      const membership = findTeamMembershipInClub(db, team.id, player.id, actor.clubId);

      if (!membership) {
        throw httpError(404, 'Team membership not found.');
      }

      db.team_memberships = db.team_memberships.filter((entry) => entry.id !== membership.id);
      syncAssignedTeamForPlayer(db, player, null);

      logTeamAssignmentChange(db, {
        clubId: actor.clubId,
        userId: player.user_id,
        oldTeamId: team.id,
        oldTeamName: team.name,
        newTeamId: null,
        newTeamName: '',
        changeType: 'unassigned',
        changedByUserId: actor.id,
        changedAt,
      });

      logAuditEvent(db, {
        clubId: actor.clubId,
        actorUserId: actor.id,
        targetUserId: player.user_id,
        entityType: 'player_add_request',
        entityId: request.id,
        actionType: 'player_remove_request_approved',
        summary: `${getActorDisplayName(db, actor)} approved a player removal request for ${team.name}.`,
        metadata: { team_name: team.name, player_id: player.id, request_type: requestType },
        createdAt: changedAt,
      });
    } else {
      const existingMembership = findMembershipByPlayerIdInClub(db, player.id, actor.clubId);

      if (existingMembership) {
        if (existingMembership.team_id === team.id) {
          throw httpError(409, 'This player is already assigned to the team.');
        }

        throw httpError(409, 'This player is already assigned to another team. Use the transfer endpoint instead.');
      }

      assertJerseyNumberAvailableForTeam(db, actor.clubId, team.id, player.jersey_number, player.id);

      const membership = {
        id: `membership-${randomUUID()}`,
        team_id: team.id,
        player_id: player.id,
        created_at: changedAt,
      };

      db.team_memberships.unshift(membership);
      syncAssignedTeamForPlayer(db, player, team);

      logTeamAssignmentChange(db, {
        clubId: actor.clubId,
        userId: player.user_id,
        oldTeamId: null,
        oldTeamName: '',
        newTeamId: team.id,
        newTeamName: team.name,
        changeType: 'assigned',
        changedByUserId: actor.id,
        changedAt,
      });

      logAuditEvent(db, {
        clubId: actor.clubId,
        actorUserId: actor.id,
        targetUserId: player.user_id,
        entityType: 'player_add_request',
        entityId: request.id,
        actionType: 'player_add_request_approved',
        summary: `${getActorDisplayName(db, actor)} approved a player add request for ${team.name}.`,
        metadata: { team_name: team.name, player_id: player.id, request_type: requestType },
        createdAt: changedAt,
      });
    }

    request.status = 'approved';
    request.reviewed_at = changedAt;
    request.reviewed_by_user_id = actor.id;

    db.notifications.unshift(
      createNotificationRecord({
        clubId: actor.clubId,
        userId: request.coach_user_id,
        teamId: team.id,
        type: 'player_request_approved',
        message:
          requestType === 'remove'
            ? `Your request to remove ${playerName} from ${team.name} has been approved.`
            : `Your request to add ${playerName} to ${team.name} has been approved.`,
        relatedEntityType: 'player_add_request',
        relatedEntityId: request.id,
      })
    );

    return sanitizePlayerAddRequest(request);
  });
}

async function rejectPlayerAddRequest(actor, requestId) {
  return updateDb(async (db) => {
    ensureCollections(db);
    const clubTeamIds = buildClubTeamIdSet(db, actor.clubId);
    const request = db.player_add_requests.find((r) => r.id === requestId && clubTeamIds.has(r.team_id));

    if (!request) {
      throw httpError(404, 'Player add request not found.');
    }

    if (request.status !== 'pending') {
      throw httpError(409, 'This request has already been reviewed.');
    }

    const team = db.teams.find((t) => t.id === request.team_id);
    const player = db.players.find((p) => p.id === request.player_id);
    const playerUser = player ? db.users.find((u) => u.id === player.user_id) : null;
    const playerName = playerUser ? playerUser.full_name : 'The player';
    const teamName = team ? team.name : 'the team';
    const requestType = request.request_type || 'add';

    request.status = 'rejected';
    request.reviewed_at = new Date().toISOString();
    request.reviewed_by_user_id = actor.id;

    db.notifications.unshift(
      createNotificationRecord({
        clubId: actor.clubId,
        userId: request.coach_user_id,
        teamId: request.team_id,
        type: 'player_request_rejected',
        message:
          requestType === 'remove'
            ? `Your request to remove ${playerName} from ${teamName} has been rejected.`
            : `Your request to add ${playerName} to ${teamName} has been rejected.`,
        relatedEntityType: 'player_add_request',
        relatedEntityId: request.id,
      })
    );

    return sanitizePlayerAddRequest(request);
  });
}

module.exports = {
  createTeam,
  listTeams,
  getTeam,
  getTeamsSummary,
  updateTeam,
  updateTeamBoundary,
  deleteTeam,
  createPlayer,
  listPlayers,
  getPlayer,
  updatePlayer,
  addPlayerToTeam,
  removePlayerFromTeam,
  transferPlayer,
  createPlayerAttributes,
  updatePlayerAttributes,
  getPlayerAttributes,
  createPlayerAddRequest,
  listPlayerAddRequests,
  approvePlayerAddRequest,
  rejectPlayerAddRequest,
};

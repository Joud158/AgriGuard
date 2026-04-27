function sanitizeEventSummary(event) {
  if (!event) return null;

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

function sanitizeTeamSummary(team) {
  if (!team) return null;

  return {
    id: team.id,
    name: team.name,
    coach_user_id: team.coach_user_id,
  };
}

function buildEventOverlapWarnings(db, { clubId, startTime, endTime, excludeEventId = '', requestedTeamId = '' }) {
  const requestedStart = new Date(startTime);
  const requestedEnd = new Date(endTime);

  if (
    Number.isNaN(requestedStart.getTime()) ||
    Number.isNaN(requestedEnd.getTime()) ||
    requestedEnd <= requestedStart
  ) {
    return [];
  }

  const teams = Array.isArray(db.teams) ? db.teams : [];
  const events = Array.isArray(db.events) ? db.events : [];

  return events
    .filter((entry) => entry.club_id === clubId)
    .filter((entry) => !excludeEventId || entry.id !== excludeEventId)
    .filter((entry) => new Date(entry.start_time) < requestedEnd && new Date(entry.end_time) > requestedStart)
    .map((entry) => {
      const existingStart = new Date(entry.start_time);
      const existingEnd = new Date(entry.end_time);
      const overlapStart = Math.max(requestedStart.getTime(), existingStart.getTime());
      const overlapEnd = Math.min(requestedEnd.getTime(), existingEnd.getTime());
      const overlapMinutes = Math.max(0, Math.round((overlapEnd - overlapStart) / 60000));
      const team = teams.find((candidate) => candidate.id === entry.team_id && candidate.club_id === clubId);

      return {
        event: sanitizeEventSummary(entry),
        team: sanitizeTeamSummary(team),
        overlap_minutes: overlapMinutes,
        overlap_start_time: new Date(overlapStart).toISOString(),
        overlap_end_time: new Date(overlapEnd).toISOString(),
        same_team: Boolean(requestedTeamId) && entry.team_id === requestedTeamId,
      };
    })
    .sort((left, right) => new Date(left.event.start_time) - new Date(right.event.start_time));
}

module.exports = {
  buildEventOverlapWarnings,
  sanitizeEventSummary,
  sanitizeTeamSummary,
};

const { randomUUID } = require('crypto');
const { hashPassword } = require('../utils/passwords');
const { hashInvitationToken } = require('../utils/tokens');

let passwordHashesPromise = null;

async function getSeedPasswordHashes() {
  if (!passwordHashesPromise) {
    passwordHashesPromise = Promise.all([
      hashPassword('Admin@123!'),
      hashPassword('Coach@123!'),
      hashPassword('Player@123!'),
    ]).then(([adminPasswordHash, coachPasswordHash, playerPasswordHash]) => ({
      adminPasswordHash,
      coachPasswordHash,
      playerPasswordHash,
    }));
  }

  return passwordHashesPromise;
}

function secureUser(user) {
  return {
    ...user,
    email_verified_at: user.email_verified_at || user.created_at,
    mfa_enabled: false,
    mfa_secret_encrypted: '',
    mfa_pending_secret_encrypted: '',
  };
}

function hoursFromNow(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

async function buildSeedData() {
  const now = new Date().toISOString();
  const clubId = `farm-network-${randomUUID()}`;
  const adminId = `user-${randomUUID()}`;
  const agronomistId = `user-${randomUUID()}`;
  const farmerId = `user-${randomUUID()}`;
  const oliveFieldId = `field-${randomUUID()}`;
  const tomatoGreenhouseId = `field-${randomUUID()}`;
  const farmerProfileId = `farmer-profile-${randomUUID()}`;
  const visitEventId = `visit-${randomUUID()}`;
  const conversationId = `conversation-${randomUUID()}`;
  const { adminPasswordHash, coachPasswordHash, playerPasswordHash } = await getSeedPasswordHashes();

  const roles = [
    { id: 'role-admin', name: 'admin', created_at: now },
    { id: 'role-coach', name: 'coach', created_at: now },
    { id: 'role-player', name: 'player', created_at: now },
  ];

  const clubs = [
    {
      id: clubId,
      name: 'AgriGuard Bekaa Monitoring Network',
      city: 'Bekaa Valley',
      created_at: now,
      updated_at: now,
    },
  ];

  const users = [
    secureUser({
      id: adminId,
      full_name: 'Maya Haddad',
      email: 'admin@agriguard.com',
      password_hash: adminPasswordHash,
      role: 'admin',
      club_id: clubId,
      assigned_team: '',
      is_active: true,
      created_at: now,
      updated_at: now,
    }),
    secureUser({
      id: agronomistId,
      full_name: 'Dr. Karim Nassar',
      email: 'agronomist@agriguard.com',
      password_hash: coachPasswordHash,
      role: 'coach',
      club_id: clubId,
      assigned_team: 'North Olive Block',
      is_active: true,
      created_at: now,
      updated_at: now,
    }),
    secureUser({
      id: farmerId,
      full_name: 'Ali Farhat',
      email: 'farmer@agriguard.com',
      password_hash: playerPasswordHash,
      role: 'player',
      club_id: clubId,
      assigned_team: 'North Olive Block',
      is_active: true,
      created_at: now,
      updated_at: now,
    }),
  ];

  const teams = [
    {
      id: oliveFieldId,
      club_id: clubId,
      name: 'North Olive Block',
      coach_user_id: agronomistId,
      created_at: now,
      updated_at: now,
    },
    {
      id: tomatoGreenhouseId,
      club_id: clubId,
      name: 'Tomato Greenhouse Zone',
      coach_user_id: agronomistId,
      created_at: now,
      updated_at: now,
    },
  ];

  const players = [
    {
      id: farmerProfileId,
      user_id: farmerId,
      club_id: clubId,
      jersey_number: 14,
      preferred_position: 'Olive and vegetable grower',
      created_at: now,
      updated_at: now,
    },
  ];

  const team_memberships = [
    {
      id: `membership-${randomUUID()}`,
      team_id: oliveFieldId,
      player_id: farmerProfileId,
      created_at: now,
    },
    {
      id: `membership-${randomUUID()}`,
      team_id: tomatoGreenhouseId,
      player_id: farmerProfileId,
      created_at: now,
    },
  ];

  const player_attributes = [
    {
      id: `field-attributes-${randomUUID()}`,
      player_id: farmerProfileId,
      attack_score: 82,
      defense_score: 76,
      serve_score: 88,
      block_score: 71,
      stamina_score: 80,
      preferred_position: 'Rainfed olive block with drip-irrigated edge rows',
      updated_at: now,
    },
  ];

  const events = [
    {
      id: visitEventId,
      club_id: clubId,
      team_id: oliveFieldId,
      title: 'Targeted field inspection: North Olive Block',
      type: 'match',
      description:
        'Satellite vegetation anomaly and dry wind conditions require checking edge rows for early pest or water-stress symptoms.',
      location: 'North Olive Block - Sector B',
      start_time: hoursFromNow(26),
      end_time: hoursFromNow(28),
      created_by: agronomistId,
      created_at: now,
      updated_at: now,
    },
  ];

  const announcements = [
    {
      id: `advisory-${randomUUID()}`,
      club_id: clubId,
      team_id: oliveFieldId,
      audience_type: 'team_players',
      audience_label: 'North Olive Block farmers',
      title: 'Satellite stress alert: inspect before spraying',
      message:
        'NDVI dropped in the north-east strip after two hot, dry days. Please inspect leaves and soil moisture before applying any pesticide. Upload close leaf photos if you see spots, curling, or pest traces.',
      created_by: agronomistId,
      created_at: now,
      updated_at: now,
    },
  ];

  const event_requests = [
    {
      id: `request-${randomUUID()}`,
      club_id: clubId,
      coach_user_id: agronomistId,
      requested_by_user_id: farmerId,
      team_id: tomatoGreenhouseId,
      request_kind: 'create',
      source_event_id: null,
      current_title: 'Greenhouse diagnostic visit',
      current_event_type: 'match',
      current_start_time: hoursFromNow(50),
      current_end_time: hoursFromNow(52),
      current_location: 'Tomato Greenhouse Zone',
      current_notes: 'Farmer reported yellowing leaves; weather is humid and disease pressure is increasing.',
      status: 'pending_coach_review',
      rejection_reason: null,
      finalized_event_id: null,
      final_reviewed_by_admin_id: null,
      final_reviewed_at: null,
      created_at: now,
      updated_at: now,
    },
  ];

  const event_request_revisions = [
    {
      id: `revision-${randomUUID()}`,
      event_request_id: event_requests[0].id,
      proposed_by_role: 'player',
      proposed_by_user_id: farmerId,
      title: event_requests[0].current_title,
      event_type: event_requests[0].current_event_type,
      start_time: event_requests[0].current_start_time,
      end_time: event_requests[0].current_end_time,
      location: event_requests[0].current_location,
      notes: event_requests[0].current_notes,
      revision_number: 1,
      comment: 'Farmer requested agronomist support because humidity and canopy density may accelerate disease spread.',
      created_at: now,
    },
  ];

  const notifications = [
    {
      id: `notification-${randomUUID()}`,
      club_id: clubId,
      user_id: farmerId,
      team_id: oliveFieldId,
      type: 'satellite_alert',
      message: 'New vegetation anomaly detected in North Olive Block. Inspect the marked rows today.',
      related_entity_type: 'team',
      related_entity_id: oliveFieldId,
      is_read: false,
      created_at: now,
      read_at: null,
    },
    {
      id: `notification-${randomUUID()}`,
      club_id: clubId,
      user_id: agronomistId,
      team_id: tomatoGreenhouseId,
      type: 'visit_request',
      message: 'Greenhouse diagnostic visit is pending review.',
      related_entity_type: 'event_request',
      related_entity_id: event_requests[0].id,
      is_read: false,
      created_at: now,
      read_at: null,
    },
  ];

  const conversations = [
    {
      id: conversationId,
      club_id: clubId,
      type: 'team',
      team_id: oliveFieldId,
      created_at: now,
      updated_at: now,
    },
  ];

  const conversation_participants = [
    { id: `participant-${randomUUID()}`, conversation_id: conversationId, user_id: agronomistId, created_at: now },
    { id: `participant-${randomUUID()}`, conversation_id: conversationId, user_id: farmerId, created_at: now },
  ];

  const messages = [
    {
      id: `message-${randomUUID()}`,
      conversation_id: conversationId,
      sender_user_id: agronomistId,
      content:
        'Satellite monitoring flagged a stress patch in Sector B. Please upload a close photo of the affected leaves before spraying.',
      created_at: hoursFromNow(-2),
    },
    {
      id: `message-${randomUUID()}`,
      conversation_id: conversationId,
      sender_user_id: farmerId,
      content:
        'I will check the rows this afternoon. The soil looked dry yesterday, but I noticed a few curled leaves too.',
      created_at: hoursFromNow(-1),
    },
  ];

  const player_performance_logs = [
    {
      id: `monitoring-log-${randomUUID()}`,
      club_id: clubId,
      player_id: farmerProfileId,
      event_id: visitEventId,
      session_type: 'Satellite + field inspection',
      serve_rating: 88,
      attack_rating: 73,
      defense_rating: 79,
      block_rating: 68,
      stamina_rating: 81,
      coach_rating: 84,
      minutes_played: 60,
      attendance_status: 'present',
      created_at: now,
    },
  ];

  const ai_lineup_recommendations = [
    {
      id: `diagnosis-${randomUUID()}`,
      club_id: clubId,
      team_id: oliveFieldId,
      event_id: visitEventId,
      set_number: 1,
      name: 'AI crop-stress diagnosis: North Olive Block',
      summary:
        'Moderate confidence that stress is driven by water deficit with possible pest pressure on edge rows. Inspect before spraying and irrigate only the affected strip if soil moisture is low.',
      confidence_score: 78,
      source: 'satellite-weather-photo-triage',
      llm_model: 'local-demo-rules',
      status: 'draft',
      created_by: agronomistId,
      created_at: now,
      updated_at: now,
    },
  ];

  const ai_lineup_recommendation_positions = [
    {
      id: `diagnosis-step-${randomUUID()}`,
      recommendation_id: ai_lineup_recommendations[0].id,
      player_id: farmerProfileId,
      position_number: 1,
      fit_score: 86,
      reason: 'Inspect the north-east edge rows where satellite stress is strongest.',
      created_at: now,
      updated_at: now,
    },
    {
      id: `diagnosis-step-${randomUUID()}`,
      recommendation_id: ai_lineup_recommendations[0].id,
      player_id: farmerProfileId,
      position_number: 2,
      fit_score: 74,
      reason: 'Upload close leaf photos to separate water stress from early pest or disease symptoms.',
      created_at: now,
      updated_at: now,
    },
  ];

  const invitations = [
    {
      id: `invite-${randomUUID()}`,
      email: 'new.agronomist@agriguard.com',
      invited_full_name: 'New Agronomist',
      role: 'coach',
      team_id: oliveFieldId,
      team_name: 'North Olive Block',
      club_id: clubId,
      invited_by_user_id: adminId,
      token_hash: hashInvitationToken('invite-agronomist-123'),
      expires_at: hoursFromNow(72),
      accepted_at: null,
      created_at: now,
      updated_at: now,
    },
    {
      id: `invite-${randomUUID()}`,
      email: 'new.farmer@agriguard.com',
      invited_full_name: 'New Farmer',
      role: 'player',
      team_id: oliveFieldId,
      team_name: 'North Olive Block',
      club_id: clubId,
      invited_by_user_id: adminId,
      token_hash: hashInvitationToken('invite-farmer-123'),
      expires_at: hoursFromNow(72),
      accepted_at: null,
      created_at: now,
      updated_at: now,
    },
  ];

  return {
    roles,
    clubs,
    users,
    invitations,
    announcements,
    notifications,
    lineups: [],
    position_assignments: [],
    ai_lineup_recommendations,
    ai_lineup_recommendation_positions,
    teams,
    players,
    team_memberships,
    player_attributes,
    player_performance_logs,
    events,
    event_requests,
    event_request_revisions,
    conversations,
    conversation_participants,
    messages,
    password_reset_tokens: [],
    email_verification_tokens: [],
    player_add_requests: [],
  };
}

module.exports = {
  buildSeedData,
};

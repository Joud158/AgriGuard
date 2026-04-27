process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';
process.env.EMAIL_ENABLED = 'false';

const request = require('supertest');
const app = require('../src/app');
const { resetDb } = require('../src/data/store');

jest.setTimeout(15000);

beforeEach(async () => {
  await resetDb();
});

async function login(email, password) {
  const response = await request(app).post('/api/auth/login').send({ email, password });
  return response.body.data.token;
}

async function listUsers(token) {
  const response = await request(app).get('/api/auth/users').set('Authorization', `Bearer ${token}`);
  return response.body.data;
}

async function registerAdmin(payload) {
  const response = await request(app).post('/api/auth/register-admin').send(payload);
  return response.body.data.token;
}

async function inviteAndAcceptPlayer(adminToken, email, fullName) {
  const inviteResponse = await request(app)
    .post('/api/auth/invitations')
    .set('Authorization', `Bearer ${adminToken}`)
    .set('Origin', 'http://localhost:5173')
    .send({
      fullName,
      email,
      role: 'player',
      teamId: '',
    });

  const invitationToken = inviteResponse.body.data.rawToken;

  await request(app)
    .post(`/api/auth/accept-invitation/${invitationToken}`)
    .send({
      fullName,
      password: 'Player@123!',
      confirmPassword: 'Player@123!',
    });
}

describe('AgriGuard club and player management backend', () => {
  test('admin can create, list, get, and update teams', async () => {
    const adminToken = await login('admin@agriguard.com', 'Admin@123!');
    const users = await listUsers(adminToken);
    const coachUser = users.find((entry) => entry.role === 'coach');

    const createResponse = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Falcons',
        coachUserId: coachUser.id,
      });

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.body.success).toBe(true);
    expect(createResponse.body.data.name).toBe('Falcons');
    expect(createResponse.body.data.coach_user_id).toBe(coachUser.id);

    const teamId = createResponse.body.data.id;

    const listResponse = await request(app).get('/api/teams').set('Authorization', `Bearer ${adminToken}`);
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.body.data).toHaveLength(1);
    expect(listResponse.body.data[0].players_count).toBe(0);
    expect(listResponse.body.data[0].coach.id).toBe(coachUser.id);

    const getResponse = await request(app).get(`/api/teams/${teamId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.body.data.id).toBe(teamId);
    expect(getResponse.body.data.players_count).toBe(0);
    expect(getResponse.body.data.roster).toHaveLength(0);

    const summaryResponse = await request(app).get('/api/teams/summary').set('Authorization', `Bearer ${adminToken}`);
    expect(summaryResponse.statusCode).toBe(200);
    expect(summaryResponse.body.data.total_teams).toBe(1);
    expect(summaryResponse.body.data.total_players).toBe(0);
    expect(summaryResponse.body.data.total_coaches).toBe(1);

    const updateResponse = await request(app)
      .patch(`/api/teams/${teamId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Falcons Elite',
      });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.body.data.name).toBe('Falcons Elite');

    const unassignCoachResponse = await request(app)
      .patch(`/api/teams/${teamId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        coachUserId: null,
      });

    expect(unassignCoachResponse.statusCode).toBe(200);
    expect(unassignCoachResponse.body.data.coach_user_id).toBeNull();

    const usersAfterUnassign = await listUsers(adminToken);
    expect(usersAfterUnassign.find((entry) => entry.id === coachUser.id).team).toBe('');

    const reassignCoachResponse = await request(app)
      .patch(`/api/teams/${teamId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        coachUserId: coachUser.id,
      });

    expect(reassignCoachResponse.statusCode).toBe(200);
    expect(reassignCoachResponse.body.data.coach_user_id).toBe(coachUser.id);

    const secondTeamResponse = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Rockets',
        coachUserId: null,
      });

    expect(secondTeamResponse.statusCode).toBe(201);

    const duplicateCoachResponse = await request(app)
      .patch(`/api/teams/${secondTeamResponse.body.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        coachUserId: coachUser.id,
      });

    expect(duplicateCoachResponse.statusCode).toBe(200);
    expect(duplicateCoachResponse.body.data.coach_user_id).toBe(coachUser.id);

    const usersAfterSecondAssignment = await listUsers(adminToken);
    expect(usersAfterSecondAssignment.find((entry) => entry.id === coachUser.id).team).toBe('Falcons Elite, Rockets');
  });

  test('admin can delete a team and clean up dependent records', async () => {
    const adminToken = await login('admin@agriguard.com', 'Admin@123!');
    const playerToken = await login('player@agriguard.com', 'Player@123!');
    const users = await listUsers(adminToken);
    const coachUser = users.find((entry) => entry.role === 'coach');
    const playerUser = users.find((entry) => entry.email === 'player@agriguard.com');

    const createTeamResponse = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Storm',
        coachUserId: coachUser.id,
      });

    expect(createTeamResponse.statusCode).toBe(201);
    const teamId = createTeamResponse.body.data.id;

    const createPlayerResponse = await request(app)
      .post('/api/players')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userId: playerUser.id,
        jerseyNumber: 12,
        preferredPosition: 'Middle Blocker',
      });

    expect(createPlayerResponse.statusCode).toBe(201);
    const playerId = createPlayerResponse.body.data.id;

    const addMembershipResponse = await request(app)
      .post(`/api/teams/${teamId}/players`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ playerId });

    expect(addMembershipResponse.statusCode).toBe(201);

    const inviteResponse = await request(app)
      .post('/api/auth/invitations')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Origin', 'http://localhost:5173')
      .send({
        fullName: 'Pending Storm Player',
        email: 'pending-storm-player@example.com',
        role: 'player',
        teamId,
      });

    expect(inviteResponse.statusCode).toBe(201);
    const invitationToken = inviteResponse.body.data.rawToken;

    const createEventResponse = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Storm Training',
        type: 'training',
        teamId,
        description: 'Court session',
        location: 'Main Gym',
        startTime: '2026-05-01T16:00:00.000Z',
        endTime: '2026-05-01T18:00:00.000Z',
      });

    expect(createEventResponse.statusCode).toBe(201);

    const createAnnouncementResponse = await request(app)
      .post('/api/announcements')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        teamId,
        title: 'Storm Update',
        message: 'Bring your training gear.',
      });

    expect(createAnnouncementResponse.statusCode).toBe(201);


    const notificationsBeforeDeleteResponse = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${playerToken}`);

    expect(notificationsBeforeDeleteResponse.statusCode).toBe(200);
    expect(notificationsBeforeDeleteResponse.body.data).toHaveLength(2);

    const deleteResponse = await request(app)
      .delete(`/api/teams/${teamId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.body.success).toBe(true);
    expect(deleteResponse.body.data.id).toBe(teamId);

    const getDeletedTeamResponse = await request(app)
      .get(`/api/teams/${teamId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(getDeletedTeamResponse.statusCode).toBe(404);

    const teamsAfterDeleteResponse = await request(app)
      .get('/api/teams')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(teamsAfterDeleteResponse.statusCode).toBe(200);
    expect(teamsAfterDeleteResponse.body.data).toHaveLength(0);

    const summaryAfterDeleteResponse = await request(app)
      .get('/api/teams/summary')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(summaryAfterDeleteResponse.statusCode).toBe(200);
    expect(summaryAfterDeleteResponse.body.data.total_teams).toBe(0);
    expect(summaryAfterDeleteResponse.body.data.total_players).toBe(1);
    expect(summaryAfterDeleteResponse.body.data.total_coaches).toBe(1);
    expect(summaryAfterDeleteResponse.body.data.assigned_players).toBe(0);
    expect(summaryAfterDeleteResponse.body.data.unassigned_players).toBe(1);

    const playersAfterDeleteResponse = await request(app)
      .get('/api/players')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(playersAfterDeleteResponse.statusCode).toBe(200);
    expect(playersAfterDeleteResponse.body.data).toHaveLength(1);
    expect(playersAfterDeleteResponse.body.data[0].id).toBe(playerId);
    expect(playersAfterDeleteResponse.body.data[0].team_membership).toBeNull();
    expect(playersAfterDeleteResponse.body.data[0].team).toBeNull();

    const eventsAfterDeleteResponse = await request(app)
      .get('/api/events')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(eventsAfterDeleteResponse.statusCode).toBe(200);
    expect(eventsAfterDeleteResponse.body.data).toHaveLength(0);

    const announcementsAfterDeleteResponse = await request(app)
      .get('/api/announcements')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(announcementsAfterDeleteResponse.statusCode).toBe(200);
    expect(announcementsAfterDeleteResponse.body.data).toHaveLength(0);


    const notificationsAfterDeleteResponse = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${playerToken}`);

    expect(notificationsAfterDeleteResponse.statusCode).toBe(200);
    expect(notificationsAfterDeleteResponse.body.data).toHaveLength(0);

    const usersAfterDelete = await listUsers(adminToken);
    expect(usersAfterDelete.find((entry) => entry.id === coachUser.id).team).toBe('');
    expect(usersAfterDelete.find((entry) => entry.id === playerUser.id).team).toBe('');

    const invitationAfterDeleteResponse = await request(app).get(`/api/auth/invitations/${invitationToken}`);
    expect(invitationAfterDeleteResponse.statusCode).toBe(404);
  });

  test('admin can create players, manage memberships, transfer players, and manage attributes', async () => {
    const adminToken = await login('admin@agriguard.com', 'Admin@123!');
    const users = await listUsers(adminToken);
    const coachUser = users.find((entry) => entry.role === 'coach');
    const playerUser = users.find((entry) => entry.email === 'player@agriguard.com');

    const teamOneResponse = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Eagles',
        coachUserId: coachUser.id,
      });

    const teamTwoResponse = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Tigers',
        coachUserId: null,
      });

    const teamOneId = teamOneResponse.body.data.id;
    const teamTwoId = teamTwoResponse.body.data.id;

    const createPlayerResponse = await request(app)
      .post('/api/players')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userId: playerUser.id,
        jerseyNumber: 7,
        preferredPosition: 'Setter',
      });

    expect(createPlayerResponse.statusCode).toBe(201);
    expect(createPlayerResponse.body.data.user_id).toBe(playerUser.id);

    const playerId = createPlayerResponse.body.data.id;

    const listPlayersResponse = await request(app).get('/api/players').set('Authorization', `Bearer ${adminToken}`);
    expect(listPlayersResponse.statusCode).toBe(200);
    expect(listPlayersResponse.body.data).toHaveLength(1);
    expect(listPlayersResponse.body.data[0].user.id).toBe(playerUser.id);
    expect(listPlayersResponse.body.data[0].team_membership).toBeNull();

    const addMembershipResponse = await request(app)
      .post(`/api/teams/${teamOneId}/players`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        playerId,
      });

    expect(addMembershipResponse.statusCode).toBe(201);
    expect(addMembershipResponse.body.data.team_id).toBe(teamOneId);

    const summaryAfterAddResponse = await request(app)
      .get('/api/teams/summary')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(summaryAfterAddResponse.statusCode).toBe(200);
    expect(summaryAfterAddResponse.body.data.total_teams).toBe(2);
    expect(summaryAfterAddResponse.body.data.total_players).toBe(1);
    expect(summaryAfterAddResponse.body.data.total_coaches).toBe(1);
    expect(summaryAfterAddResponse.body.data.assigned_players).toBe(1);
    expect(summaryAfterAddResponse.body.data.unassigned_players).toBe(0);

    const teamOneDetailResponse = await request(app)
      .get(`/api/teams/${teamOneId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(teamOneDetailResponse.statusCode).toBe(200);
    expect(teamOneDetailResponse.body.data.players_count).toBe(1);
    expect(teamOneDetailResponse.body.data.roster).toHaveLength(1);
    expect(teamOneDetailResponse.body.data.roster[0].player.id).toBe(playerId);
    expect(teamOneDetailResponse.body.data.roster[0].user.id).toBe(playerUser.id);

    const usersAfterAdd = await listUsers(adminToken);
    expect(usersAfterAdd.find((entry) => entry.id === playerUser.id).team).toBe('Eagles');

    const duplicateMembershipResponse = await request(app)
      .post(`/api/teams/${teamOneId}/players`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        playerId,
      });

    expect(duplicateMembershipResponse.statusCode).toBe(409);

    const attributesResponse = await request(app)
      .post(`/api/players/${playerId}/attributes`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        attackScore: 85,
        defenseScore: 77,
        serveScore: 81,
        blockScore: 74,
        staminaScore: 88,
        preferredPosition: 'Setter',
      });

    expect(attributesResponse.statusCode).toBe(201);
    expect(attributesResponse.body.data.attack_score).toBe(85);

    const updatePlayerResponse = await request(app)
      .patch(`/api/players/${playerId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        jerseyNumber: 10,
      });

    expect(updatePlayerResponse.statusCode).toBe(200);
    expect(updatePlayerResponse.body.data.jersey_number).toBe(10);

    const updateAttributesResponse = await request(app)
      .patch(`/api/players/${playerId}/attributes`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        serveScore: 91,
      });

    expect(updateAttributesResponse.statusCode).toBe(200);
    expect(updateAttributesResponse.body.data.serve_score).toBe(91);

    const getAttributesResponse = await request(app)
      .get(`/api/players/${playerId}/attributes`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(getAttributesResponse.statusCode).toBe(200);
    expect(getAttributesResponse.body.data.player_id).toBe(playerId);

    const sameTeamTransferResponse = await request(app)
      .post(`/api/players/${playerId}/transfer`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetTeamId: teamOneId,
      });

    expect(sameTeamTransferResponse.statusCode).toBe(400);

    const transferResponse = await request(app)
      .post(`/api/players/${playerId}/transfer`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetTeamId: teamTwoId,
      });

    expect(transferResponse.statusCode).toBe(200);
    expect(transferResponse.body.data.team_id).toBe(teamTwoId);

    const getPlayerResponse = await request(app)
      .get(`/api/players/${playerId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(getPlayerResponse.statusCode).toBe(200);
    expect(getPlayerResponse.body.data.id).toBe(playerId);
    expect(getPlayerResponse.body.data.team_membership.team_id).toBe(teamTwoId);
    expect(getPlayerResponse.body.data.team.id).toBe(teamTwoId);

    const removeMembershipResponse = await request(app)
      .delete(`/api/teams/${teamTwoId}/players/${playerId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(removeMembershipResponse.statusCode).toBe(200);
    expect(removeMembershipResponse.body.data.team_id).toBe(teamTwoId);

    const summaryAfterRemoveResponse = await request(app)
      .get('/api/teams/summary')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(summaryAfterRemoveResponse.statusCode).toBe(200);
    expect(summaryAfterRemoveResponse.body.data.assigned_players).toBe(0);
    expect(summaryAfterRemoveResponse.body.data.unassigned_players).toBe(1);

    const usersAfterRemove = await listUsers(adminToken);
    expect(usersAfterRemove.find((entry) => entry.id === playerUser.id).team).toBe('');

    const transferWithoutMembershipResponse = await request(app)
      .post(`/api/players/${playerId}/transfer`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetTeamId: teamOneId,
      });

    expect(transferWithoutMembershipResponse.statusCode).toBe(400);
  });

  test('non-player roles are excluded from player rosters even if a stale player record exists', async () => {
    const adminToken = await login('admin@agriguard.com', 'Admin@123!');
    const users = await listUsers(adminToken);
    const coachUser = users.find((entry) => entry.role === 'coach');
    const playerUser = users.find((entry) => entry.email === 'player@agriguard.com');

    const teamResponse = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Guardians',
        coachUserId: coachUser.id,
      });

    expect(teamResponse.statusCode).toBe(201);

    const createPlayerResponse = await request(app)
      .post('/api/players')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userId: playerUser.id,
        jerseyNumber: 15,
        preferredPosition: 'Opposite',
      });

    expect(createPlayerResponse.statusCode).toBe(201);

    const roleUpdateResponse = await request(app)
      .patch(`/api/auth/users/${playerUser.id}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        role: 'coach',
        teamId: '',
      });

    expect(roleUpdateResponse.statusCode).toBe(200);
    expect(roleUpdateResponse.body.data.role).toBe('coach');

    const listPlayersResponse = await request(app)
      .get('/api/players')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listPlayersResponse.statusCode).toBe(200);
    expect(listPlayersResponse.body.data).toHaveLength(0);

    const addMembershipResponse = await request(app)
      .post(`/api/teams/${teamResponse.body.data.id}/players`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        playerId: createPlayerResponse.body.data.id,
      });

    expect(addMembershipResponse.statusCode).toBe(400);
    expect(addMembershipResponse.body.message).toBe('Only users with the player role can be added to a team.');
  });

  test('coach can manage roster for their own team but cannot create teams', async () => {
    const adminToken = await login('admin@agriguard.com', 'Admin@123!');
    const coachToken = await login('coach@agriguard.com', 'Coach@123!');
    const users = await listUsers(adminToken);
    const coachUser = users.find((entry) => entry.role === 'coach');
    const playerUser = users.find((entry) => entry.email === 'player@agriguard.com');

    const teamResponse = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Viewable Team',
        coachUserId: coachUser.id,
      });

    const createPlayerResponse = await request(app)
      .post('/api/players')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userId: playerUser.id,
        jerseyNumber: 4,
        preferredPosition: 'Outside Hitter',
      });

    const teamId = teamResponse.body.data.id;
    const playerId = createPlayerResponse.body.data.id;

    const listResponse = await request(app).get('/api/teams').set('Authorization', `Bearer ${coachToken}`);
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.body.data.length).toBeGreaterThan(0);
    expect(listResponse.body.data.every((team) => team.coach_user_id === coachUser.id)).toBe(true);
    expect(listResponse.body.data.some((team) => team.id === teamId)).toBe(true);

    const summaryResponse = await request(app).get('/api/teams/summary').set('Authorization', `Bearer ${coachToken}`);
    expect(summaryResponse.statusCode).toBe(200);
    expect(summaryResponse.body.data.total_teams).toBe(1);
    expect(summaryResponse.body.data.total_coaches).toBe(1);

    const createResponse = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({
        name: 'Blocked Team',
      });

    expect(createResponse.statusCode).toBe(403);
    expect(createResponse.body.success).toBe(false);

    const deleteResponse = await request(app)
      .delete(`/api/teams/${teamId}`)
      .set('Authorization', `Bearer ${coachToken}`);

    expect(deleteResponse.statusCode).toBe(403);

    const addMembershipResponse = await request(app)
      .post(`/api/teams/${teamId}/players`)
      .set('Authorization', `Bearer ${coachToken}`)
      .send({
        playerId,
      });

    expect(addMembershipResponse.statusCode).toBe(201);

    const updatePlayerResponse = await request(app)
      .patch(`/api/players/${playerId}`)
      .set('Authorization', `Bearer ${coachToken}`)
      .send({
        jerseyNumber: 9,
        preferredPosition: 'Setter',
      });

    expect(updatePlayerResponse.statusCode).toBe(200);
    expect(updatePlayerResponse.body.data.jersey_number).toBe(9);

    const removeMembershipResponse = await request(app)
      .delete(`/api/teams/${teamId}/players/${playerId}`)
      .set('Authorization', `Bearer ${coachToken}`);

    expect(removeMembershipResponse.statusCode).toBe(200);
  });

  test('coach cannot assign a duplicate jersey number within the same team', async () => {
    const adminToken = await login('admin@agriguard.com', 'Admin@123!');
    const coachToken = await login('coach@agriguard.com', 'Coach@123!');
    const users = await listUsers(adminToken);
    const firstPlayerUser = users.find((entry) => entry.email === 'player@agriguard.com');

    const secondInviteResponse = await request(app)
      .post('/api/auth/invite')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fullName: 'Second Team Player',
        email: 'duplicate-jersey@example.com',
        role: 'player',
      });

    const acceptSecondInviteResponse = await request(app)
      .post(`/api/auth/accept-invitation/${secondInviteResponse.body.data.token}`)
      .send({
        password: 'Player@123!',
        confirmPassword: 'Player@123!',
      });

    const secondPlayerUserId = acceptSecondInviteResponse.body.data.user.id;

    const firstPlayerResponse = await request(app)
      .post('/api/players')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userId: firstPlayerUser.id,
        jerseyNumber: 7,
        preferredPosition: 'Setter',
      });

    const secondPlayerResponse = await request(app)
      .post('/api/players')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userId: secondPlayerUserId,
        jerseyNumber: 12,
        preferredPosition: 'Libero',
      });

    const teamResponse = await request(app)
      .get('/api/teams')
      .set('Authorization', `Bearer ${coachToken}`);

    const coachedTeamId = teamResponse.body.data[0].id;
    const firstPlayerId = firstPlayerResponse.body.data.id;
    const secondPlayerId = secondPlayerResponse.body.data.id;

    await request(app)
      .post(`/api/teams/${coachedTeamId}/players`)
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ playerId: firstPlayerId });

    await request(app)
      .post(`/api/teams/${coachedTeamId}/players`)
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ playerId: secondPlayerId });

    const updatePlayerResponse = await request(app)
      .patch(`/api/players/${secondPlayerId}`)
      .set('Authorization', `Bearer ${coachToken}`)
      .send({
        jerseyNumber: 7,
      });

    expect(updatePlayerResponse.statusCode).toBe(409);
    expect(updatePlayerResponse.body.errors.jerseyNumber).toBe(
      'This jersey number is already assigned to another player on this team.'
    );
  });

  test('coach cannot manage another coach team roster', async () => {
    const adminToken = await login('admin@agriguard.com', 'Admin@123!');
    const coachToken = await login('coach@agriguard.com', 'Coach@123!');
    const users = await listUsers(adminToken);
    const playerUser = users.find((entry) => entry.email === 'player@agriguard.com');

    const teamResponse = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Unassigned Coach Team',
        coachUserId: null,
      });

    const createPlayerResponse = await request(app)
      .post('/api/players')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userId: playerUser.id,
        jerseyNumber: 2,
        preferredPosition: 'Libero',
      });

    const teamId = teamResponse.body.data.id;
    const playerId = createPlayerResponse.body.data.id;

    const addMembershipResponse = await request(app)
      .post(`/api/teams/${teamId}/players`)
      .set('Authorization', `Bearer ${coachToken}`)
      .send({
        playerId,
      });

    expect(addMembershipResponse.statusCode).toBe(403);

    const updatePlayerResponse = await request(app)
      .patch(`/api/players/${playerId}`)
      .set('Authorization', `Bearer ${coachToken}`)
      .send({
        jerseyNumber: 11,
      });

    expect(updatePlayerResponse.statusCode).toBe(403);
  });

  test('club scoping is enforced for team and player queries and membership operations', async () => {
    const adminToken = await login('admin@agriguard.com', 'Admin@123!');
    const secondAdminToken = await registerAdmin({
      fullName: 'Second Admin',
      email: 'second-admin@example.com',
      password: 'StrongPass@123',
      confirmPassword: 'StrongPass@123',
      clubName: 'Second Club',
      city: 'Byblos',
    });

    await inviteAndAcceptPlayer(secondAdminToken, 'second-player@example.com', 'Second Player');

    const firstClubUsers = await listUsers(adminToken);
    const secondClubUsers = await listUsers(secondAdminToken);
    const firstCoach = firstClubUsers.find((entry) => entry.role === 'coach');
    const secondPlayerUser = secondClubUsers.find((entry) => entry.email === 'second-player@example.com');

    const firstTeamResponse = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'First Club Team',
        coachUserId: firstCoach.id,
      });

    const secondTeamResponse = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${secondAdminToken}`)
      .send({
        name: 'Second Club Team',
        coachUserId: null,
      });

    const secondPlayersResponse = await request(app)
      .get('/api/players')
      .set('Authorization', `Bearer ${secondAdminToken}`)
      .send();

    const secondTeamId = secondTeamResponse.body.data.id;
    const secondPlayerRecord = secondPlayersResponse.body.data.find((entry) => entry.user.id === secondPlayerUser.id);
    const secondPlayerId = secondPlayerRecord.id;

    await request(app)
      .post(`/api/teams/${secondTeamId}/players`)
      .set('Authorization', `Bearer ${secondAdminToken}`)
      .send({
        playerId: secondPlayerId,
      });

    const firstClubTeamsResponse = await request(app)
      .get('/api/teams')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(firstClubTeamsResponse.statusCode).toBe(200);
    expect(firstClubTeamsResponse.body.data).toHaveLength(1);
    expect(firstClubTeamsResponse.body.data[0].id).toBe(firstTeamResponse.body.data.id);
    expect(firstClubTeamsResponse.body.data[0].players_count).toBe(0);

    const firstClubPlayersResponse = await request(app)
      .get('/api/players')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(firstClubPlayersResponse.statusCode).toBe(200);
    expect(firstClubPlayersResponse.body.data).toHaveLength(0);

    const otherClubTeamResponse = await request(app)
      .get(`/api/teams/${secondTeamId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(otherClubTeamResponse.statusCode).toBe(404);

    const otherClubPlayerResponse = await request(app)
      .get(`/api/players/${secondPlayerId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(otherClubPlayerResponse.statusCode).toBe(404);

    const crossClubMembershipAddResponse = await request(app)
      .post(`/api/teams/${secondTeamId}/players`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        playerId: secondPlayerId,
      });

    expect(crossClubMembershipAddResponse.statusCode).toBe(404);

    const crossClubMembershipDeleteResponse = await request(app)
      .delete(`/api/teams/${secondTeamId}/players/${secondPlayerId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(crossClubMembershipDeleteResponse.statusCode).toBe(404);

    const firstClubSummaryResponse = await request(app)
      .get('/api/teams/summary')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(firstClubSummaryResponse.statusCode).toBe(200);
    expect(firstClubSummaryResponse.body.data.total_teams).toBe(1);
    expect(firstClubSummaryResponse.body.data.total_players).toBe(0);
    expect(firstClubSummaryResponse.body.data.total_coaches).toBe(1);
  });
});

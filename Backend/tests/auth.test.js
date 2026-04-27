process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';
process.env.EMAIL_ENABLED = 'false';

const request = require('supertest');
const app = require('../src/app');
const { resetDb } = require('../src/data/store');

jest.setTimeout(15000);

beforeEach(async () => {
  await resetDb();
});

async function loginAsAdmin() {
  const response = await request(app).post('/api/auth/login').send({
    email: 'admin@agriguard.com',
    password: 'Admin@123!',
  });

  return response.body.data.token;
}

describe('AgriGuard auth backend', () => {
  test('logs in with seeded admin credentials', async () => {
    const response = await request(app).post('/api/auth/login').send({
      email: 'admin@agriguard.com',
      password: 'Admin@123!',
    });

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user.role).toBe('admin');
  });

  test('registers a new admin and creates a club', async () => {
    const response = await request(app).post('/api/auth/register-admin').send({
      fullName: 'Hasan S',
      email: 'hasan@example.com',
      password: 'StrongPass@123',
      confirmPassword: 'StrongPass@123',
      clubName: 'Spike Lab',
      city: 'Beirut',
    });

    expect(response.statusCode).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user.role).toBe('admin');
    expect(response.body.data.user.clubId).toBeTruthy();
  });

  test('creates and accepts an invitation', async () => {
    const token = await loginAsAdmin();

    const teamResponse = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Tigers',
        coachUserId: null,
      });

    const inviteResponse = await request(app)
      .post('/api/auth/invitations')
      .set('Authorization', `Bearer ${token}`)
      .set('Origin', 'http://localhost:5173')
      .send({
        fullName: 'Maya Coach',
        email: 'maya@agriguard.com',
        role: 'coach',
        teamId: teamResponse.body.data.id,
      });

    expect(inviteResponse.statusCode).toBe(201);
    expect(inviteResponse.body.success).toBe(true);

    const rawInviteToken = inviteResponse.body.data.rawToken;

    const acceptResponse = await request(app)
      .post(`/api/auth/accept-invitation/${rawInviteToken}`)
      .send({
        fullName: 'Maya Coach',
        password: 'CoachPass@123',
        confirmPassword: 'CoachPass@123',
      });

    expect(acceptResponse.statusCode).toBe(200);
    expect(acceptResponse.body.success).toBe(true);
    expect(acceptResponse.body.data.user.role).toBe('coach');
    expect(acceptResponse.body.data.user.team).toBe('Tigers');

    const teamDetailResponse = await request(app)
      .get(`/api/teams/${teamResponse.body.data.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(teamDetailResponse.statusCode).toBe(200);
    expect(teamDetailResponse.body.data.coach_user_id).toBe(acceptResponse.body.data.user.id);
  });

  test('creates and accepts a coach invitation without assigning a team', async () => {
    const token = await loginAsAdmin();

    const inviteResponse = await request(app)
      .post('/api/auth/invitations')
      .set('Authorization', `Bearer ${token}`)
      .set('Origin', 'http://localhost:5173')
      .send({
        fullName: 'No Team Coach',
        email: 'noteam-coach@agriguard.com',
        role: 'coach',
        teamId: '',
      });

    expect(inviteResponse.statusCode).toBe(201);
    expect(inviteResponse.body.success).toBe(true);
    expect(inviteResponse.body.data.invitation.team).toBe('');

    const rawInviteToken = inviteResponse.body.data.rawToken;

    const acceptResponse = await request(app)
      .post(`/api/auth/accept-invitation/${rawInviteToken}`)
      .send({
        fullName: 'No Team Coach',
        password: 'CoachPass@123',
        confirmPassword: 'CoachPass@123',
      });

    expect(acceptResponse.statusCode).toBe(200);
    expect(acceptResponse.body.success).toBe(true);
    expect(acceptResponse.body.data.user.role).toBe('coach');
    expect(acceptResponse.body.data.user.team).toBe('');
  });

  test('creates a player record and membership when a team-linked player invitation is accepted', async () => {
    const token = await loginAsAdmin();

    const teamResponse = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Falcons',
        coachUserId: null,
      });

    const inviteResponse = await request(app)
      .post('/api/auth/invitations')
      .set('Authorization', `Bearer ${token}`)
      .set('Origin', 'http://localhost:5173')
      .send({
        fullName: 'Nora Player',
        email: 'nora@agriguard.com',
        role: 'player',
        teamId: teamResponse.body.data.id,
      });

    expect(inviteResponse.statusCode).toBe(201);
    expect(inviteResponse.body.success).toBe(true);

    const rawInviteToken = inviteResponse.body.data.rawToken;

    const acceptResponse = await request(app)
      .post(`/api/auth/accept-invitation/${rawInviteToken}`)
      .send({
        fullName: 'Nora Player',
        password: 'PlayerPass@123',
        confirmPassword: 'PlayerPass@123',
      });

    expect(acceptResponse.statusCode).toBe(200);
    expect(acceptResponse.body.data.user.role).toBe('player');
    expect(acceptResponse.body.data.user.team).toBe('Falcons');

    const playersResponse = await request(app)
      .get('/api/players')
      .set('Authorization', `Bearer ${token}`);

    expect(playersResponse.statusCode).toBe(200);
    expect(playersResponse.body.data).toHaveLength(1);
    expect(playersResponse.body.data[0].user.email).toBe('nora@agriguard.com');
    expect(playersResponse.body.data[0].team_membership).not.toBeNull();
    expect(playersResponse.body.data[0].team.id).toBe(teamResponse.body.data.id);

    const teamDetailResponse = await request(app)
      .get(`/api/teams/${teamResponse.body.data.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(teamDetailResponse.statusCode).toBe(200);
    expect(teamDetailResponse.body.data.players_count).toBe(1);
    expect(teamDetailResponse.body.data.roster).toHaveLength(1);
  });

  test('rejects invitations linked to non-existent teams', async () => {
    const token = await loginAsAdmin();

    const inviteResponse = await request(app)
      .post('/api/auth/invitations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        fullName: 'Ghost Player',
        email: 'ghost@agriguard.com',
        role: 'player',
        teamId: 'team-does-not-exist',
      });

    expect(inviteResponse.statusCode).toBe(404);
    expect(inviteResponse.body.success).toBe(false);
  });

  test('updating a player to no team removes the real team membership', async () => {
    const token = await loginAsAdmin();

    const usersResponse = await request(app)
      .get('/api/auth/users')
      .set('Authorization', `Bearer ${token}`);

    const playerUser = usersResponse.body.data.find((entry) => entry.email === 'player@agriguard.com');

    const teamResponse = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Sharks',
        coachUserId: null,
      });

    const createPlayerResponse = await request(app)
      .post('/api/players')
      .set('Authorization', `Bearer ${token}`)
      .send({
        userId: playerUser.id,
        jerseyNumber: 9,
        preferredPosition: 'Setter',
      });

    const playerId = createPlayerResponse.body.data.id;

    await request(app)
      .post(`/api/teams/${teamResponse.body.data.id}/players`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        playerId,
      });

    const updateResponse = await request(app)
      .patch(`/api/auth/users/${playerUser.id}/role`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        role: 'player',
        teamId: '',
      });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.body.data.team).toBe('');

    const teamDetailResponse = await request(app)
      .get(`/api/teams/${teamResponse.body.data.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(teamDetailResponse.statusCode).toBe(200);
    expect(teamDetailResponse.body.data.roster).toHaveLength(0);

    const playersResponse = await request(app)
      .get('/api/players')
      .set('Authorization', `Bearer ${token}`);

    expect(playersResponse.statusCode).toBe(200);
    expect(playersResponse.body.data[0].team_membership).toBeNull();
  });

  test('updating a user to coach with no team clears their active team membership', async () => {
    const token = await loginAsAdmin();

    const usersResponse = await request(app)
      .get('/api/auth/users')
      .set('Authorization', `Bearer ${token}`);

    const playerUser = usersResponse.body.data.find((entry) => entry.email === 'player@agriguard.com');

    const teamResponse = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Cougars',
        coachUserId: null,
      });

    const createPlayerResponse = await request(app)
      .post('/api/players')
      .set('Authorization', `Bearer ${token}`)
      .send({
        userId: playerUser.id,
        jerseyNumber: 3,
        preferredPosition: 'Libero',
      });

    const playerId = createPlayerResponse.body.data.id;

    await request(app)
      .post(`/api/teams/${teamResponse.body.data.id}/players`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        playerId,
      });

    const updateResponse = await request(app)
      .patch(`/api/auth/users/${playerUser.id}/role`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        role: 'coach',
        teamId: '',
      });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.body.data.role).toBe('coach');
    expect(updateResponse.body.data.team).toBe('');

    const teamDetailResponse = await request(app)
      .get(`/api/teams/${teamResponse.body.data.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(teamDetailResponse.statusCode).toBe(200);
    expect(teamDetailResponse.body.data.coach_user_id).toBeNull();
    expect(teamDetailResponse.body.data.roster).toHaveLength(0);
  });

  test('updating an existing coach preserves all of their team assignments when no new team is selected', async () => {
    const token = await loginAsAdmin();

    const usersResponse = await request(app)
      .get('/api/auth/users')
      .set('Authorization', `Bearer ${token}`);

    const coachUser = usersResponse.body.data.find((entry) => entry.email === 'coach@agriguard.com');

    const firstTeamResponse = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Alpha',
        coachUserId: coachUser.id,
      });

    const secondTeamResponse = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Beta',
        coachUserId: coachUser.id,
      });

    expect(firstTeamResponse.statusCode).toBe(201);
    expect(secondTeamResponse.statusCode).toBe(201);

    const updateResponse = await request(app)
      .patch(`/api/auth/users/${coachUser.id}/role`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        role: 'coach',
        teamId: '',
      });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.body.data.role).toBe('coach');
    expect(updateResponse.body.data.team).toBe('Alpha, Beta');

    const firstTeamDetailResponse = await request(app)
      .get(`/api/teams/${firstTeamResponse.body.data.id}`)
      .set('Authorization', `Bearer ${token}`);

    const secondTeamDetailResponse = await request(app)
      .get(`/api/teams/${secondTeamResponse.body.data.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(firstTeamDetailResponse.statusCode).toBe(200);
    expect(firstTeamDetailResponse.body.data.coach_user_id).toBe(coachUser.id);
    expect(secondTeamDetailResponse.statusCode).toBe(200);
    expect(secondTeamDetailResponse.body.data.coach_user_id).toBe(coachUser.id);
  });

  test('list users reflects real team membership changes made through the teams module', async () => {
    const token = await loginAsAdmin();

    const usersResponse = await request(app)
      .get('/api/auth/users')
      .set('Authorization', `Bearer ${token}`);

    const playerUser = usersResponse.body.data.find((entry) => entry.email === 'player@agriguard.com');

    const teamResponse = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Rockets',
        coachUserId: null,
      });

    const createPlayerResponse = await request(app)
      .post('/api/players')
      .set('Authorization', `Bearer ${token}`)
      .send({
        userId: playerUser.id,
        jerseyNumber: 11,
        preferredPosition: 'Outside Hitter',
      });

    await request(app)
      .post(`/api/teams/${teamResponse.body.data.id}/players`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        playerId: createPlayerResponse.body.data.id,
      });

    const refreshedUsersResponse = await request(app)
      .get('/api/auth/users')
      .set('Authorization', `Bearer ${token}`);

    const refreshedPlayer = refreshedUsersResponse.body.data.find((entry) => entry.id === playerUser.id);

    expect(refreshedUsersResponse.statusCode).toBe(200);
    expect(refreshedPlayer.team).toBe('Rockets');
  });

  test('admin can delete coach and player users with related team data cleanup', async () => {
    const token = await loginAsAdmin();

    const usersResponse = await request(app)
      .get('/api/auth/users')
      .set('Authorization', `Bearer ${token}`);

    const coachUser = usersResponse.body.data.find((entry) => entry.email === 'coach@agriguard.com');
    const playerUser = usersResponse.body.data.find((entry) => entry.email === 'player@agriguard.com');

    const teamResponse = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Delete Test Team',
        coachUserId: coachUser.id,
      });

    const createPlayerResponse = await request(app)
      .post('/api/players')
      .set('Authorization', `Bearer ${token}`)
      .send({
        userId: playerUser.id,
        jerseyNumber: 14,
        preferredPosition: 'Middle Blocker',
      });

    await request(app)
      .post(`/api/teams/${teamResponse.body.data.id}/players`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        playerId: createPlayerResponse.body.data.id,
      });

    const deleteCoachResponse = await request(app)
      .delete(`/api/auth/users/${coachUser.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(deleteCoachResponse.statusCode).toBe(200);
    expect(deleteCoachResponse.body.success).toBe(true);
    expect(deleteCoachResponse.body.data.id).toBe(coachUser.id);

    const teamAfterCoachDeleteResponse = await request(app)
      .get(`/api/teams/${teamResponse.body.data.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(teamAfterCoachDeleteResponse.statusCode).toBe(200);
    expect(teamAfterCoachDeleteResponse.body.data.coach_user_id).toBeNull();

    const deletePlayerResponse = await request(app)
      .delete(`/api/auth/users/${playerUser.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(deletePlayerResponse.statusCode).toBe(200);
    expect(deletePlayerResponse.body.success).toBe(true);
    expect(deletePlayerResponse.body.data.id).toBe(playerUser.id);

    const teamAfterPlayerDeleteResponse = await request(app)
      .get(`/api/teams/${teamResponse.body.data.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(teamAfterPlayerDeleteResponse.statusCode).toBe(200);
    expect(teamAfterPlayerDeleteResponse.body.data.roster).toHaveLength(0);

    const playersResponse = await request(app)
      .get('/api/players')
      .set('Authorization', `Bearer ${token}`);

    expect(playersResponse.statusCode).toBe(200);
    expect(playersResponse.body.data).toHaveLength(0);

    const refreshedUsersResponse = await request(app)
      .get('/api/auth/users')
      .set('Authorization', `Bearer ${token}`);

    expect(refreshedUsersResponse.statusCode).toBe(200);
    expect(refreshedUsersResponse.body.data.some((entry) => entry.id === coachUser.id)).toBe(false);
    expect(refreshedUsersResponse.body.data.some((entry) => entry.id === playerUser.id)).toBe(false);
  });

  test('blocks deleting the fixed admin account from the role assignment page', async () => {
    const token = await loginAsAdmin();

    const usersResponse = await request(app)
      .get('/api/auth/users')
      .set('Authorization', `Bearer ${token}`);

    const adminUser = usersResponse.body.data.find((entry) => entry.email === 'admin@agriguard.com');

    const response = await request(app)
      .delete(`/api/auth/users/${adminUser.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe('The club admin account is fixed and cannot be deleted from the role assignment page.');
  });

  test('blocks admin-only endpoint for player', async () => {
    const loginResponse = await request(app).post('/api/auth/login').send({
      email: 'player@agriguard.com',
      password: 'Player@123!',
    });
    const token = loginResponse.body.data.token;

    const response = await request(app)
      .get('/api/auth/users')
      .set('Authorization', `Bearer ${token}`);

    expect(response.statusCode).toBe(403);
    expect(response.body.success).toBe(false);
  });
});
